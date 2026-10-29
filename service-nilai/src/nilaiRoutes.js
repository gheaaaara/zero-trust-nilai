// GET /nilai dan PUT /nilai/:id
// Service memeriksa kepemilikan data sendiri (tidak hanya mengandalkan Gateway).
const express = require('express');
const db = require('./db');
const { checkAccessHours } = require('./accessHours');

const router = express.Router();

/** Mengambil user dari DB berdasarkan token; role di token harus sama dengan DB. */
function currentUser(req, res, allowedRoles) {
  const a = req.auth;
  if (!allowedRoles.includes(a.role)) {
    res.status(403).json({ error: `Role ${a.role} tidak diizinkan` });
    return null;
  }
  const user = db.prepare('SELECT id, role, nim FROM users WHERE id = ?').get(Number(a.sub));
  if (!user || user.role !== a.role) {
    res.status(403).json({ error: 'User/role pada token tidak cocok dengan database' });
    return null;
  }
  return user;
}

const BASE_SQL = `SELECT g.id, c.id AS kelas_id, c.kode, c.nama AS mata_kuliah, u.nim, u.nama AS mahasiswa, g.score, g.is_final
  FROM grades g JOIN classes c ON c.id = g.class_id JOIN users u ON u.id = g.student_id`;

router.get('/', (req, res) => {
  const user = currentUser(req, res, ['mahasiswa', 'dosen']);
  if (!user) return;
  const { nim, kelas_id } = req.query;
  if ((nim !== undefined && typeof nim !== 'string') || (kelas_id !== undefined && typeof kelas_id !== 'string')) {
    return res.status(400).json({ error: 'Parameter query tidak valid' });
  }

  const where = [];
  const params = [];
  if (user.role === 'mahasiswa') {
    if (nim !== undefined && nim !== user.nim) return res.status(403).json({ error: 'Mahasiswa hanya boleh melihat nilai miliknya' });
    where.push('g.student_id = ?'); params.push(user.id);
  } else {
    where.push('c.dosen_id = ?'); params.push(user.id);          // dosen: hanya kelas yang diampu
    if (kelas_id !== undefined) { where.push('c.id = ?'); params.push(Number(kelas_id)); }
    if (nim !== undefined) { where.push('u.nim = ?'); params.push(nim); }
  }
  const rows = db.prepare(`${BASE_SQL} WHERE ${where.join(' AND ')} ORDER BY c.id, u.nim`).all(...params);
  res.json({ data: rows.map((r) => ({ ...r, is_final: !!r.is_final })) });
});

router.put('/:id', (req, res) => {
  const user = currentUser(req, res, ['dosen']);
  if (!user) return;
  const id = Number(req.params.id);
  const score = req.body && req.body.score;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID nilai tidak valid' });

  const g = db.prepare('SELECT g.id, g.is_final, c.dosen_id FROM grades g JOIN classes c ON c.id = g.class_id WHERE g.id = ?').get(id);
  if (!g) return res.status(404).json({ error: 'Data nilai tidak ditemukan' });
  if (g.dosen_id !== user.id) return res.status(403).json({ error: 'Dosen tidak mengampu kelas ini' });
  if (g.is_final) return res.status(409).json({ error: 'Nilai sudah difinalisasi' });
  const t = checkAccessHours();
  if (!t.ok) return res.status(403).json({ error: `Di luar jam akses (${t.window})` });
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    return res.status(400).json({ error: 'score harus angka 0-100' });
  }

  const r = db.prepare('UPDATE grades SET score = ? WHERE id = ? AND is_final = 0').run(score, id);
  if (r.changes === 0) return res.status(409).json({ error: 'Nilai sudah difinalisasi' });
  res.json({ message: 'Nilai diperbarui', id, score });
});

module.exports = router;
