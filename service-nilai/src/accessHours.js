// Pemeriksaan jam akses berdasarkan zona waktu yang dikonfigurasi (default Asia/Jakarta).
const cfg = require('./config');

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m || +m[1] > 24 || +m[2] > 59) throw new Error(`Format jam salah: "${hhmm}" (gunakan HH:MM)`);
  return +m[1] * 60 + +m[2];
}

function localParts(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: cfg.ACCESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const g = (t) => p.find((x) => x.type === t).value;
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
}

/** Waktu lokal "YYYY-MM-DD HH:mm:ss" pada ACCESS_TIMEZONE (untuk audit log). */
function localTimestamp(date = new Date()) {
  const t = localParts(date);
  return `${t.y}-${t.mo}-${t.d} ${t.h}:${t.mi}:${t.s}`;
}

/** { ok, localTime, window } -> ok=true jika sekarang berada dalam [ACCESS_START, ACCESS_END). */
function checkAccessHours(date = new Date()) {
  const start = toMinutes(cfg.ACCESS_START);
  const end = toMinutes(cfg.ACCESS_END);
  const t = localParts(date);
  const now = +t.h * 60 + +t.mi;
  const ok = start <= end ? now >= start && now < end : now >= start || now < end;
  return { ok, localTime: `${t.h}:${t.mi}`, window: `${cfg.ACCESS_START}-${cfg.ACCESS_END} ${cfg.ACCESS_TIMEZONE}` };
}

function validateConfig() { toMinutes(cfg.ACCESS_START); toMinutes(cfg.ACCESS_END); localParts(new Date()); }

module.exports = { checkAccessHours, localTimestamp, validateConfig };
