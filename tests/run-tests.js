// Pengujian otomatis end-to-end. Syarat: db sudah di-seed (npm run db:init) dan
// Gateway (3000), Service Nilai (3001), Service Transkrip (3002) sedang berjalan.
// Jalankan: npm test
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const GW = 'http://127.0.0.1:3000', NILAI = 'http://127.0.0.1:3001', TRANS = 'http://127.0.0.1:3002';
const { JWT_SECRET, GATEWAY_SECRET } = process.env;
const TZ = process.env.ACCESS_TIMEZONE || 'Asia/Jakarta';
const db = new Database(path.resolve(ROOT, process.env.DB_PATH || 'database/nilai.db'), { readonly: true });

const DEV = { admin: 'DEV-ADMIN-01', dosen1: 'DEV-DOSEN1-01', dosen2: 'DEV-DOSEN2-01', mhs1: 'DEV-MHS1-01', mhs2: 'DEV-MHS2-01', mhs3: 'DEV-MHS3-01' };
const PASS = { admin: 'Admin@123', dosen1: 'Dosen1@123', dosen2: 'Dosen2@123', mhs1: 'Mhs1@123', mhs2: 'Mhs2@123', mhs3: 'Mhs3@123' };
const NIM = { mhs1: '207006001', mhs2: '207006002', mhs3: '207006003' };

function inHours() { // sama logikanya dengan Gateway; membaca .env yang sama
  const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const now = +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value;
  const s = mins(process.env.ACCESS_START || '07:00'), e = mins(process.env.ACCESS_END || '21:00');
  return s <= e ? now >= s && now < e : now >= s || now < e;
}
const IN_HOURS = inHours();

async function call(method, url, { token, device, headers = {}, body } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (device) h['X-Device-ID'] = device;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch (_) {}
  return { status: r.status, json };
}
const login = async (u, device = DEV[u], password = PASS[u]) =>
  call('POST', `${GW}/auth/login`, { device, body: { username: u, password } });
const access = async (u) => (await login(u)).json.access_token;

let pass = 0, fail = 0; const failures = [];
function check(name, expected, actual, extra = '') {
  const ok = Array.isArray(expected) ? expected.includes(actual) : expected === actual;
  ok ? pass++ : (fail++, failures.push(name));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> HTTP ${actual} (diharapkan ${expected})${extra ? '  ' + extra : ''}`);
}
function checkTrue(name, cond, extra = '') {
  cond ? pass++ : (fail++, failures.push(name));
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}
const lastAudit = () => db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();
const forged = (payload, secret = JWT_SECRET, opts = {}) =>
  jwt.sign(payload, secret, { algorithm: 'HS256', issuer: 'zt-gateway', ...opts });
const nowSec = () => Math.floor(Date.now() / 1000);

(async () => {
  try { await fetch(`${GW}/health`); } catch { console.error('Gateway tidak aktif di port 3000. Jalankan semua service dulu.'); process.exit(2); }
  const st = db.prepare('SELECT SUM(is_final) f FROM grades').get();
  if (st.f > 0) { console.error('Database sudah berisi nilai final. Matikan service, jalankan "npm run db:init", nyalakan lagi, lalu "npm test".'); process.exit(2); }
  console.log(`Mode jam akses: sekarang ${IN_HOURS ? 'DALAM' : 'DI LUAR'} jam akses (${process.env.ACCESS_START}-${process.env.ACCESS_END} ${TZ})\n`);

  console.log('--- A. Autentikasi ---');
  let r = await login('mhs1'); check('A1 login berhasil', 200, r.status);
  const mhs1Refresh = r.json.refresh_token, mhs1Access = r.json.access_token;
  checkTrue('A1b access token berlaku 10 menit & memuat sub+role', (() => { const d = jwt.decode(mhs1Access); return d.exp - d.iat === 600 && d.sub && d.role === 'mahasiswa'; })());
  checkTrue('A1c refresh token disimpan di DB sebagai hash (bukan teks asli)', !db.prepare('SELECT 1 FROM refresh_tokens WHERE token_hash = ?').get(mhs1Refresh));
  check('A2 login password salah', 401, (await login('mhs1', DEV.mhs1, 'salah')).status);
  check('A3 login username tidak ada', 401, (await login('hantu', DEV.mhs1, 'x')).status);
  check('A4 login kredensial benar, device tidak terdaftar', 403, (await login('mhs1', 'DEV-ASING-99')).status);
  check('A5 login kredensial benar, device milik user lain', 403, (await login('mhs1', DEV.mhs2)).status);
  check('A6 login tanpa X-Device-ID', 403, (await call('POST', `${GW}/auth/login`, { body: { username: 'mhs1', password: PASS.mhs1 } })).status);
  r = await call('POST', `${GW}/auth/refresh`, { device: DEV.mhs1, body: { refresh_token: mhs1Refresh } });
  check('A7 refresh token valid', 200, r.status);
  check('A8 refresh token acak/tidak valid', 401, (await call('POST', `${GW}/auth/refresh`, { device: DEV.mhs1, body: { refresh_token: 'acak123' } })).status);
  check('A9 refresh dari device lain', 401, (await call('POST', `${GW}/auth/refresh`, { device: DEV.mhs2, body: { refresh_token: mhs1Refresh } })).status);
  check('A10 logout (cabut refresh token)', 200, (await call('POST', `${GW}/auth/logout`, { device: DEV.mhs1, body: { refresh_token: mhs1Refresh } })).status);
  check('A11 refresh setelah logout (sudah dicabut)', 401, (await call('POST', `${GW}/auth/refresh`, { device: DEV.mhs1, body: { refresh_token: mhs1Refresh } })).status);
  check('A12 logout kedua kali dengan token yang sama', 401, (await call('POST', `${GW}/auth/logout`, { device: DEV.mhs1, body: { refresh_token: mhs1Refresh } })).status);
  checkTrue('A13 refresh token tercatat dicabut di DB', !!db.prepare('SELECT 1 FROM refresh_tokens WHERE revoked_at IS NOT NULL').get());

  console.log('\n--- B. Token & device ---');
  const t = { mhs1: await access('mhs1'), mhs2: await access('mhs2'), dosen1: await access('dosen1'), dosen2: await access('dosen2'), admin: await access('admin') };
  check('B1 GET /nilai tanpa token', 401, (await call('GET', `${GW}/nilai`, { device: DEV.mhs1 })).status);
  check('B2 JWT kedaluwarsa', 401, (await call('GET', `${GW}/nilai`, { token: forged({ sub: '4', role: 'mahasiswa', iat: nowSec() - 1200, exp: nowSec() - 600 }), device: DEV.mhs1 })).status);
  checkTrue('B2b audit mencatat alasan "token kedaluwarsa"', /kedaluwarsa/.test(lastAudit().alasan) && lastAudit().hasil === 'deny');
  check('B3 JWT tanda tangan salah', 401, (await call('GET', `${GW}/nilai`, { token: forged({ sub: '4', role: 'mahasiswa' }, 'secret-palsu', { expiresIn: '10m' }), device: DEV.mhs1 })).status);
  check('B4 token sampah', 401, (await call('GET', `${GW}/nilai`, { token: 'bukan.jwt.valid', device: DEV.mhs1 })).status);
  check('B5 tanpa X-Device-ID', 403, (await call('GET', `${GW}/nilai`, { token: t.mhs1 })).status);
  check('B6 device tidak terdaftar', 403, (await call('GET', `${GW}/nilai`, { token: t.mhs1, device: 'DEV-ASING-99' })).status);
  check('B7 device milik user lain', 403, (await call('GET', `${GW}/nilai`, { token: t.mhs1, device: DEV.mhs2 })).status);
  checkTrue('B7b audit mencatat penolakan device', /device/.test(lastAudit().alasan) && lastAudit().hasil === 'deny');
  check('B8 endpoint tidak dikenal (default deny)', 404, (await call('GET', `${GW}/rahasia`, { token: t.mhs1, device: DEV.mhs1 })).status);

  console.log('\n--- C. Kebijakan akses (kepemilikan data) ---');
  r = await call('GET', `${GW}/nilai`, { token: t.mhs1, device: DEV.mhs1 });
  check('C1 mahasiswa melihat nilai sendiri', 200, r.status);
  checkTrue('C1b hanya NIM milik sendiri & 2 baris', r.json.data.length === 2 && r.json.data.every((x) => x.nim === NIM.mhs1), `(${r.json.data.length} baris)`);
  check('C2 mahasiswa minta nilai mahasiswa lain (?nim=)', 403, (await call('GET', `${GW}/nilai?nim=${NIM.mhs2}`, { token: t.mhs1, device: DEV.mhs1 })).status);
  r = await call('GET', `${GW}/nilai`, { token: t.dosen1, device: DEV.dosen1 });
  check('C3 dosen1 melihat nilai', 200, r.status);
  checkTrue('C3b dosen1 hanya melihat kelas KI101 (3 baris)', r.json.data.length === 3 && r.json.data.every((x) => x.kode === 'KI101'));
  const gradeKI = r.json.data.find((x) => x.nim === NIM.mhs1).id;
  const gradePW = (await call('GET', `${GW}/nilai`, { token: t.dosen2, device: DEV.dosen2 })).json.data[0].id;
  check('C4 dosen1 minta kelas dosen2 (?kelas_id=2)', 403, (await call('GET', `${GW}/nilai?kelas_id=2`, { token: t.dosen1, device: DEV.dosen1 })).status);
  check('C5 admin tidak boleh GET /nilai', 403, (await call('GET', `${GW}/nilai`, { token: t.admin, device: DEV.admin })).status);
  check('C6 mahasiswa tidak boleh PUT nilai', 403, (await call('PUT', `${GW}/nilai/${gradeKI}`, { token: t.mhs1, device: DEV.mhs1, body: { score: 100 } })).status);
  check('C7 dosen2 ubah nilai kelas dosen1', 403, (await call('PUT', `${GW}/nilai/${gradeKI}`, { token: t.dosen2, device: DEV.dosen2, body: { score: 100 } })).status);
  check('C8 dosen2 finalisasi kelas dosen1', 403, (await call('POST', `${GW}/kelas/1/finalisasi`, { token: t.dosen2, device: DEV.dosen2 })).status);
  check('C9 mahasiswa tidak boleh finalisasi', 403, (await call('POST', `${GW}/kelas/1/finalisasi`, { token: t.mhs1, device: DEV.mhs1 })).status);
  check('C10 PUT nilai yang tidak ada', 404, (await call('PUT', `${GW}/nilai/9999`, { token: t.dosen1, device: DEV.dosen1, body: { score: 90 } })).status);

  console.log(`\n--- D. Jam akses & finalisasi (${IN_HOURS ? 'dalam' : 'di luar'} jam akses) ---`);
  check('D1 dosen1 ubah nilai miliknya', IN_HOURS ? 200 : 403, (await call('PUT', `${GW}/nilai/${gradeKI}`, { token: t.dosen1, device: DEV.dosen1, body: { score: 91 } })).status);
  if (!IN_HOURS) checkTrue('D1b audit mencatat alasan "di luar jam akses"', /jam akses/.test(lastAudit().alasan) && lastAudit().hasil === 'deny');
  if (IN_HOURS) check('D2 skor tidak valid (150)', 400, (await call('PUT', `${GW}/nilai/${gradeKI}`, { token: t.dosen1, device: DEV.dosen1, body: { score: 150 } })).status);
  r = await call('POST', `${GW}/kelas/1/finalisasi`, { token: t.dosen1, device: DEV.dosen1 });
  check('D3 dosen1 finalisasi kelas KI101 + sinkron transkrip', IN_HOURS ? 200 : 403, r.status);
  check('D4 ubah nilai setelah finalisasi', IN_HOURS ? 409 : 403, (await call('PUT', `${GW}/nilai/${gradeKI}`, { token: t.dosen1, device: DEV.dosen1, body: { score: 50 } })).status);
  check('D5 finalisasi ulang', IN_HOURS ? 409 : 403, (await call('POST', `${GW}/kelas/1/finalisasi`, { token: t.dosen1, device: DEV.dosen1 })).status);
  r = await call('GET', `${GW}/transkrip/${NIM.mhs1}`, { token: t.mhs1, device: DEV.mhs1 });
  check('D6 mahasiswa melihat transkrip sendiri', 200, r.status);
  const adaKI = r.json.transkrip.some((x) => x.kode === 'KI101');
  checkTrue(`D6b transkrip ${IN_HOURS ? 'berisi' : 'belum berisi'} KI101 hasil sinkron`, adaKI === IN_HOURS);
  const svcAudit = db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE endpoint = 'POST /transkrip/sinkron' AND subjek LIKE 'service:%' AND hasil = 'allow'").get().n;
  checkTrue(`D7 sinkron memakai token service (audit subjek service:...)`, IN_HOURS ? svcAudit >= 1 : svcAudit === 0, `(${svcAudit} entri)`);

  console.log('\n--- E. Transkrip ---');
  check('E1 mahasiswa melihat transkrip mahasiswa lain', 403, (await call('GET', `${GW}/transkrip/${NIM.mhs2}`, { token: t.mhs1, device: DEV.mhs1 })).status);
  check('E2 admin melihat transkrip semua NIM (mhs3)', 200, (await call('GET', `${GW}/transkrip/${NIM.mhs3}`, { token: t.admin, device: DEV.admin })).status);
  check('E3 dosen tidak boleh lihat transkrip', 403, (await call('GET', `${GW}/transkrip/${NIM.mhs1}`, { token: t.dosen1, device: DEV.dosen1 })).status);
  check('E4 admin NIM tidak ada', 404, (await call('GET', `${GW}/transkrip/000000000`, { token: t.admin, device: DEV.admin })).status);

  console.log('\n--- F. Token service & sinkron ---');
  const payload = { kelas_id: 99, kode: 'TEST-SVC', nama: 'Uji Sinkron', entries: [{ nim: NIM.mhs3, score: 77 }] };
  for (const u of ['mhs1', 'dosen1', 'admin']) {
    check(`F1 token user (${u}) memanggil /transkrip/sinkron`, 403, (await call('POST', `${GW}/transkrip/sinkron`, { token: t[u] || await access(u), device: DEV[u], body: payload })).status);
  }
  r = await call('POST', `${GW}/auth/service`, { body: { client_id: 'service-nilai', client_secret: process.env.SERVICE_CLIENT_SECRET } });
  check('F2 /auth/service kredensial valid', 200, r.status);
  const svc = r.json.access_token; const sd = jwt.decode(svc);
  checkTrue('F2b token service role=service & berlaku 5 menit', sd.role === 'service' && sd.exp - sd.iat === 300);
  check('F3 /auth/service secret salah', 401, (await call('POST', `${GW}/auth/service`, { body: { client_id: 'service-nilai', client_secret: 'salah' } })).status);
  check('F4 /auth/service client id tidak dikenal', 401, (await call('POST', `${GW}/auth/service`, { body: { client_id: 'penyusup', client_secret: 'x' } })).status);
  check('F5 sinkron dengan token service valid', 200, (await call('POST', `${GW}/transkrip/sinkron`, { token: svc, body: payload })).status);
  check('F6 token service palsu (tanda tangan salah)', 401, (await call('POST', `${GW}/transkrip/sinkron`, { token: forged({ sub: 'service-nilai', role: 'service' }, 'palsu', { expiresIn: '5m' }), body: payload })).status);
  check('F7 token service kedaluwarsa', 401, (await call('POST', `${GW}/transkrip/sinkron`, { token: forged({ sub: 'service-nilai', role: 'service', iat: nowSec() - 900, exp: nowSec() - 600 }), body: payload })).status);
  check('F8 token service dipakai ke GET /nilai (least privilege)', 403, (await call('GET', `${GW}/nilai`, { token: svc })).status);
  check('F9 token service dengan client tidak terdaftar', 403, (await call('POST', `${GW}/transkrip/sinkron`, { token: forged({ sub: 'penyusup', role: 'service' }, JWT_SECRET, { expiresIn: '5m' }), body: payload })).status);

  console.log('\n--- G. Akses langsung ke service (bypass Gateway) ---');
  check('G1 langsung ke :3001 tanpa secret', 403, (await call('GET', `${NILAI}/nilai`, { token: t.dosen1 })).status);
  check('G2 langsung ke :3002 tanpa secret', 403, (await call('GET', `${TRANS}/transkrip/${NIM.mhs1}`, { token: t.admin })).status);
  check('G3 langsung ke :3001 dengan secret SALAH', 403, (await call('GET', `${NILAI}/nilai`, { token: t.dosen1, headers: { 'X-Gateway-Secret': 'tebakan' } })).status);
  check('G4 :3001 secret benar tapi tanpa token', 401, (await call('GET', `${NILAI}/nilai`, { headers: { 'X-Gateway-Secret': GATEWAY_SECRET } })).status);
  check('G5 :3002 secret benar tapi token palsu', 401, (await call('GET', `${TRANS}/transkrip/${NIM.mhs1}`, { token: forged({ sub: '1', role: 'admin' }, 'palsu', { expiresIn: '5m' }), headers: { 'X-Gateway-Secret': GATEWAY_SECRET } })).status);
  check('G6 :3002 secret benar, token kedaluwarsa', 401, (await call('GET', `${TRANS}/transkrip/${NIM.mhs1}`, { token: forged({ sub: '1', role: 'admin', iat: nowSec() - 900, exp: nowSec() - 600 }), headers: { 'X-Gateway-Secret': GATEWAY_SECRET } })).status);
  check('G7 :3002 sinkron, secret benar + token USER valid', 403, (await call('POST', `${TRANS}/transkrip/sinkron`, { token: t.admin, headers: { 'X-Gateway-Secret': GATEWAY_SECRET }, body: payload })).status);
  check('G8 :3001 mahasiswa+secret+token sendiri tapi ?nim= orang lain (cek di service)', 403, (await call('GET', `${NILAI}/nilai?nim=${NIM.mhs2}`, { token: t.mhs1, headers: { 'X-Gateway-Secret': GATEWAY_SECRET } })).status);
  check('G9 klien menyisipkan X-Gateway-Secret sendiri lewat Gateway tanpa token', 401, (await call('GET', `${GW}/nilai`, { headers: { 'X-Gateway-Secret': GATEWAY_SECRET } })).status);

  console.log('\n--- H. Audit log ---');
  const c = (q) => db.prepare(q).get().n;
  checkTrue('H1 ada entri allow', c("SELECT COUNT(*) n FROM audit_logs WHERE hasil='allow'") > 0);
  checkTrue('H2 ada entri deny: token tidak valid', c("SELECT COUNT(*) n FROM audit_logs WHERE hasil='deny' AND alasan LIKE 'token%'") > 0);
  checkTrue('H3 ada entri deny: device tidak terdaftar', c("SELECT COUNT(*) n FROM audit_logs WHERE hasil='deny' AND alasan LIKE '%device%'") > 0);
  checkTrue('H4 ada entri deny: kepemilikan data', c("SELECT COUNT(*) n FROM audit_logs WHERE hasil='deny' AND alasan LIKE '%tidak mengampu%'") > 0);
  checkTrue('H5 ada entri deny: token user ke sinkron', c("SELECT COUNT(*) n FROM audit_logs WHERE hasil='deny' AND alasan LIKE '%token service%'") > 0);
  checkTrue('H6 ada entri login gagal', c("SELECT COUNT(*) n FROM audit_logs WHERE hasil='deny' AND endpoint='POST /auth/login'") > 0);
  const a = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();
  checkTrue('H7 kolom audit lengkap (waktu, subjek, endpoint, hasil, alasan)', a.waktu && a.waktu_lokal && a.subjek && a.endpoint && a.hasil && a.alasan);

  console.log(`\n===== HASIL: ${pass} lulus, ${fail} gagal (mode ${IN_HOURS ? 'DALAM' : 'DI LUAR'} jam akses) =====`);
  if (fail) console.log('Gagal:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Runner error:', e); process.exit(2); });
