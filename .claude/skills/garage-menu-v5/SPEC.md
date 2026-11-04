# SPEC Digital Menu V5 (terbaca dari papan, 4 Nov 2026)

Angka dan label di bawah diambil dari gambar. Jika berbeda dari data repo, data repo yang menang.

## 00 Dasar (overview)
- Palet: Metal Silver #C8C8C8, Garage Red #D43A3A, Charcoal #0E0E0E, Steel Gray #2A2A2A, Smoke #4A4A4A, Cream #EDE6DC.
- Tipografi satu keluarga font: H1 32 bold, H2 24 bold, H3 20 semibold, B1 16 regular, B2 14 regular, Caption 12 medium.
- Header: hamburger, logo tengah, ikon cari; garis merah menyala di bawah. Tombol: Primary merah gradasi, Secondary abu,
  Ghost outline. Search bar dengan ikon filter. Chip kategori (Semua, Kopi, Non Kopi, Makanan, Camilan) scroll horizontal;
  chip aktif merah. Status produk: Ready hijau, Limited amber, Sold Out merah. Favorit outline/filled. Kartu mini horizontal.
  Skeleton. Bottom nav: Beranda, Menu, Keranjang (lencana), Favorit, Akun. Toast sukses hijau. FAB merah bulat.

## 01 Product card
- Varian: default, hover/active (border dan glow merah, hati terisi), sold out (foto grayscale, harga redup, tombol abu).
- Foto 1:1 min 120 px atau 16:9 min 240x135. Radius 16 (utama), 12 (elemen kecil). Padding 16, jarak 8-12.
- Lebar kartu fleksibel 360-420, tinggi sekitar 120-144. Isi: judul tebal, subjudul singkat, badge status, harga, hati, tombol +.
- Stepper: default, focused (border merah), disabled. Tombol tambah: default, hover, pressed, disabled.

## 02 Quick view / varian
- Modal: lebar 720-840 (desktop/tablet), 92% (mobile); radius 20; padding 32; jarak vertikal 16-24; latar #0E0E0E dengan
  backdrop gelap blur. Handle geser ke bawah + tombol tutup X.
- Kiri foto rasio 3:4 radius 16. Kanan: judul (28-32 bold putih), deskripsi (16-18 #D4D4D4), harga (24-28 bold),
  selektor Panas/Dingin, ukuran S/M/L, level gula (Tanpa Gula, Sedikit, Normal, Manis), catatan opsional, stepper, tombol
  "Tambah ke Daftar". State: default, selected (merah), disabled.
- Urutan z: handle, tutup, gambar, judul, deskripsi, harga, hot/cold, ukuran, gula, catatan, stepper, tombol primary.

## 03 Daftar pilihan & panggil waiter
- Expanded: baris item (thumbnail 1:1, nama + varian, harga, stepper, hapus merah), baris subtotal, catatan "Ini bukan
  proses checkout", tombol Edit Pesanan, Kosongkan, Panggil Waiter (primary). Collapsed: jumlah item + total + chevron.
- Panggil Waiter: primary, outline, ikon saja (FAB), chip "Butuh Bantuan?", disabled saat daftar kosong.

## 04 AYA
- State widget: idle, listening (gelombang), thinking (titik), speaking, happy. Tombol melayang: default, new (titik
  merah), active listening. Kartu bantuan "Tanya AYA". Panel chat dengan saran cepat, kartu hasil menu, input + mic.
  Mic idle/active/stop dengan gelombang. Toggle Audio On / Mute. Contoh prompt rekomendasi.

## 05 Search, filter, navigasi
- Search bar: default, focus (border merah), loading, empty, filled (tombol hapus). Chip kategori dan subkategori.
  Filter dengan lencana jumlah, Urutkan (dropdown), toggle grid/list. Bottom nav. FAB: default, hover, pressed, disabled.
  Kembali + breadcrumb. Set ikon outline 24 px.

## 06 State, notifikasi, feedback
- Skeleton, empty ("Belum Ada Menu", Muat Ulang), error ("Gagal Memuat Data", Coba Lagi, Hubungi Tim), success
  ("Berhasil!", Lanjut Belanja), toast (sukses, stok terbatas amber, gagal merah), badge status, toggle efek suara.
- Gerak: hover 120 ms ease-out; pressed 80 ms ease-in; pop-in 180 ms ease-out; success pulse 300 ms ease-out;
  loading pulse 1,2 s ease-in-out.
