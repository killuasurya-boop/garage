# Panduan Kasir & Shift

> Alur kerja kasir Garage dari login, buka shift, melayani pesanan, sampai tutup shift dan balancing uang laci.
>
> Untuk: Kasir · Diperbarui 2026-10-13. Dokumen ini dibuat otomatis dari `src/lib/role-guides/` (`npm run docs:guides`) — ubah di sana, bukan di sini.

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

## 5. Member, voucher & diskon

1. Cari member dengan nomor HP, atau daftarkan member baru dari kasir.
2. Voucher: masukkan kode lalu cek. Voucher pribadi hanya bisa dipakai pemiliknya, dan kuota voucher dibatasi.
3. Poin: tekan Scan QR member, lalu pindai QR di kartu/aplikasi member (kamera atau scanner). Setelah terverifikasi, isi jumlah poin yang dipakai. Potongan muncul di ringkasan bayar.
   - **Penting:** Poin tidak bisa dipakai hanya dengan nomor HP. QR harus milik member yang dipilih.
4. Diskon manual hanya untuk member. Di atas batas yang ditentukan Owner, tekan Minta Persetujuan lalu Manajer/Owner memasukkan PIN di tablet kasir.
   - **Penting:** Persetujuan diskon hanya berlaku untuk nominal yang disetujui dan untuk kasir yang meminta.

## 6. Pesanan QR dari pelanggan

1. Pesanan dari QR meja / menu digital muncul di daftar QR order dengan bunyi notifikasi.
2. Periksa isi pesanan lalu tekan Terima. Pesanan Take away & Delivery harus Lunas dulu sebelum diterima.
3. Tolak bila menu habis atau pesanan tidak jelas. Stok dan poin pelanggan dikembalikan otomatis.
4. Pelanggan yang bergabung di meja terisi memakai kode gabung 4 angka yang tercetak di struk.

## 7. Pembayaran

1. Tekan Bayar, pilih metode: Tunai, QRIS, Transfer, atau E-Wallet.
2. Tunai: masukkan uang yang diterima. Sistem menghitung kembalian dan menolak bila uang kurang.
   - Tips: Hitung kembalian di depan pelanggan sebelum laci ditutup.
3. QRIS: tunjukkan QR resmi Garage, tunggu notifikasi berhasil di aplikasi bank, baru tekan Lunas.
4. Split bayar: satu tagihan dibayar dengan beberapa metode (mis. sebagian tunai, sisanya QRIS).
5. Split bill: satu meja dipisah jadi beberapa tagihan per orang.
6. Bill sementara (belum lunas) bisa dicetak dari detail meja. Struk ini bertanda BILL SEMENTARA.

## 8. Cetak ulang, koreksi & pembatalan

1. Cetak ulang struk: menu Riwayat Struk Shift → Cetak ulang. Maksimal 3 kali per order. Setelah itu minta Manajer/Owner.
2. Salah pilih metode bayar (mis. tercatat Tunai padahal QRIS): Koreksi Metode Bayar sebelum tutup shift, dengan PIN Manajer/Owner.
3. Batal (void) / refund: ajukan dari detail order dengan alasan. Manajer/Owner menyetujui dengan PIN. Uang tunai yang dikembalikan otomatis dikurangkan dari laci.
   - **Penting:** Jangan mengembalikan uang sebelum void/refund disetujui sistem. Menu yang belum dibuat: bahan kembali ke stok. Menu yang sudah dibuat/diantar: dicatat waste.

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

## 12. Laporan penjualan shift saya

1. Buka POS → Laporan Shift → "Penjualan shift saya" untuk melihat produk terlaris, kategori dan metode bayar shift Anda.
2. Tekan Cetak ringkasan untuk mencetak ke printer struk, atau CSV untuk diunduh.

## 13. Masalah umum

1. Internet putus: pesanan disimpan di antrean offline dan dikirim otomatis saat online kembali.
2. "Open shift wajib dilakukan": buka shift dulu.
3. "Shift sudah terbuka lebih dari 20 jam": tutup shift lama, lalu buka shift baru.
4. Printer tidak mencetak: cek kertas & daya, lalu tab Printer → Hubungkan → Tes cetak.
5. Ragu atau ada selisih: hubungi Manajer/Owner. Jangan menutupi selisih dengan uang pribadi.
