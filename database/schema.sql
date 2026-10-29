CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nim           TEXT UNIQUE            -- hanya terisi untuk mahasiswa
);

CREATE TABLE devices (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL UNIQUE
);

CREATE TABLE refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,      -- SHA-256 dari refresh token (token asli tidak disimpan)
  device_id  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,                      -- terisi jika dicabut (logout)
  created_at TEXT NOT NULL
);

CREATE TABLE service_clients (
  client_id   TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  nama        TEXT NOT NULL
);

CREATE TABLE classes (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  kode     TEXT NOT NULL UNIQUE,
  nama     TEXT NOT NULL,
  dosen_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE enrollments (
  class_id   INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE grades (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  score      REAL NOT NULL,
  is_final   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (class_id, student_id)
);

CREATE TABLE transcripts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nim       TEXT NOT NULL,
  kode      TEXT NOT NULL,
  nama_mk   TEXT NOT NULL,
  score     REAL NOT NULL,
  huruf     TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  UNIQUE (nim, kode)
);

CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  waktu       TEXT NOT NULL,            -- ISO 8601 UTC
  waktu_lokal TEXT NOT NULL,            -- waktu pada ACCESS_TIMEZONE
  subjek      TEXT NOT NULL,            -- mis. "dosen:2", "service:service-nilai", "anonim"
  endpoint    TEXT NOT NULL,            -- mis. "PUT /nilai/3"
  device_id   TEXT,
  hasil       TEXT NOT NULL CHECK (hasil IN ('allow','deny')),
  alasan      TEXT NOT NULL
);
