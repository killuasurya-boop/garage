# Panduan Kasir & Shift

> Alur kerja kasir Garage dari login, buka shift, melayani pesanan, sampai tutup shift dan balancing uang laci.
>
> Untuk: Kasir · Diperbarui 2026-10-19. Dokumen ini dibuat otomatis dari `src/lib/role-guides/` (`npm run docs:guides`) — ubah di sana, bukan di sini.

## 1. Login & layar kunci

Setiap kasir memakai akun sendiri. Semua transaksi tercatat atas nama akun yang login.

1. Buka aplikasi Garage OS di Google Chrome, masukkan email dan password akun Anda, lalu tekan Masuk.
2. Login pertama kali: sistem meminta Ganti Password. Buat password baru minimal 8 karakter dan jangan dibagikan.
   - **Penting:** Selama password belum diganti, semua menu kasir terkunci.
3. Setelah login Anda langsung masuk ke layar POS (Kasir).
4. Saat meninggalkan meja kasir, tekan Kunci (ikon gembok) di pengaturan kasir. Layar juga terkunci otomatis bila lama tidak disentuh.
   - Tips: Buka kunci dengan password akun Anda sendiri. Layar tetap terkunci walau halaman di-refresh.

**Tanya jawab**

- **Lupa password?** Minta Owner/Manajer mereset password dari menu Tim. Anda akan diminta membuat password baru saat login.
- **Salah password berkali-kali saat buka kunci?** Setelah 5 kali salah, buka kunci diblokir 15 menit. Tunggu atau minta bantuan Manajer.

## 2. Buka shift (modal awal)

Transaksi hanya bisa dilakukan setelah shift dibuka. Satu kasir = satu shift terbuka.

1. Di layar POS tekan Buka Shift.
2. Hitung uang di laci, lalu isi Modal Awal (Rp50.000–Rp500.000, kelipatan Rp50.000).
   - Tips: Sistem menampilkan sisa uang laci yang ditinggal shift sebelumnya. Pastikan jumlah fisiknya sama.
3. Pilih Shift 1 atau Shift 2. Shift ke-3 dan seterusnya dalam satu hari butuh PIN Manajer/Owner.
4. Bila shift kemarin belum ditutup, POS menampilkan layar "Shift belum ditutup". Tutup shift lama dulu, baru buka shift baru.
   - **Penting:** Shift yang terbuka lebih dari 20 jam tidak bisa dipakai transaksi.

## 3. Printer struk (laptop)

1. Buka POS → ikon pengaturan kasir → tab Printer → bagian "Printer Perangkat Ini".
2. RPP02N via Bluetooth: pair dulu di Windows (PIN 0000/1234). Lalu pilih Kabel/Bluetooth (COM) → Hubungkan → pilih port "Standard Serial over Bluetooth".
3. Pilih lebar kertas 58 mm (RPP02N) atau 80 mm, lalu tekan Tes cetak.
4. Printer lain yang sudah terpasang di Windows: pilih Printer umum (Chrome).
5. Ukuran huruf Besar + Huruf tebal (bawaan) membuat struk hitam pekat dan mudah dibaca. Lewat dialog print Chrome, huruf Besar memakai tata letak 24 kolom (huruf lebih besar) dengan TOTAL & Kembali dicetak tinggi. Pilih Normal bila ingin hemat kertas.
   - Tips: Angka di kanan struk terpotong? Ubah Jumlah kolom per baris ke 30. Kertas tidak keluar sama sekali? Centang Mode kompatibel, lalu Tes cetak lagi.

**Tanya jawab**

- **Huruf acak saat cetak?** Ganti kecepatan port (baud) ke 115200 lalu tes lagi.
- **Printer terputus?** Nyalakan printer, lalu tekan Hubungkan lagi di tab Printer.

## 4. Membuat pesanan

1. Pilih kategori atau cari menu, ketuk menu, lalu pilih varian (mis. Cold / Hot). Item masuk keranjang.
2. Ubah jumlah dengan tombol + / −. Tambahkan catatan per item bila perlu (mis. less ice).
3. Pilih jenis pesanan: Dine-in (wajib pilih meja), Take away, atau Delivery.
   - Tips: Warna meja: hijau kosong, kuning sedang dipilih, merah terisi, biru reserved, abu-abu perlu dibersihkan.
4. Delivery: isi nama, WhatsApp, alamat & titik lokasi. Ongkir dihitung otomatis (Rp5.000 untuk 2 km pertama + Rp2.000/km, maks 7 km). Minimal belanja Rp25.000. Delivery wajib dibayar dulu.
5. Chit Dapur/Bar tercetak otomatis setelah pesanan dibayar (bila diaktifkan Owner).
6. Kategori Lainnya: Minuman Botol (Mineral) dan Rokok diserahkan langsung oleh kasir — tidak membuat tiket Bar/Dapur. Rokok tidak tampil di menu digital pelanggan.

## 5. Member, voucher & diskon

1. Cari member dengan nomor HP, atau daftarkan member baru dari kasir. Nomor wajib WhatsApp aktif (08xx).
2. Cek WA member: saat member dipilih, tekan Cek WA (WhatsApp terbuka), minta pelanggan membalas, lalu tekan Tandai WA aktif.
3. Voucher: masukkan kode lalu cek. Voucher pribadi hanya bisa dipakai pemiliknya, dan kuota voucher dibatasi.
4. Poin: tekan Scan QR member, lalu pindai QR di kartu/aplikasi member (kamera atau scanner). Setelah terverifikasi, isi jumlah poin yang dipakai. Potongan muncul di ringkasan bayar.
   - **Penting:** Poin tidak bisa dipakai hanya dengan nomor HP. QR harus milik member yang dipilih.
5. Diskon manual hanya untuk member. Di atas batas yang ditentukan Owner, tekan Minta Persetujuan lalu Manajer/Owner memasukkan PIN di tablet kasir.
   - **Penting:** Persetujuan diskon hanya berlaku untuk nominal yang disetujui dan untuk kasir yang meminta.

## 6. Pesanan QR dari pelanggan

1. Pesanan dari QR meja / menu digital muncul di daftar QR order dengan bunyi notifikasi.
2. Periksa isi pesanan lalu tekan Terima. Pesanan Take away & Delivery harus Lunas dulu sebelum diterima.
3. Tolak bila menu habis atau pesanan tidak jelas. Stok dan poin pelanggan dikembalikan otomatis.
4. Pesanan Transfer/QRIS dengan label Bukti transfer ✓ sudah diunggah pelanggan. Tekan Lihat, cocokkan nominal dengan mutasi rekening/QRIS, baru proses Lunas.
   - **Penting:** Bukti foto bisa dipalsukan — tetap cek uang benar-benar masuk di aplikasi bank.
5. Pelanggan yang bergabung di meja terisi memakai kode gabung 4 angka yang tercetak di struk.

## 7. Pembayaran

1. Tekan Bayar, pilih metode: Tunai, QRIS, Transfer, atau E-Wallet.
2. Tunai: ketuk nominal cepat (Uang pas, 5.000, 10.000, 20.000, 50.000, 100.000 — yang cukup untuk total) atau ketik uang yang diterima. Sistem menghitung kembalian dan menolak bila uang kurang.
   - Tips: Setelah lunas, layar selesai menampilkan KEMBALIAN besar — hitung kembalian di depan pelanggan sebelum laci ditutup.
3. Lihat hasil penjualan shift Anda: menu Laporan Shift → kartu Penjualan shift saya (Cash / QRIS / Transfer dan Dine-in kasir / Menu digital / Take away / Delivery). Kas laci tetap dihitung saat tutup shift.
4. Bayar nanti (simpan tagihan): di langkah 4 tekan Bayar nanti. Wajib pilih meja (dine-in) atau isi nama pelanggan (take away). Pesanan langsung masuk Bar/Dapur, tagihan tetap terbuka.
   - Tips: Saat pelanggan selesai, buka Pesanan Pelanggan / detail meja lalu tekan Final Bayar — pilih Cash/QRIS/Transfer, kembalian tampil di sana. Voucher, poin & diskon dipakai saat Final Bayar.
5. QRIS: tunjukkan QR resmi Garage, tunggu notifikasi berhasil di aplikasi bank, baru tekan Lunas.
6. Split bayar: satu tagihan dibayar dengan beberapa metode (mis. sebagian tunai, sisanya QRIS).
7. Split bill: satu meja dipisah jadi beberapa tagihan per orang.
8. Bill sementara (belum lunas) bisa dicetak dari detail meja. Struk ini bertanda BILL SEMENTARA.
9. Setelah lunas: isi nomor WA pelanggan lalu Kirim Invoice ke Customer — WhatsApp terbuka dengan rincian pesanan & link invoice, tinggal tekan kirim.

## 8. Cetak ulang, koreksi & pembatalan

1. Cetak ulang struk: menu Riwayat Struk Shift → Cetak ulang. Maksimal 3 kali per order. Setelah itu minta Manajer/Owner.
2. Salah pilih metode bayar (mis. tercatat Tunai padahal QRIS): Koreksi Metode Bayar sebelum tutup shift, dengan PIN Manajer/Owner.
3. Batal (void) / refund: ajukan dari detail order dengan alasan. Manajer/Owner menyetujui dengan PIN. Uang tunai yang dikembalikan otomatis dikurangkan dari laci.
   - **Penting:** Jangan mengembalikan uang sebelum void/refund disetujui sistem. Menu yang belum dibuat: bahan kembali ke stok. Menu yang sudah dibuat/diantar: dicatat waste.
4. Kasir tidak bisa menghapus atau membatalkan penjualan. Pesanan QR yang belum diterima boleh ditolak; yang sudah diproses Bar/Dapur → tekan Ajukan batal (Manajer/Owner yang menyetujui). Hapus invoice, ubah status/metode bayar, edit, dan arsip hanya Owner/Manajer.
5. Struk mencantumkan STATUS pembayaran (LUNAS / PENDING / GAGAL), metode (Cash/QRIS/Transfer), jumlah dibayar, dan Sisa tagihan bila belum lunas. QRIS tetap PENDING sampai Anda menekan Lunas setelah notifikasi bank masuk.

## 9. Kas keluar / masuk laci

Semua uang yang keluar atau masuk laci di luar penjualan wajib dicatat supaya hitungan tutup shift pas.

1. Tekan Kas Keluar / Masuk di POS.
2. Kas keluar: belanja kecil (es batu, gas), kasbon. Pilih kategori, tulis keterangan, isi nominal.
3. Kas masuk: tambahan uang kecil dari Owner. Pilih Kas masuk lalu isi nominal.
4. Mulai Rp50.000 (atau batas dari Owner) wajib PIN Manajer/Owner.
   - Tips: Slip kas keluar/masuk tercetak otomatis. Simpan bersama nota belanja.

## 10. Tutup shift & balancing uang

Penutupan memakai blind count: kasir menghitung uang tanpa melihat angka sistem. Selisih baru terlihat setelah shift ditutup.

1. Pastikan semua pesanan sudah dibayar atau diserahkan ke shift berikutnya.
2. Tekan Tutup Shift, lalu hitung uang laci per pecahan (Rp100.000, Rp50.000, … koin). Total terhitung otomatis.
3. Isi total QRIS dari aplikasi BNI (mutasi hari ini) untuk dicocokkan.
4. Pilih uang yang ditinggal di laci untuk shift berikutnya. Sisanya disetor ke Owner.
5. Centang checklist penutupan, tulis catatan bila ada kejadian.
6. Konfirmasi. Bila selisih besar, sistem meminta PIN Manajer/Owner sebagai saksi.
   - **Penting:** Jangan menghitung ulang untuk "mencari" angka sistem. Hitung jujur, selisih akan diperiksa Manajer.
7. Setelah ditutup, tekan Cetak slip (printer struk) dan serahkan slip + uang setoran ke Manajer/Owner.

## 11. Serah terima ke shift berikutnya

1. Kasir berikutnya membuka shift dengan modal awal = uang yang Anda tinggalkan di laci.
2. Sampaikan pesanan yang masih berjalan, meja terisi, dan catatan penting.
3. Logout dari akun Anda.

## 12. Proses pesanan Bar & Dapur

Kasir ikut mengontrol pesanan masuk: boleh Mulai, READY, dan memanggil waiter di Bar maupun Dapur.

1. Di POS tekan tombol Bar & Dapur (angka = tiket aktif): semua pesanan aktif tampil urut pesan duluan. Filter Semua / Bar / Dapur, tab Diantar 1 jam untuk yang sudah selesai.
2. Tiap tiket punya baris status: Antri → Dibuat → Siap → Waiter dipanggil → Diambil waiter → Diantar, lengkap dengan jam dan nama petugas. Tulisan besar di kanan atas = status sekarang.
3. Tombol besar = langkah berikutnya: Mulai buat → Siap & panggil waiter (cek item/jumlah/varian/catatan, lalu Ya, siap) → Panggil ulang waiter bila belum diambil.
4. Tidak perlu waiter (pelanggan ambil di kasir / take away)? Tekan Serahkan langsung — pesanan langsung berstatus Diantar atas nama Anda tanpa menunggu ACC waiter.
5. Cetak tiket: cetak chit satu pesanan untuk Bar/Dapur. Cetak semua tiket baru: cetak semua tiket Antri yang belum dicetak di laptop ini sekaligus (boleh lewat dialog print Chrome).
6. Layar Production penuh tetap bisa dibuka dari tombol di panel yang sama. Owner & Manajer memakai panel yang sama.
7. Salah tandai READY? Buka ulang tiket dengan alasan, selama belum diambil waiter.
   - **Penting:** Semua tindakan tercatat atas nama akun Anda. Pastikan pesanan benar-benar siap sebelum READY.

## 13. Kerja cepat kasir

Empat jalan pintas supaya antrean cepat habis.

1. Favorit: baris ⭐ Favorit di atas menu berisi 8 menu yang paling sering Anda tekan di perangkat ini (awal: menu Bestseller). Tekan sekali = masuk keranjang.
2. Kode singkat: ketik 2–4 huruf di kolom cari, mis. cl = Coffee Latte, ng = Nasi Goreng. Kode tertulis di pojok kiri atas tiap kartu menu. Tekan Enter untuk langsung memesan menu teratas.
3. Bayar 1 tap: di bawah tombol Bayar ada ⚡ Uang pas (take away, langsung lunas tunai, kembalian 0) dan ⚡ QRIS (take away, langsung ke layar QRIS). Di HP tombol ini ada di Keranjang.
   - **Penting:** Uang pas hanya bila pelanggan memberi uang tepat sejumlah total. Ada kembalian? Pakai tombol Bayar biasa.
4. Suara pesanan siap: saat Bar/Dapur menandai pesanan Siap, POS berbunyi dan muncul pesan "Pesanan siap: #antrian meja". Suara mengikuti setelan Suara QR (Off = senyap).

## 14. Laporan penjualan shift saya

1. Buka POS → Laporan Shift → "Penjualan shift saya" untuk melihat produk terlaris, kategori dan metode bayar shift Anda.
2. Tekan Cetak ringkasan untuk mencetak ke printer struk, atau CSV untuk diunduh.

## 15. Masalah umum

1. Internet putus: pesanan disimpan di antrean offline dan dikirim otomatis saat online kembali.
2. "Open shift wajib dilakukan": buka shift dulu.
3. "Shift sudah terbuka lebih dari 20 jam": tutup shift lama, lalu buka shift baru.
4. Printer tidak mencetak: cek kertas & daya, lalu tab Printer → Hubungkan → Tes cetak.
5. Ragu atau ada selisih: hubungi Manajer/Owner. Jangan menutupi selisih dengan uang pribadi.
