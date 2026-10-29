# Panduan Pengujian

## 1. Pengujian otomatis (`npm test`)
Syarat: `npm run db:init` sudah dijalankan (sebelum service dinyalakan) dan ketiga service hidup. Runner `tests/run-tests.js`
mengirim request nyata ke Gateway (3000) dan ke service langsung (3001/3002), memeriksa kode HTTP, isi respons, dan tabel `audit_logs`.
Runner menolak berjalan jika database sudah berisi nilai final: matikan service, `npm run db:init`, nyalakan lagi.

Runner otomatis mendeteksi apakah sekarang dalam atau di luar jam akses (dari `.env`) dan menyesuaikan hasil yang diharapkan.
Untuk menguji kedua cabang, jalankan dua kali: sekali dengan `07:00-21:00`, sekali dengan jam yang tidak mencakup waktu sekarang
(ubah `.env`, matikan service, `npm run db:init`, nyalakan lagi, `npm test`).

**Hasil yang benar-benar dijalankan (sandbox Linux, Node v22.22.2, 29 Okt 2026):**
| Mode | Konfigurasi | Hasil |
|---|---|---|
| Dalam jam akses | 07:00-21:00 Asia/Jakarta (waktu uji 07:18 WIB) | 77 lulus, 0 gagal |
| Di luar jam akses | 00:00-01:00 Asia/Jakarta | 77 lulus, 0 gagal |
| Sinkron gagal (Service Transkrip dimatikan), manual dengan curl | finalisasi kelas 1 | HTTP 502, jumlah nilai final tetap 0; setelah service hidup: HTTP 200 |

Belum dijalankan di Windows Anda. Jika ada yang gagal di sana, kirim keluaran `npm test` atau pesan errornya.

## 2. Daftar kasus uji (ID sama dengan keluaran `npm test`)
Semua lewat Gateway `http://127.0.0.1:3000` kecuali bagian G. `D=` berarti header `X-Device-ID`. Status: **O** = dijalankan otomatis oleh `npm test` (lulus pada uji saya).

| ID | Skenario | Method + URL | Header / body | Hasil | Alasan | Status |
|---|---|---|---|---|---|---|
| A1 | Login berhasil | POST /auth/login | D=DEV-MHS1-01; `{"username":"mhs1","password":"Mhs1@123"}` | 200 | kredensial + device valid | O |
| A2 | Password salah | POST /auth/login | D=DEV-MHS1-01; password salah | 401 | kredensial salah | O |
| A4 | Device tak terdaftar | POST /auth/login | D=DEV-ASING-99; kredensial benar | 403 | device bukan milik user | O |
| A5 | Device milik user lain | POST /auth/login | D=DEV-MHS2-01; kredensial mhs1 | 403 | device terikat ke user | O |
| A7 | Refresh valid | POST /auth/refresh | D=DEV-MHS1-01; `{"refresh_token":"..."}` | 200 | token ada, belum dicabut | O |
| A8 | Refresh tidak valid | POST /auth/refresh | refresh_token acak | 401 | hash tidak ada di DB | O |
| A10 | Logout | POST /auth/logout | D; refresh_token | 200 | token dicabut (`revoked_at`) | O |
| A11 | Refresh setelah logout | POST /auth/refresh | refresh_token yang sama | 401 | sudah dicabut | O |
| A12 | Logout ulang | POST /auth/logout | refresh_token yang sama | 401 | sudah dicabut | O |
| B1 | Tanpa access token | GET /nilai | D saja | 401 | tidak ada Bearer | O |
| B2 | JWT kedaluwarsa | GET /nilai | Bearer token exp lampau | 401 | `token kedaluwarsa` | O |
| B3 | Tanda tangan salah | GET /nilai | Bearer token dengan secret lain | 401 | verifikasi gagal | O |
| B5 | Tanpa X-Device-ID | GET /nilai | Bearer valid | 403 | konteks device wajib | O |
| B6 | Device tak terdaftar | GET /nilai | Bearer valid; D=DEV-ASING-99 | 403 | device tidak terdaftar | O |
| B7 | Device milik user lain | GET /nilai | Bearer mhs1; D=DEV-MHS2-01 | 403 | device bukan milik mhs1 | O |
| C1 | Mahasiswa lihat nilai sendiri | GET /nilai | Bearer mhs1; D=DEV-MHS1-01 | 200 (2 baris, NIM 207006001) | filter kepemilikan | O |
| C2 | Mahasiswa minta nilai orang lain | GET /nilai?nim=207006002 | Bearer mhs1 | 403 | bukan NIM sendiri | O |
| C3 | Dosen1 lihat nilai | GET /nilai | Bearer dosen1; D=DEV-DOSEN1-01 | 200 (3 baris KI101) | hanya kelas yang diampu | O |
| C4 | Dosen1 minta kelas dosen2 | GET /nilai?kelas_id=2 | Bearer dosen1 | 403 | bukan pengampu | O |
| C7 | Dosen2 ubah nilai kelas dosen1 | PUT /nilai/1 | Bearer dosen2; `{"score":100}` | 403 | bukan pengampu | O |
| D1 | Ubah nilai (belum final) | PUT /nilai/1 | Bearer dosen1; `{"score":91}` | 200 dalam jam akses, 403 di luar | cek jam akses | O |
| D3 | Finalisasi + sinkron | POST /kelas/1/finalisasi | Bearer dosen1; D | 200 dalam jam akses, 403 di luar | pengampu + jam; sinkron via token service | O |
| D4 | Ubah nilai setelah final | PUT /nilai/1 | Bearer dosen1 | 409 (403 jika di luar jam dan belum final) | nilai final | O |
| D6 | Mahasiswa lihat transkrip sendiri | GET /transkrip/207006001 | Bearer mhs1 | 200, berisi KI101 setelah finalisasi | hasil sinkron | O |
| E1 | Mahasiswa lihat transkrip orang lain | GET /transkrip/207006002 | Bearer mhs1 | 403 | NIM bukan miliknya | O |
| E2 | Admin lihat semua NIM | GET /transkrip/207006003 | Bearer admin; D=DEV-ADMIN-01 | 200 | role admin | O |
| F1 | Token user panggil sinkron | POST /transkrip/sinkron | Bearer mhs1/dosen1/admin | 403 | hanya token service | O |
| F2 | Token service | POST /auth/service | `{"client_id":"service-nilai","client_secret":"demo-service-nilai-secret"}` | 200, role service, 5 menit | client valid | O |
| F3 | Secret service salah | POST /auth/service | secret salah | 401 | secret salah | O |
| F5 | Sinkron dengan token service | POST /transkrip/sinkron | Bearer token service; body `{"kelas_id":99,"kode":"TEST-SVC","nama":"Uji","entries":[{"nim":"207006003","score":77}]}` | 200 | role service | O |
| F6/F7 | Token service palsu / kedaluwarsa | POST /transkrip/sinkron | Bearer palsu | 401 | tanda tangan / exp | O |
| F8 | Token service ke GET /nilai | GET /nilai | Bearer token service | 403 | least privilege | O |
| G1 | Langsung ke port 3001 tanpa secret | GET http://127.0.0.1:3001/nilai | Bearer valid | 403 | tak lewat Gateway | O |
| G2 | Langsung ke port 3002 tanpa secret | GET http://127.0.0.1:3002/transkrip/207006001 | Bearer valid | 403 | tak lewat Gateway | O |
| G4 | Secret benar, tanpa token | GET http://127.0.0.1:3001/nilai | `X-Gateway-Secret` benar | 401 | service verifikasi token sendiri | O |
| G5/G6 | Secret benar, token palsu/kedaluwarsa | GET http://127.0.0.1:3002/transkrip/207006001 | secret benar + token buruk | 401 | tanda tangan / exp | O |
| G7 | Secret benar, token user ke sinkron | POST http://127.0.0.1:3002/transkrip/sinkron | secret + token admin | 403 | service periksa role | O |
| H1-H7 | Audit log allow dan deny | `npm run audit` | - | entri allow dan deny dengan alasan | gateway mencatat semua | O |

Kasus lain (A3, A6, A9, A13, B4, B8, C5-C6, C8-C10, D2, D5, E3-E4, F4, F9, G3, G8-G9) juga ada di `tests/run-tests.js`.

## 3. Mencoba manual dengan curl (Windows Command Prompt / cmd)
Gunakan **cmd** (bukan PowerShell 5) agar tanda kutip JSON benar. Atau pakai Postman dengan request yang sama.
```bat
curl -s -X POST http://127.0.0.1:3000/auth/login -H "Content-Type: application/json" -H "X-Device-ID: DEV-DOSEN1-01" -d "{\"username\":\"dosen1\",\"password\":\"Dosen1@123\"}"
```
Salin `access_token` dan `refresh_token` dari respons, lalu:
```bat
set TOKEN=<tempel access_token>
curl -s http://127.0.0.1:3000/nilai -H "Authorization: Bearer %TOKEN%" -H "X-Device-ID: DEV-DOSEN1-01"
curl -s -X PUT http://127.0.0.1:3000/nilai/1 -H "Authorization: Bearer %TOKEN%" -H "X-Device-ID: DEV-DOSEN1-01" -H "Content-Type: application/json" -d "{\"score\":91}"
curl -s -X POST http://127.0.0.1:3000/kelas/1/finalisasi -H "Authorization: Bearer %TOKEN%" -H "X-Device-ID: DEV-DOSEN1-01"
curl -s http://127.0.0.1:3000/nilai -H "Authorization: Bearer %TOKEN%" -H "X-Device-ID: DEV-DOSEN2-01"
curl -s http://127.0.0.1:3001/nilai -H "Authorization: Bearer %TOKEN%"
```
Baris 4 (device milik dosen2) harus 403, baris 5 (langsung ke port 3001) harus 403. Tambahkan `-i` pada curl untuk melihat kode HTTP.
Lihat audit log: `npm run audit`.
