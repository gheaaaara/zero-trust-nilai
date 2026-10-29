const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Environment variable ${name} belum diatur. Jalankan "npm run setup" lalu periksa file .env`);
    process.exit(1);
  }
  return v;
}

module.exports = {
  HOST: '127.0.0.1',
  PORT: Number(process.env.NILAI_PORT || 3001),
  JWT_SECRET: required('JWT_SECRET'),
  GATEWAY_SECRET: required('GATEWAY_SECRET'),
  JWT_ISSUER: 'zt-gateway',
  GATEWAY_URL: process.env.GATEWAY_URL || 'http://127.0.0.1:3000',
  SERVICE_CLIENT_ID: required('SERVICE_CLIENT_ID'),
  SERVICE_CLIENT_SECRET: required('SERVICE_CLIENT_SECRET'),
  DB_PATH: path.resolve(ROOT, process.env.DB_PATH || 'database/nilai.db'),
  ACCESS_START: process.env.ACCESS_START || '07:00',
  ACCESS_END: process.env.ACCESS_END || '21:00',
  ACCESS_TIMEZONE: process.env.ACCESS_TIMEZONE || 'Asia/Jakarta',
};
