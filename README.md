# Sistem Nilai - Zero Trust Security (NIST SP 800-207)

Tugas Praktikum Individu - Keamanan Informasi (KP70065004), Informatika Universitas Siliwangi.

Sistem Nilai berbasis API dengan tiga aplikasi terpisah. API Gateway menjadi satu-satunya pintu masuk
(Policy Enforcement Point). Gateway meminta keputusan ke Policy Engine (`gateway/src/policy.js`),
mencatat audit log, lalu meneruskan request yang diizinkan ke service.

```
Client (Postman/curl)  --Bearer token + X-Device-ID-->  API GATEWAY :3000 (PEP)
                                                          |- authRoutes.js  : login / refresh / logout / service (PA)
                                                          |- policy.js      : keputusan allow/deny + alasan (PE), baca DB
                                                          |- auditLog.js    : tabel audit_logs
                                                          '- proxy + X-Gateway-Secret
                                          .---------------------------'--------------------------.
                                          v                                                      v
                                SERVICE NILAI :3001                                   SERVICE TRANSKRIP :3002
                                cek secret + JWT + kepemilikan                        cek secret + JWT + kepemilikan
                                          |   finalisasi -> POST {gateway}/transkrip/sinkron      ^
                                          '-------- Bearer TOKEN SERVICE (dari /auth/service) ----'
                                          \________________ satu database SQLite bersama ________________/
```

## Teknologi
Node.js 20, 22, atau 24 (`better-sqlite3` dipin ke 12.11.1 karena punya binary siap pakai untuk Windows), Express 4, SQLite (`better-sqlite3`), `jsonwebtoken`, `bcrypt`,
`http-proxy-middleware` 3, `dotenv`, `fetch` bawaan Node. Tanpa frontend; pengujian memakai curl/Postman dan `npm test`.

## Struktur folder
```
zero-trust-nilai/
├── package.json, .env.example, .gitignore
├── scripts/setup.js              salin .env.example -> .env
├── database/  schema.sql, init.js (buat DB + seed), showAudit.js (tampilkan audit log)
├── gateway/src/  server.js, config.js, db.js, accessHours.js, auditLog.js, tokens.js, authRoutes.js, policy.js, enforce.js
├── service-nilai/src/  server.js, config.js, db.js, accessHours.js, verifyGateway.js, nilaiRoutes.js, kelasRoutes.js, transkripClient.js
├── service-transkrip/src/  server.js, config.js, db.js, verifyGateway.js, transkripRoutes.js
├── tests/run-tests.js            77 pengujian otomatis end-to-end
└── README.md, TESTING.md, CHECKLIST.md, VIDEO_SCRIPT.md
```
Ketiga aplikasi terpisah (proses, port, kode sendiri). Dependensi dipasang sekali di root agar instalasi sederhana.

## Instalasi (Windows)
Buka **Command Prompt** atau PowerShell.
```bat
node -v
npm -v
```
`node -v` harus menampilkan v20, v22, atau v24 (unduh LTS dari https://nodejs.org jika belum).
```bat
cd C:\path\ke\zero-trust-nilai
npm install
npm run setup
npm run db:init
```
- `npm run setup` membuat file `.env` dari `.env.example`.
- `npm run db:init` membuat `database\nilai.db` beserta data awal. **Ulangi perintah ini** untuk mereset data
  (matikan ketiga service dulu).

## Menjalankan (3 terminal, folder proyek yang sama)
| Terminal | Perintah | Pesan yang muncul |
|---|---|---|
| 1 | `npm run start:transkrip` | Service Transkrip aktif di http://127.0.0.1:3002 |
| 2 | `npm run start:nilai` | Service Nilai aktif di http://127.0.0.1:3001 |
| 3 | `npm run start:gateway` | API Gateway aktif di http://127.0.0.1:3000 |

Cek hidup: `curl http://127.0.0.1:3000/health` -> `{"service":"gateway","status":"ok"}`.
Service 3001/3002 sengaja menolak akses langsung (HTTP 403), jadi respons 403 dari port itu justru menandakan service aktif dan terlindungi.
Gateway juga menampilkan baris `[AUDIT]` untuk setiap keputusan. Melihat audit log dari database: `npm run audit` (opsional: `npm run audit 50`).

Pengujian otomatis (terminal ke-4, setelah `db:init` dan ketiga service hidup): `npm test`.

## Akun demo (hanya untuk demo lokal)
| Role | Username | Password | Device ID terdaftar | NIM |
|---|---|---|---|---|
| admin | `admin` | `Admin@123` | `DEV-ADMIN-01` | - |
| dosen (mengampu KI101, kelas id 1) | `dosen1` | `Dosen1@123` | `DEV-DOSEN1-01` | - |
| dosen (mengampu PW201, kelas id 2) | `dosen2` | `Dosen2@123` | `DEV-DOSEN2-01` | - |
| mahasiswa | `mhs1` | `Mhs1@123` | `DEV-MHS1-01` | 207006001 |
| mahasiswa | `mhs2` | `Mhs2@123` | `DEV-MHS2-01` | 207006002 |
| mahasiswa | `mhs3` | `Mhs3@123` | `DEV-MHS3-01` | 207006003 |

Service client: **client ID** `service-nilai`, secret `demo-service-nilai-secret` (diatur di `.env`: `SERVICE_CLIENT_ID`, `SERVICE_CLIENT_SECRET`).
Data: KI101 diikuti mhs1, mhs2, mhs3. PW201 diikuti mhs1, mhs2 saja. Tiap mahasiswa sudah punya transkrip IF100 dari semester lalu.
Semua nilai di atas hanya data demo. **Jangan commit `.env`** (sudah ada di `.gitignore`) dan jangan memakai secret ini di luar lab.

## Konfigurasi (`.env`)
| Variabel | Fungsi |
|---|---|
| `JWT_SECRET` | penandatangan/verifikasi JWT (HS256), dipakai Gateway dan kedua service |
| `GATEWAY_SECRET` | nilai header `X-Gateway-Secret` |
| `SERVICE_CLIENT_ID`, `SERVICE_CLIENT_SECRET` | kredensial Service Nilai untuk `POST /auth/service` |
| `DB_PATH` | lokasi file SQLite bersama |
| `ACCESS_START`, `ACCESS_END`, `ACCESS_TIMEZONE` | jam akses ubah/finalisasi nilai (default `07:00`, `21:00`, `Asia/Jakarta`) |

### Jam akses dan zona waktu
Jam dihitung dengan `Intl.DateTimeFormat` pada zona `ACCESS_TIMEZONE` (default **Asia/Jakarta = WIB**), jadi hasilnya sama
walau zona waktu laptop berbeda. Rentang berlaku mulai `ACCESS_START` sampai **sebelum** `ACCESS_END`.
Untuk demo "di luar jam akses", ubah di `.env`, misalnya `ACCESS_START=00:00` dan `ACCESS_END=01:00`
(atau rentang yang tidak mencakup jam sekarang), lalu **restart Gateway dan Service Nilai** (keduanya memeriksa jam).
Kembalikan ke `07:00`/`21:00` setelah demo.

## Endpoint (semua lewat Gateway `http://127.0.0.1:3000`)
| Endpoint | Siapa | Kondisi |
|---|---|---|
| `POST /auth/login` | semua user | username+password benar dan `X-Device-ID` terdaftar untuk user |
| `POST /auth/refresh` | semua user | refresh token valid, belum dicabut, `X-Device-ID` sama dengan device saat login |
| `POST /auth/logout` | semua user | refresh token valid; token dicabut |
| `POST /auth/service` | Service Nilai | `client_id` + `client_secret` benar -> token role `service` 5 menit |
| `GET /nilai` | mahasiswa, dosen | mahasiswa: hanya miliknya; dosen: hanya kelas yang diampu (filter opsional `?kelas_id=`, `?nim=`) |
| `PUT /nilai/:id` body `{"score":90}` | dosen | kelas yang diampu, belum final, dalam jam akses |
| `POST /kelas/:id/finalisasi` | dosen | kelas yang diampu, belum final, dalam jam akses; lalu sinkron ke transkrip |
| `GET /transkrip/:nim` | mahasiswa, admin | mahasiswa: NIM sendiri; admin: semua NIM |
| `POST /transkrip/sinkron` | hanya token service | token user mana pun ditolak |

Setiap request selain `/auth/*` wajib membawa `Authorization: Bearer <token>`; request user juga wajib `X-Device-ID`.

## Asumsi implementasi (tidak dirinci di PDF)
1. **Satu `JWT_SECRET` bersama (HS256)**; token user dan token service dibedakan lewat claim `role`. Token memuat `sub`, `role`, `iss`, `iat`, `exp`.
2. **Refresh token** adalah string acak 48 byte; di database hanya disimpan hash SHA-256-nya. Refresh token terikat ke device saat login. Tidak ada rotasi (refresh hanya menerbitkan access token baru).
3. **Login memeriksa kredensial dulu**, baru device; pesan ke klien untuk kredensial salah sengaja generik, alasan rinci ada di audit log.
4. **Finalisasi per kelas**: semua nilai kelas diberi `is_final=1`. Jika sinkronisasi ke transkrip gagal, finalisasi dibatalkan (HTTP 502) agar data konsisten.
5. **Status HTTP**: 401 token tidak ada/tidak valid/kedaluwarsa; 403 ditolak kebijakan/device/secret; 404 data tidak ada; 409 nilai/kelas sudah final; 400 input salah; 502 service tujuan tidak merespons.
6. **Token service tidak membawa device**, sehingga `X-Device-ID` tidak diperiksa untuk panggilan service.
7. **Service dan Gateway hanya mendengarkan di `127.0.0.1`**. Gateway membuang `X-Gateway-Secret` buatan klien sebelum menambah yang asli.
8. Service **memeriksa ulang** JWT dan kepemilikan data sendiri (bukan hanya percaya Gateway). Karena itu logika kepemilikan ada di dua tempat (Gateway `policy.js` dan service).

## Keterbatasan (jujur)
Hanya HTTP lokal (tanpa TLS), satu secret HMAC bersama, tanpa rate limiting/lockout, tanpa rotasi refresh token, satu file SQLite.
Cocok untuk tugas praktikum, bukan produksi.
