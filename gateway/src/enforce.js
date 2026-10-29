// Policy Enforcement Point (PEP): urutan pemeriksaan tiap request.
//   rute dikenal? -> access token valid? -> device terdaftar? (user) -> keputusan Policy Engine -> audit -> teruskan
const db = require('./db');
const cfg = require('./config');
const audit = require('./auditLog');
const tokens = require('./tokens');
const policy = require('./policy');

module.exports = function enforce(req, res, next) {
  const endpoint = `${req.method} ${req.originalUrl.split('?')[0]}`;
  const deviceId = req.get('x-device-id') || null;
  let subjek = 'anonim';

  const reject = (status, reason, message) => {
    audit.log({ subjek, endpoint, device_id: deviceId, hasil: 'deny', alasan: reason });
    return res.status(status).json({ error: message || 'Akses ditolak', alasan: reason });
  };

  try {
    // 1. Rute dikenal?
    const matched = policy.matchRoute(req.method, req.path);
    if (!matched) return reject(404, 'endpoint tidak dikenal (default deny)', 'Endpoint tidak ditemukan');

    // 2. Access token / token service
    const auth = req.get('authorization') || '';
    const m = /^Bearer (.+)$/i.exec(auth);
    if (!m) return reject(401, 'header Authorization: Bearer <token> tidak ada', 'Token diperlukan');
    let claims;
    try {
      claims = tokens.verifyToken(m[1]);
    } catch (e) {
      const expired = e.name === 'TokenExpiredError';
      return reject(401, expired ? 'token kedaluwarsa' : 'token tidak valid (tanda tangan/format salah)', 'Token tidak valid');
    }
    subjek = `${claims.role}:${claims.sub}`;

    // 3. Device terdaftar (hanya untuk request user; token service tidak punya device)
    if (claims.role !== 'service') {
      if (!deviceId) return reject(403, 'header X-Device-ID tidak ada', 'Device tidak terdaftar');
      const dev = db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?').get(Number(claims.sub), deviceId);
      if (!dev) return reject(403, 'device tidak terdaftar untuk user ini', 'Device tidak terdaftar');
    }

    // 4. Keputusan Policy Engine (membaca database untuk kepemilikan data)
    const d = policy.decide({ route: matched.route, params: matched.params, claims, query: req.query });
    if (!d.allow) return reject(d.status, d.reason, 'Akses ditolak oleh kebijakan');

    // 5. Audit "allow" dulu (jika gagal menulis audit -> catch di bawah -> request ditolak)
    audit.log({ subjek, endpoint, device_id: deviceId, hasil: 'allow', alasan: d.reason });

    // 6. Teruskan ke service dengan X-Gateway-Secret. Header palsu dari klien dibuang lebih dulu.
    delete req.headers['x-gateway-secret'];
    req.headers['x-gateway-secret'] = cfg.GATEWAY_SECRET;
    req.proxyTarget = matched.route.target === 'nilai' ? cfg.NILAI_URL : cfg.TRANSKRIP_URL;
    return next();
  } catch (err) {
    console.error('[enforce] error:', err);
    try { audit.log({ subjek, endpoint, device_id: deviceId, hasil: 'deny', alasan: 'kesalahan internal gateway (fail closed)' }); } catch (_) {}
    return res.status(500).json({ error: 'Kesalahan internal gateway' });
  }
};
