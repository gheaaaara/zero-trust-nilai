// Menampilkan audit log terbaru. Contoh: npm run audit   atau   node database/showAudit.js 50
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const Database = require('better-sqlite3');
const db = new Database(path.resolve(ROOT, process.env.DB_PATH || 'database/nilai.db'), { readonly: true });
const n = Number(process.argv[2]) || 30;
const rows = db.prepare(
  'SELECT id, waktu_lokal AS waktu, subjek, endpoint, device_id AS device, hasil, alasan FROM audit_logs ORDER BY id DESC LIMIT ?'
).all(n).reverse();
console.table(rows);
