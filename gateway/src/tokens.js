// Penerbitan & verifikasi token (bagian Policy Administrator).
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cfg = require('./config');

const signOpts = (expiresIn) => ({ algorithm: 'HS256', expiresIn, issuer: cfg.JWT_ISSUER });

function signAccessToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, cfg.JWT_SECRET, signOpts(cfg.ACCESS_TOKEN_TTL));
}
function signServiceToken(clientId) {
  return jwt.sign({ sub: clientId, role: 'service' }, cfg.JWT_SECRET, signOpts(cfg.SERVICE_TOKEN_TTL));
}
/** Melempar error (TokenExpiredError / JsonWebTokenError) jika token tidak valid. */
function verifyToken(token) {
  return jwt.verify(token, cfg.JWT_SECRET, { algorithms: ['HS256'], issuer: cfg.JWT_ISSUER });
}
const newRefreshToken = () => crypto.randomBytes(48).toString('hex');
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

module.exports = { signAccessToken, signServiceToken, verifyToken, newRefreshToken, hashToken };
