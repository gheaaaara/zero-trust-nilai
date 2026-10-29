// Service Nilai - port 3001 (hanya menerima request dari Gateway)
const express = require('express');
const cfg = require('./config');
const { validateConfig } = require('./accessHours');
const verifyGateway = require('./verifyGateway');
const nilaiRoutes = require('./nilaiRoutes');
const kelasRoutes = require('./kelasRoutes');

validateConfig();
const app = express();
app.disable('x-powered-by');

app.use(verifyGateway);                 // 1) secret + JWT diperiksa SEBELUM apa pun diproses
app.use(express.json({ limit: '10kb' }));
app.use('/nilai', nilaiRoutes);
app.use('/kelas', kelasRoutes);
app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Kesalahan internal service nilai' });
});

app.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`Service Nilai aktif di http://${cfg.HOST}:${cfg.PORT} (hanya via Gateway)`);
  console.log(`Jam akses: ${cfg.ACCESS_START}-${cfg.ACCESS_END} (${cfg.ACCESS_TIMEZONE})`);
});
