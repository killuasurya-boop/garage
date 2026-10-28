# Cek 10 Menit Setelah Deploy (Owner / Manajer)

Tujuan: memastikan login, hapus, foto, dan Penjualan Langsung benar-benar jalan setelah update.
Kerjakan berurutan; tandai ✅ / ❌ dan kirim nomor yang ❌ (plus screenshot) ke developer.

## 1. Login & sesi
1. Buka aplikasi di **laptop** dan **HP/tablet kasir**. Tab lama yang masih terbuka dari sebelum deploy
   akan memuat ulang sendiri — itu normal.
2. Login Owner → saat diminta kode 2FA, centang **"Ingat perangkat ini 30 hari"** (hanya di perangkat pribadi,
   jangan di tablet bersama).
3. Salah ketik password 3–5 kali dengan sengaja, lalu masukkan password yang benar → harus tetap bisa masuk
   (akun tidak lagi dikunci 15 menit).
4. Biarkan aplikasi terbuka ±1 jam tanpa dipakai, lalu klik menu apa pun → tidak boleh logout sendiri.
5. Bila suatu saat muncul **"Sesi login Anda sudah berakhir"** di dialog staf: klik **Login ulang (tab baru)**,
   login, kembali ke tab awal, tekan Simpan lagi — isian tidak hilang.

## 2. Staf
1. Kelola Staff → **Tambah Staff** di HP: dialog bisa digulir, tombol Simpan terlihat → simpan staf uji.
2. Foto: buka profil karyawan staf uji → upload foto → di daftar Kelola Staff fotonya tampil sebagai avatar.
3. Hapus staf uji yang **baru dibuat** → terhapus.
4. Hapus staf yang **sudah punya absen/gaji/kasbon/transaksi** → muncul penjelasan riwayat dan tawaran
   **Nonaktifkan** (riwayat gaji & kasbon tidak ikut hilang). Pilih Batal bila tidak ingin.

## 3. Produk
1. Produk Manajemen → tambah produk uji + **upload foto** → foto tampil di POS dan menu digital.
2. Restart tidak perlu dicek oleh Owner; operator cukup memastikan foto lama masih tampil setelah deploy.
3. **Hapus** produk uji yang belum pernah terjual → hilang dari daftar.
4. **Hapus** produk yang sudah pernah terjual / ada di menu event → muncul tawaran **Arsipkan** (bisa dipulihkan).

## 4. Penjualan Langsung (POS)
1. Buka shift kasir → tombol **Penjualan Langsung**.
2. Kartu produk bergambar tampil; tab **Favorit / Semua / Minuman Botol / Rokok …** bisa dipilih.
3. Scan barcode (atau ketik SKU) lalu Enter → masuk keranjang.
4. Di HP: bar total menempel di bawah → **Bayar** menggulir ke pembayaran.
5. Tunai **Uang pas** → struk muncul → **Jual lagi** → kolom scan langsung siap.
6. Ulangi dengan **QRIS** (isi No. Ref bila diwajibkan).

## Bila ada yang ❌
Catat nomor langkah, perangkat (laptop/HP/tablet), jam kejadian, dan screenshot. Jangan hapus data apa pun
untuk "mengakali" — kirim ke developer dulu.
