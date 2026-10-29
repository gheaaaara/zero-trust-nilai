// Panggilan antar-service: Service Nilai -> Gateway -> Service Transkrip, memakai TOKEN SERVICE.
const cfg = require('./config');

async function getServiceToken() {
  const r = await fetch(`${cfg.GATEWAY_URL}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cfg.SERVICE_CLIENT_ID, client_secret: cfg.SERVICE_CLIENT_SECRET }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`gagal mendapat token service (HTTP ${r.status})`);
  return (await r.json()).access_token;
}

async function syncTranscript(payload) {
  const token = await getServiceToken();
  const r = await fetch(`${cfg.GATEWAY_URL}/transkrip/sinkron`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`sinkron transkrip ditolak (HTTP ${r.status}): ${await r.text()}`);
  return r.json();
}

module.exports = { syncTranscript };
