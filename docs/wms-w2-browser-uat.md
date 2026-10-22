# W2 — browser UAT dan perbaikan HP

Tanggal: 22 Oktober 2026. Lingkungan: Next.js production webpack, Chromium headless 153, database PGlite baru yang terisolasi. Tidak menggunakan data atau kredensial produksi.

## Perbaikan

Sidebar otomatis menjadi rel ikon pada layar HP dan saat jendela desktop diperkecil. Menu yang dibuka menjadi panel dengan backdrop, fokus keyboard terbatas di panel, Escape untuk menutup, dan fokus kembali ke tombol pembuka. Header memakai dua baris di HP, pilihan gudang tetap di dalam layar, area konten dapat digulir, serta tombol utama memiliki target sentuh 44 piksel. Form kategori, supplier, dan impor mengikuti lebar konten.

## Hasil

- Login Owner melalui UI, pratinjau dan terapkan workbook asli: 40 bahan baru dan 10 resep draft; 12 bahan virtual dilewati. Fixture menghasilkan 36 peringatan yang tetap perlu ditinjau.
- Owner menyetujui Nasi dan menolak Nugget melalui tombol UI; Manajer menyetujui Indomie Goreng melalui API.
- Impor ulang: 0 bahan baru dan 0 draft baru; Nugget tetap `has_archived`.
- Hash baseline POS sebelum/sesudah identik: `8b3487ef47783bb8281f08977c5289e26b04b1659a916c302bc243bf359170cd`.
- Tanpa sesi: daftar draft 401. Manajer: impor 403, daftar draft 200, approval 200. Kasir: impor dan daftar draft 403.
- Desktop 1366×900, HP 390×844 dan 375×812: lebar dokumen sama dengan viewport, tanpa overflow horizontal.
- Buka/tutup panel, focus trap, Escape, fokus kembali, backdrop, pergantian desktop/HP, dan batas dropdown gudang lulus.
- Tidak ada page error atau console error JavaScript pada alur yang diuji.
- Build production webpack final exit 0; lint file yang diubah dan TypeScript lulus. Manifest build diperiksa ulang setelah satu hasil build awal menghasilkan dua berkas kosong; build ulang dan server production berhasil.

## Batas verifikasi

Angka impor berasal dari fixture lokal: 10 menu Dapur tanpa bahan Bar. Angka produksi dapat berbeda. Tidak ada migrasi, impor, merge, atau deployment ke VPS. Perangkat fisik dan browser lain belum diuji. Build memakai shim enumerasi jaringan dan pembatasan CPU/heap khusus host uji, di luar source repository. Build standar Turbopack belum terverifikasi.

GitHub CI sebelumnya gagal dalam sekitar dua detik dengan steps kosong. Log job mengembalikan 404; rincian annotation belum dapat diakses melalui connector. Penyebab belum terbukti dan CI tidak dianggap lulus. Gate backup, restore, dan persetujuan deploy pada `docs/wms-w2-release.md` tetap berlaku.
