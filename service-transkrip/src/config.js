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
  PORT: Number(process.env.TRANSKRIP_PORT || 3002),
  JWT_SECRET: required('JWT_SECRET'),
  GATEWAY_SECRET: required('GATEWAY_SECRET'),
  JWT_ISSUER: 'zt-gateway',
  DB_PATH: path.resolve(ROOT, process.env.DB_PATH || 'database/nilai.db'),
};
