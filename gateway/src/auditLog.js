// Audit log: setiap keputusan akses dicatat ke tabel audit_logs.
const db = require('./db');
const { localTimestamp } = require('./accessHours');

const insert = db.prepare(
  'INSERT INTO audit_logs (waktu, waktu_lokal, subjek, endpoint, device_id, hasil, alasan) VALUES (?,?,?,?,?,?,?)'
);

function log({ subjek, endpoint, device_id, hasil, alasan }) {
  const now = new Date();
  insert.run(now.toISOString(), localTimestamp(now), subjek, endpoint, device_id || null, hasil, alasan);
  console.log(`[AUDIT] ${localTimestamp(now)} | ${subjek} | ${endpoint} | ${device_id || '-'} | ${hasil.toUpperCase()} | ${alasan}`);
}

module.exports = { log };
