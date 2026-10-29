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
  ROOT,
  HOST: '127.0.0.1',
  PORT: Number(process.env.GATEWAY_PORT || 3000),
  JWT_SECRET: required('JWT_SECRET'),
  GATEWAY_SECRET: required('GATEWAY_SECRET'),
  NILAI_URL: process.env.NILAI_URL || 'http://127.0.0.1:3001',
  TRANSKRIP_URL: process.env.TRANSKRIP_URL || 'http://127.0.0.1:3002',
  DB_PATH: path.resolve(ROOT, process.env.DB_PATH || 'database/nilai.db'),
  ACCESS_START: process.env.ACCESS_START || '07:00',
  ACCESS_END: process.env.ACCESS_END || '21:00',
  ACCESS_TIMEZONE: process.env.ACCESS_TIMEZONE || 'Asia/Jakarta',
  JWT_ISSUER: 'zt-gateway',
  ACCESS_TOKEN_TTL: '10m',
  SERVICE_TOKEN_TTL: '5m',
  REFRESH_TTL_MS: 24 * 60 * 60 * 1000, // 1 hari
};
