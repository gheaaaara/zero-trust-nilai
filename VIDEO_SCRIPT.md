# Naskah Video Demo (target 8 menit; batas tugas 6-9 menit)

Persiapan sebelum rekam: `npm run db:init`, jalankan 3 terminal (transkrip, nilai, gateway), siapkan 1 terminal untuk `npm run audit`,
Postman/curl, dan editor kode (VS Code) terbuka. Jam akses default 07:00-21:00. Siapkan juga `.env` versi jam sempit untuk bagian 5.
Ucapkan dengan kata Anda sendiri. Kalimat di bawah hanya panduan.

| Waktu | Tampilkan | Yang diucapkan (ringkas) |
|---|---|---|
| 0:00-0:45 | Gambar arsitektur dari README, 3 terminal yang berjalan | "Ini Sistem Nilai dengan prinsip Zero Trust NIST 800-207. Gateway port 3000 adalah PEP, `policy.js` adalah Policy Engine, Service Nilai 3001 dan Transkrip 3002 adalah resource dengan satu database SQLite. Prinsipnya never trust always verify, least privilege, dan assume breach." |
| 0:45-2:00 | Kode `tokens.js`, `authRoutes.js`. Postman: login dosen1, lalu logout, lalu refresh | "Access token JWT 10 menit berisi sub dan role. Refresh token 1 hari disimpan di DB sebagai hash sehingga bisa dicabut. Saya logout, lalu refresh dengan token yang sama dan hasilnya 401 karena sudah dicabut. Token service 5 menit dari `/auth/service`." |
| 2:00-3:15 | Kode `enforce.js` (urutan: token -> device -> policy -> audit -> proxy). Postman: GET /nilai tanpa token (401), device salah (403), tanpa X-Device-ID (403) | "Setiap request diperiksa token dan device terdaftar untuk user itu. Request ditolak tetap dicatat." Jalankan `npm run audit` dan tunjukkan baris deny beserta alasan. |
| 3:15-4:45 | Kode `policy.js` (case `nilai.list`, `nilai.update`, `transkrip.get`). Postman: mhs1 GET /nilai (hanya miliknya), mhs1 ?nim=orang lain (403), dosen1 ?kelas_id=2 (403), dosen2 PUT nilai kelas dosen1 (403) | "Policy tidak hanya melihat role. Ia membaca database: apakah nilai ini milik mahasiswa itu, apakah dosen mengampu kelasnya, apakah sudah final. Ini least privilege." |
| 4:45-6:00 | Kode `accessHours.js` + `.env`. Ubah `ACCESS_START/END` ke jam yang tidak mencakup sekarang, restart Gateway dan Service Nilai, PUT nilai (403 di luar jam akses), lalu kembalikan jam | "Jam akses diatur lewat konfigurasi dan dihitung pada zona Asia/Jakarta, tidak bergantung zona laptop. Perubahan dan finalisasi di luar jam ditolak." Tunjukkan alasan di audit log. |
| 6:00-7:15 | Kode `kelasRoutes.js`, `transkripClient.js`, `transkripRoutes.js`. Postman: PUT nilai (200), finalisasi (200), PUT lagi (409), GET transkrip mhs1 berisi KI101, token user ke /transkrip/sinkron (403) | "Setelah finalisasi, Service Nilai meminta token service ke Gateway lalu memanggil sinkron lewat Gateway. Endpoint sinkron hanya menerima role service; token user ditolak. Kalau sinkron gagal, finalisasi dibatalkan." Tunjukkan audit `service:service-nilai`. |
| 7:15-8:30 | Kode `verifyGateway.js`. Postman/curl langsung ke port 3001 tanpa secret (403), dengan secret benar tapi tanpa token (401). Terakhir `npm test` (tampilkan ringkasan lulus) | "Service tidak bisa diakses langsung: butuh X-Gateway-Secret dan JWT valid. Walau secret benar, token palsu ditolak. Ini assume breach: service tidak percaya Gateway begitu saja. Pengujian otomatis ini mencakup seluruh kasus. Terima kasih." |

Tips: urutkan request di Postman sesuai tabel; pakai variabel `{{token}}` agar cepat; jangan menampilkan isi `.env` penuh selain bagian jam akses; jika waktu lebih dari 9 menit, persingkat bagian 0:45-2:00.
