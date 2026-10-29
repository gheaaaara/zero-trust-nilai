// GET /transkrip/:nim dan POST /transkrip/sinkron
const express = require('express');
const db = require('./db');

const router = express.Router();

const huruf = (s) => (s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'E');

// POST /transkrip/sinkron - HANYA token service. Token user mana pun ditolak.
router.post('/sinkron', (req, res) => {
  if (req.auth.role !== 'service') return res.status(403).json({ error: 'Hanya token service yang boleh sinkron transkrip' });
  const client = db.prepare('SELECT 1 FROM service_clients WHERE client_id = ?').get(String(req.auth.sub));
  if (!client) return res.status(403).json({ error: 'Client service tidak terdaftar' });

  const { kode, nama, entries } = req.body || {};
  if (typeof kode !== 'string' || !kode || typeof nama !== 'string' || !nama || !Array.isArray(entries) || entries.length === 0 || entries.length > 500) {
    return res.status(400).json({ error: 'Payload harus berisi kode, nama, dan entries[]' });
  }
  for (const e of entries) {
    if (!e || typeof e.nim !== 'string' || typeof e.score !== 'number' || !Number.isFinite(e.score) || e.score < 0 || e.score > 100) {
      return res.status(400).json({ error: 'Setiap entry harus punya nim (string) dan score (0-100)' });
    }
  }

  const findStudent = db.prepare("SELECT 1 FROM users WHERE nim = ? AND role = 'mahasiswa'");
  const upsert = db.prepare(`INSERT INTO transcripts (nim, kode, nama_mk, score, huruf, synced_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(nim, kode) DO UPDATE SET nama_mk = excluded.nama_mk, score = excluded.score, huruf = excluded.huruf, synced_at = excluded.synced_at`);
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      for (const e of entries) {
        if (!findStudent.get(e.nim)) throw new Error(`NIM tidak dikenal: ${e.nim}`);
        upsert.run(e.nim, kode, nama, e.score, huruf(e.score), now);
      }
    })();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json({ message: 'Transkrip disinkronkan', kode, jumlah: entries.length });
});

// GET /transkrip/:nim - mahasiswa: NIM sendiri, admin: semua NIM (diperiksa ulang di service)
router.get('/:nim', (req, res) => {
  const a = req.auth;
  if (!['mahasiswa', 'admin'].includes(a.role)) return res.status(403).json({ error: `Role ${a.role} tidak diizinkan` });
  const user = db.prepare('SELECT id, role, nim FROM users WHERE id = ?').get(Number(a.sub));
  if (!user || user.role !== a.role) return res.status(403).json({ error: 'User/role pada token tidak cocok dengan database' });

  const nim = req.params.nim;
  if (user.role === 'mahasiswa' && nim !== user.nim) {
    return res.status(403).json({ error: 'Mahasiswa hanya boleh melihat transkrip miliknya' });
  }
  const mhs = db.prepare("SELECT nim, nama FROM users WHERE nim = ? AND role = 'mahasiswa'").get(nim);
  if (!mhs) return res.status(404).json({ error: 'NIM tidak ditemukan' });
  const rows = db.prepare('SELECT kode, nama_mk, score, huruf, synced_at FROM transcripts WHERE nim = ? ORDER BY kode').all(nim);
  res.json({ nim: mhs.nim, nama: mhs.nama, transkrip: rows });
});

module.exports = router;
