// Menyalin .env.example menjadi .env (hanya jika .env belum ada)
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, '.env.example');
const dst = path.join(root, '.env');
if (fs.existsSync(dst)) {
  console.log('.env sudah ada, tidak ditimpa.');
} else {
  fs.copyFileSync(src, dst);
  console.log('.env dibuat dari .env.example. Silakan periksa isinya.');
}
