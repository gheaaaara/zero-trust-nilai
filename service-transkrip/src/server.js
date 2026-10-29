// Service Transkrip - port 3002 (hanya menerima request dari Gateway)
const express = require('express');
const cfg = require('./config');
const verifyGateway = require('./verifyGateway');
const transkripRoutes = require('./transkripRoutes');

const app = express();
app.disable('x-powered-by');

app.use(verifyGateway);                 // secret + JWT diperiksa sebelum apa pun diproses
app.use(express.json({ limit: '100kb' }));
app.use('/transkrip', transkripRoutes);
app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Kesalahan internal service transkrip' });
});

app.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`Service Transkrip aktif di http://${cfg.HOST}:${cfg.PORT} (hanya via Gateway)`);
});
