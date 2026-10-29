# Checklist akhir: persyaratan PDF -> kode -> cara pembuktian

Status "Terbukti otomatis" = lulus di `npm test` pada lingkungan pengembangan saya (Linux, Node v22.22.2, better-sqlite3 12.11.1), dua mode (dalam dan di luar jam akses), masing-masing 77/77.
**Belum ada yang dijalankan di laptop Windows Anda.** Hasil di laptop Anda harus Anda jalankan sendiri.

| # | Persyaratan | File utama | Pembuktian | Status |
|---|---|---|---|---|
| A1 | Access token JWT 10 menit, minimal `sub`+`role`, Bearer | `gateway/src/tokens.js` | A1, A1b | Terbukti otomatis |
| A2 | Refresh token 1 hari, di DB, bisa dicabut | `authRoutes.js`, tabel `refresh_tokens` | A1c, A10, A13 | Terbukti otomatis |
| A3 | Logout mencabut refresh token | `authRoutes.js` (`/logout`) | A10-A12 | Terbukti otomatis |
| A4 | `/auth/service` -> token 5 menit, role service | `authRoutes.js`, `tokens.js` | F2, F2b, F3, F4 | Terbukti otomatis |
| A5 | Gateway menambah `X-Gateway-Secret`, service menolak tanpa itu | `enforce.js`, `*/verifyGateway.js` | G1-G3 | Terbukti otomatis |
| A6 | Service memverifikasi ulang tanda tangan + masa berlaku token | `*/verifyGateway.js` | G4-G6 | Terbukti otomatis |
| A7 | Secret lewat environment variables | `.env.example`, `*/config.js` | baca kode | Terpenuhi (tinjauan kode) |
| B1 | `POST /auth/login` (kredensial + device) | `authRoutes.js` | A1-A6 | Terbukti otomatis |
| B2 | refresh/logout (token valid, belum dicabut) | `authRoutes.js` | A7-A12 | Terbukti otomatis |
| B3 | `/auth/service` hanya client valid | `authRoutes.js` | F2-F4 | Terbukti otomatis |
| B4 | `GET /nilai` mahasiswa: miliknya; dosen: kelasnya | `policy.js` (`nilai.list`), `nilaiRoutes.js` | C1-C5, G8 | Terbukti otomatis |
| B5 | `PUT /nilai/:id` dosen pengampu + belum final + jam akses | `policy.js`, `nilaiRoutes.js` | C6, C7, C10, D1, D4 | Terbukti otomatis |
| B6 | `POST /kelas/:id/finalisasi` + sinkron | `policy.js`, `kelasRoutes.js`, `transkripClient.js` | C8, C9, D3, D5, D6b | Terbukti otomatis |
| B7 | `GET /transkrip/:nim` | `policy.js`, `transkripRoutes.js` | D6, E1-E4 | Terbukti otomatis |
| B8 | `POST /transkrip/sinkron` hanya token service | `policy.js`, `transkripRoutes.js` | F1, F5-F9, G7 | Terbukti otomatis |
| C1 | `X-Device-ID` terdaftar untuk user | `enforce.js` | B5-B7, A4-A6 | Terbukti otomatis |
| C2 | Jam akses 07.00-21.00, dapat dikonfigurasi | `accessHours.js`, `.env` | D1 (dua mode jam) | Terbukti otomatis |
| C3 | Zona waktu Indonesia konsisten | `accessHours.js` (`ACCESS_TIMEZONE`) | sandbox berzona UTC, hasil tetap benar | Terbukti otomatis |
| D1 | Service tidak bisa diakses langsung | `*/verifyGateway.js`, bind `127.0.0.1` | G1-G9 | Terbukti otomatis |
| E1 | `policy.js` mengembalikan allow/deny + alasan | `gateway/src/policy.js` | semua kasus; lihat kolom `alasan` di audit | Terbukti otomatis |
| E2 | Policy membaca DB (kepemilikan, final, jam) | `policy.js` | C3b, C4, C7, D4 | Terbukti otomatis |
| F1 | Audit: waktu, subjek, endpoint, device, hasil, alasan | `auditLog.js`, tabel `audit_logs` | H1-H7, `npm run audit` | Terbukti otomatis |
| F2 | Penolakan (token invalid, device tak terdaftar) tercatat | `enforce.js`, `authRoutes.js` | B2b, B7b, H2, H3, H6 | Terbukti otomatis |
| G1 | Seed: 1 admin, 2 dosen, 3 mahasiswa, 2 kelas, tiap user 1 device | `database/init.js` | `npm run db:init` | Terbukti (dijalankan) |
| G2 | README: akun, password, device ID, client ID | `README.md` | baca | Terpenuhi |
| G3 | Video 6-9 menit | `VIDEO_SCRIPT.md` | **Anda yang merekam** | Belum (naskah tersedia) |
| - | Finalisasi dibatalkan jika sinkron gagal (konsistensi) | `kelasRoutes.js` | uji manual: Service Transkrip dimatikan -> HTTP 502, jumlah nilai final tetap 0 | Terbukti manual di sandbox, tidak ada di `npm test` |
| - | Instalasi `better-sqlite3`/`bcrypt` di Windows | - | `npm install` di laptop Anda | **Belum diverifikasi** |

## Celah/keterbatasan yang diketahui
- Tidak ada TLS, rate limiting, atau rotasi refresh token (lihat README).
- Satu `JWT_SECRET` bersama: service yang dibobol bisa menerbitkan token palsu. Perbaikan nyata: JWT asimetrik (RS256/ES256) dengan kunci publik di service.
- Logika kepemilikan ada di dua tempat (Gateway dan service) sehingga harus dijaga tetap sinkron.
- Pengujian jam akses di luar jendela dilakukan dengan mengubah `ACCESS_START/END` saat start, bukan dengan memalsukan jam sistem.
