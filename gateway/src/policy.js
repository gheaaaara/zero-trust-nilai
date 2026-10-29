// Policy Engine (PE): memutuskan allow/deny + alasan.
// Keputusan yang bergantung pada kepemilikan data dibuat dengan MEMBACA DATABASE,
// bukan hanya melihat isi token.
const db = require('./db');
const { checkAccessHours } = require('./accessHours');

// Tabel rute yang dikenal Gateway. Endpoint lain -> ditolak (default deny).
const ROUTES = [
  { id: 'nilai.list',        method: 'GET',  re: /^\/nilai\/?$/,                     target: 'nilai' },
  { id: 'nilai.update',      method: 'PUT',  re: /^\/nilai\/(\d+)\/?$/,              target: 'nilai', params: ['id'] },
  { id: 'kelas.finalisasi',  method: 'POST', re: /^\/kelas\/(\d+)\/finalisasi\/?$/,  target: 'nilai', params: ['id'] },
  { id: 'transkrip.get',     method: 'GET',  re: /^\/transkrip\/([A-Za-z0-9_-]{1,32})\/?$/, target: 'transkrip', params: ['nim'] },
  { id: 'transkrip.sinkron', method: 'POST', re: /^\/transkrip\/sinkron\/?$/,        target: 'transkrip' },
];

function matchRoute(method, path) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) {
      const params = {};
      (r.params || []).forEach((name, i) => { params[name] = m[i + 1]; });
      return { route: r, params };
    }
  }
  return null;
}

const allow = (reason) => ({ allow: true, status: 200, reason });
const deny = (status, reason) => ({ allow: false, status, reason });

const getUser = (id) => db.prepare('SELECT id, username, role, nim FROM users WHERE id = ?').get(Number(id));
const getClass = (id) => db.prepare('SELECT id, kode, dosen_id FROM classes WHERE id = ?').get(Number(id));

/**
 * @param route   rute yang cocok
 * @param params  parameter path (id / nim)
 * @param claims  isi JWT yang sudah diverifikasi { sub, role }
 * @param query   query string (req.query)
 */
function decide({ route, params, claims, query }) {
  const role = claims.role;

  // ---- Token service: hanya boleh ke /transkrip/sinkron ----
  if (role === 'service') {
    if (route.id !== 'transkrip.sinkron') return deny(403, 'token service hanya boleh memanggil POST /transkrip/sinkron');
    const client = db.prepare('SELECT 1 FROM service_clients WHERE client_id = ?').get(String(claims.sub));
    if (!client) return deny(403, 'client service tidak terdaftar');
    return allow('token service valid untuk sinkronisasi transkrip');
  }

  // ---- Token user: user harus ada & role di token harus sama dengan role di database ----
  if (!['mahasiswa', 'dosen', 'admin'].includes(role)) return deny(403, `role tidak dikenal: ${role}`);
  const user = getUser(claims.sub);
  if (!user) return deny(401, 'user pada token tidak ditemukan di database');
  if (user.role !== role) return deny(403, 'role pada token tidak sesuai dengan database');

  switch (route.id) {
    case 'nilai.list': {
      if (!['mahasiswa', 'dosen'].includes(role)) return deny(403, `role ${role} tidak boleh melihat nilai`);
      for (const k of ['nim', 'kelas_id']) {
        if (query[k] !== undefined && typeof query[k] !== 'string') return deny(400, `parameter ${k} tidak valid`);
      }
      if (role === 'mahasiswa') {
        if (query.nim !== undefined && query.nim !== user.nim) return deny(403, 'mahasiswa hanya boleh melihat nilai miliknya sendiri');
        return allow('mahasiswa melihat nilai miliknya');
      }
      if (query.kelas_id !== undefined) {
        const kelas = getClass(query.kelas_id);
        if (!kelas) return deny(404, 'kelas tidak ditemukan');
        if (kelas.dosen_id !== user.id) return deny(403, 'dosen tidak mengampu kelas ini');
      }
      return allow('dosen melihat nilai kelas yang diampunya');
    }

    case 'nilai.update': {
      if (role !== 'dosen') return deny(403, `role ${role} tidak boleh mengubah nilai`);
      const g = db.prepare('SELECT g.id, g.is_final, c.dosen_id FROM grades g JOIN classes c ON c.id = g.class_id WHERE g.id = ?').get(Number(params.id));
      if (!g) return deny(404, 'data nilai tidak ditemukan');
      if (g.dosen_id !== user.id) return deny(403, 'dosen tidak mengampu kelas dari nilai ini');
      if (g.is_final) return deny(409, 'nilai sudah difinalisasi, tidak boleh diubah');
      const t = checkAccessHours();
      if (!t.ok) return deny(403, `di luar jam akses (sekarang ${t.localTime}, jam akses ${t.window})`);
      return allow('dosen pengampu, nilai belum final, dalam jam akses');
    }

    case 'kelas.finalisasi': {
      if (role !== 'dosen') return deny(403, `role ${role} tidak boleh memfinalisasi nilai`);
      const kelas = getClass(params.id);
      if (!kelas) return deny(404, 'kelas tidak ditemukan');
      if (kelas.dosen_id !== user.id) return deny(403, 'dosen tidak mengampu kelas ini');
      const s = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(is_final),0) AS fin FROM grades WHERE class_id = ?').get(kelas.id);
      if (s.total === 0) return deny(409, 'kelas tidak memiliki data nilai');
      if (s.fin === s.total) return deny(409, 'kelas sudah difinalisasi sebelumnya');
      const t = checkAccessHours();
      if (!t.ok) return deny(403, `di luar jam akses (sekarang ${t.localTime}, jam akses ${t.window})`);
      return allow('dosen pengampu, dalam jam akses');
    }

    case 'transkrip.get': {
      if (role === 'admin') return allow('admin boleh melihat transkrip semua mahasiswa');
      if (role === 'mahasiswa') {
        if (params.nim !== user.nim) return deny(403, 'mahasiswa hanya boleh melihat transkrip dengan NIM miliknya');
        return allow('mahasiswa melihat transkrip miliknya');
      }
      return deny(403, `role ${role} tidak boleh melihat transkrip`);
    }

    case 'transkrip.sinkron':
      return deny(403, 'endpoint sinkron hanya untuk token service, token user ditolak');

    default:
      return deny(403, 'tidak ada kebijakan untuk rute ini (default deny)');
  }
}

module.exports = { matchRoute, decide };
