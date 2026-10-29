// POST /kelas/:id/finalisasi -> finalisasi nilai, lalu sinkron ke Service Transkrip via Gateway (token service)
const express = require('express');
const db = require('./db');
const { checkAccessHours } = require('./accessHours');
const { syncTranscript } = require('./transkripClient');

const router = express.Router();

router.post('/:id/finalisasi', async (req, res) => {
  const a = req.auth;
  if (a.role !== 'dosen') return res.status(403).json({ error: `Role ${a.role} tidak diizinkan` });
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(Number(a.sub));
  if (!user || user.role !== 'dosen') return res.status(403).json({ error: 'User/role pada token tidak cocok dengan database' });

  const kelasId = Number(req.params.id);
  if (!Number.isInteger(kelasId)) return res.status(400).json({ error: 'ID kelas tidak valid' });
  const kelas = db.prepare('SELECT id, kode, nama, dosen_id FROM classes WHERE id = ?').get(kelasId);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  if (kelas.dosen_id !== user.id) return res.status(403).json({ error: 'Dosen tidak mengampu kelas ini' });
  const t = checkAccessHours();
  if (!t.ok) return res.status(403).json({ error: `Di luar jam akses (${t.window})` });

  // Tandai final (atomik). Hanya baris yang belum final yang berubah.
  const toFinalize = db.prepare('SELECT id FROM grades WHERE class_id = ? AND is_final = 0').all(kelasId).map((r) => r.id);
  if (toFinalize.length === 0) return res.status(409).json({ error: 'Kelas sudah difinalisasi atau tidak punya nilai' });
  const mark = db.prepare('UPDATE grades SET is_final = 1 WHERE id = ? AND is_final = 0');
  db.transaction(() => { toFinalize.forEach((id) => mark.run(id)); })();

  const entries = db.prepare('SELECT u.nim, g.score FROM grades g JOIN users u ON u.id = g.student_id WHERE g.class_id = ? ORDER BY u.nim').all(kelasId);
  try {
    const result = await syncTranscript({ kelas_id: kelas.id, kode: kelas.kode, nama: kelas.nama, entries });
    res.json({ message: 'Kelas difinalisasi dan transkrip disinkronkan', kelas: kelas.kode, jumlah_nilai: entries.length, sinkron: result });
  } catch (err) {
    // Sinkron gagal -> batalkan finalisasi agar data tetap konsisten dan dosen bisa mencoba lagi
    const undo = db.prepare('UPDATE grades SET is_final = 0 WHERE id = ?');
    db.transaction(() => { toFinalize.forEach((id) => undo.run(id)); })();
    console.error('[finalisasi] sinkron gagal, finalisasi dibatalkan:', err.message);
    res.status(502).json({ error: 'Sinkronisasi transkrip gagal, finalisasi dibatalkan', detail: err.message });
  }
});

module.exports = router;
