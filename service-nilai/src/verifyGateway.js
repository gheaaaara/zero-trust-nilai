// Verifikasi ulang di Service (prinsip "assume breach"): jangan percaya Gateway begitu saja.
//  1. X-Gateway-Secret harus benar  -> service tidak bisa diakses langsung
//  2. JWT harus valid (tanda tangan + masa berlaku) -> token palsu/kedaluwarsa ditolak walau secret benar
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cfg = require('./config');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = function verifyGateway(req, res, next) {
  const secret = req.get('x-gateway-secret');
  if (!secret || !safeEqual(secret, cfg.GATEWAY_SECRET)) {
    return res.status(403).json({ error: 'Akses langsung ditolak: X-Gateway-Secret tidak valid' });
  }
  const m = /^Bearer (.+)$/i.exec(req.get('authorization') || '');
  if (!m) return res.status(401).json({ error: 'Token tidak ada' });
  try {
    req.auth = jwt.verify(m[1], cfg.JWT_SECRET, { algorithms: ['HS256'], issuer: cfg.JWT_ISSUER });
  } catch (e) {
    return res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Token kedaluwarsa' : 'Token tidak valid' });
  }
  next();
};
