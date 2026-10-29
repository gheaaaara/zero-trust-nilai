// API Gateway (PEP) - port 3000
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cfg = require('./config');
const { validateConfig } = require('./accessHours');
const authRoutes = require('./authRoutes');
const enforce = require('./enforce');

validateConfig();
const app = express();
app.disable('x-powered-by');

// Hanya untuk cek hidup. Tidak membuka data apa pun.
app.get('/health', (req, res) => res.json({ service: 'gateway', status: 'ok' }));

// Endpoint autentikasi (ditangani Gateway sendiri). Body JSON hanya diparse di sini.
app.use('/auth', express.json({ limit: '10kb' }), authRoutes);

// Semua endpoint lain: harus lolos PEP, lalu diproxy (body tidak diparse, langsung diteruskan).
app.use(enforce);
app.use(createProxyMiddleware({
  target: cfg.NILAI_URL,                 // default; sebenarnya dipilih per-request lewat router
  router: (req) => req.proxyTarget,
  changeOrigin: true,
  on: {
    error: (err, req, res) => {
      console.error('[proxy] gagal meneruskan:', err.message);
      if (res && typeof res.writeHead === 'function' && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service tujuan tidak merespons' }));
      }
    },
  },
}));

// Error handler (mis. JSON rusak pada /auth)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Kesalahan internal gateway' });
});

app.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`API Gateway aktif di http://${cfg.HOST}:${cfg.PORT}`);
  console.log(`Jam akses: ${cfg.ACCESS_START}-${cfg.ACCESS_END} (${cfg.ACCESS_TIMEZONE})`);
});
