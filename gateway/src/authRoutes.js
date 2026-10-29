// Endpoint /auth/* (login, refresh, logout, service) - ditangani langsung oleh Gateway (PE/PA).
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const cfg = require('./config');
const audit = require('./auditLog');
const tokens = require('./tokens');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10); // supaya waktu respons tidak membocorkan user ada/tidak

function ctx(req, name) {
  return { endpoint: `POST /auth/${name}`, deviceId: req.get('x-device-id') || null };
}
function denyWith(req, res, name, status, publicMsg, reason, subjek = 'anonim') {
  const c = ctx(req, name);
  audit.log({ subjek, endpoint: c.endpoint, device_id: c.deviceId, hasil: 'deny', alasan: reason });
  return res.status(status).json({ error: publicMsg });
}
const isStr = (v) => typeof v === 'string' && v.length > 0;

// POST /auth/login  (header X-Device-ID, body: username, password)
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const { endpoint, deviceId } = ctx(req, 'login');
  if (!isStr(username) || !isStr(password)) {
    return denyWith(req, res, 'login', 400, 'username dan password wajib diisi', 'body login tidak lengkap');
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const okPass = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !okPass) {
    return denyWith(req, res, 'login', 401, 'Kredensial tidak valid',
      user ? 'password salah' : 'username tidak ditemukan', `login:${username.slice(0, 30)}`);
  }
  const subjek = `${user.role}:${user.id}`;
  if (!deviceId) {
    return denyWith(req, res, 'login', 403, 'Header X-Device-ID wajib ada', 'kredensial valid tetapi X-Device-ID tidak dikirim', subjek);
  }
  const dev = db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?').get(user.id, deviceId);
  if (!dev) {
    return denyWith(req, res, 'login', 403, 'Device tidak terdaftar untuk user ini', 'kredensial valid tetapi device tidak terdaftar untuk user', subjek);
  }

  const accessToken = tokens.signAccessToken(user);
  const refreshToken = tokens.newRefreshToken();
  const now = new Date();
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at, created_at) VALUES (?,?,?,?,?)')
    .run(user.id, tokens.hashToken(refreshToken), deviceId, new Date(now.getTime() + cfg.REFRESH_TTL_MS).toISOString(), now.toISOString());

  audit.log({ subjek, endpoint, device_id: deviceId, hasil: 'allow', alasan: 'login berhasil, token diterbitkan' });
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 600, refresh_token: refreshToken, role: user.role });
});

// Mencari refresh token yang masih valid. Mengembalikan { row } atau { fail }.
function lookupRefresh(req) {
  const rt = (req.body || {}).refresh_token;
  const deviceId = req.get('x-device-id') || null;
  if (!isStr(rt)) return { fail: 'refresh_token tidak dikirim' };
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokens.hashToken(rt));
  if (!row) return { fail: 'refresh token tidak dikenal' };
  const subjek = `user:${row.user_id}`;
  if (row.revoked_at) return { fail: 'refresh token sudah dicabut', subjek };
  if (new Date(row.expires_at) < new Date()) return { fail: 'refresh token kedaluwarsa', subjek };
  if (!deviceId) return { fail: 'X-Device-ID tidak dikirim', subjek };
  if (row.device_id !== deviceId) return { fail: 'device tidak cocok dengan device pemilik refresh token', subjek };
  return { row, subjek, deviceId };
}

// POST /auth/refresh  (header X-Device-ID, body: refresh_token)
router.post('/refresh', (req, res) => {
  const r = lookupRefresh(req);
  if (r.fail) return denyWith(req, res, 'refresh', 401, 'Refresh token tidak valid', r.fail, r.subjek);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.row.user_id);
  if (!user) return denyWith(req, res, 'refresh', 401, 'Refresh token tidak valid', 'user tidak ada lagi', r.subjek);
  audit.log({ subjek: r.subjek, endpoint: 'POST /auth/refresh', device_id: r.deviceId, hasil: 'allow', alasan: 'access token baru diterbitkan' });
  res.json({ access_token: tokens.signAccessToken(user), token_type: 'Bearer', expires_in: 600 });
});

// POST /auth/logout  (header X-Device-ID, body: refresh_token) -> mencabut refresh token
router.post('/logout', (req, res) => {
  const r = lookupRefresh(req);
  if (r.fail) return denyWith(req, res, 'logout', 401, 'Refresh token tidak valid', r.fail, r.subjek);
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), r.row.id);
  audit.log({ subjek: r.subjek, endpoint: 'POST /auth/logout', device_id: r.deviceId, hasil: 'allow', alasan: 'refresh token dicabut' });
  res.json({ message: 'Logout berhasil, refresh token dicabut' });
});

// POST /auth/service  (body: client_id, client_secret) -> token service 5 menit
router.post('/service', async (req, res) => {
  const { client_id, client_secret } = req.body || {};
  if (!isStr(client_id) || !isStr(client_secret)) {
    return denyWith(req, res, 'service', 400, 'client_id dan client_secret wajib diisi', 'body service tidak lengkap');
  }
  const client = db.prepare('SELECT * FROM service_clients WHERE client_id = ?').get(client_id);
  const ok = await bcrypt.compare(client_secret, client ? client.secret_hash : DUMMY_HASH);
  if (!client || !ok) {
    return denyWith(req, res, 'service', 401, 'Kredensial service tidak valid',
      client ? 'client secret salah' : 'client id tidak dikenal', `service:${client_id.slice(0, 30)}`);
  }
  audit.log({ subjek: `service:${client.client_id}`, endpoint: 'POST /auth/service', device_id: null, hasil: 'allow', alasan: 'token service diterbitkan' });
  res.json({ access_token: tokens.signServiceToken(client.client_id), token_type: 'Bearer', expires_in: 300 });
});

module.exports = router;
