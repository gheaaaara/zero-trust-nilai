// Membuat ulang database + data awal (seed).
// PERINGATAN: menghapus database lama. Matikan semua service sebelum menjalankan.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(ROOT, process.env.DB_PATH || 'database/nilai.db');
for (const suffix of ['', '-wal', '-shm']) {
  if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // agar 3 proses dapat memakai satu file database
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const hash = (p) => bcrypt.hashSync(p, 10);

const users = [
  // username, password, nama, role, nim, device
  ['admin',  'Admin@123',  'Admin Prodi',       'admin',     null,        'DEV-ADMIN-01'],
  ['dosen1', 'Dosen1@123', 'Dr. Budi Santoso',  'dosen',     null,        'DEV-DOSEN1-01'],
  ['dosen2', 'Dosen2@123', 'Dr. Siti Rahma',    'dosen',     null,        'DEV-DOSEN2-01'],
  ['mhs1',   'Mhs1@123',   'Andi Pratama',      'mahasiswa', '207006001', 'DEV-MHS1-01'],
  ['mhs2',   'Mhs2@123',   'Sari Wulandari',    'mahasiswa', '207006002', 'DEV-MHS2-01'],
  ['mhs3',   'Mhs3@123',   'Dimas Nugraha',     'mahasiswa', '207006003', 'DEV-MHS3-01'],
];

const seed = db.transaction(() => {
  const insUser = db.prepare('INSERT INTO users (username,password_hash,nama,role,nim) VALUES (?,?,?,?,?)');
  const insDev = db.prepare('INSERT INTO devices (user_id,device_id) VALUES (?,?)');
  const id = {};
  for (const [username, pass, nama, role, nim, device] of users) {
    const r = insUser.run(username, hash(pass), nama, role, nim);
    id[username] = r.lastInsertRowid;
    insDev.run(r.lastInsertRowid, device);
  }

  db.prepare('INSERT INTO service_clients (client_id,secret_hash,nama) VALUES (?,?,?)')
    .run(process.env.SERVICE_CLIENT_ID || 'service-nilai',
         hash(process.env.SERVICE_CLIENT_SECRET || 'demo-service-nilai-secret'),
         'Service Nilai');

  const insClass = db.prepare('INSERT INTO classes (kode,nama,dosen_id) VALUES (?,?,?)');
  const c1 = insClass.run('KI101', 'Keamanan Informasi', id.dosen1).lastInsertRowid; // kelas 1 -> dosen1
  const c2 = insClass.run('PW201', 'Pemrograman Web',    id.dosen2).lastInsertRowid; // kelas 2 -> dosen2

  const insEnr = db.prepare('INSERT INTO enrollments (class_id,student_id) VALUES (?,?)');
  const insGrade = db.prepare('INSERT INTO grades (class_id,student_id,score,is_final) VALUES (?,?,?,0)');
  const enroll = [
    [c1, 'mhs1', 80], [c1, 'mhs2', 72], [c1, 'mhs3', 65],
    [c2, 'mhs1', 88], [c2, 'mhs2', 76],            // mhs3 tidak mengambil PW201
  ];
  for (const [c, u, s] of enroll) { insEnr.run(c, id[u]); insGrade.run(c, id[u], s); }

  // Transkrip awal (semester lalu) agar GET /transkrip/:nim sudah punya data
  const insTr = db.prepare('INSERT INTO transcripts (nim,kode,nama_mk,score,huruf,synced_at) VALUES (?,?,?,?,?,?)');
  const now = new Date().toISOString();
  insTr.run('207006001', 'IF100', 'Algoritma dan Pemrograman', 90, 'A', now);
  insTr.run('207006002', 'IF100', 'Algoritma dan Pemrograman', 78, 'B', now);
  insTr.run('207006003', 'IF100', 'Algoritma dan Pemrograman', 60, 'C', now);
});
seed();
db.close();
console.log('Database dibuat di:', dbPath);
console.log('Seed: 1 admin, 2 dosen, 3 mahasiswa, 2 kelas, 1 service client.');
