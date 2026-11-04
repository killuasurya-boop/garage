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

## Ketidakkonsistenan di dalam papan (diselesaikan di SKILL.md)
- "Keranjang" (00, 05, 06) vs "Daftar Pilihan" (03, layar penuh); "Tambah ke Keranjang" (00) vs "Tambah ke Daftar" (02).
- Kategori "Kopi/Non Kopi/Camilan" (00, 05) vs data "Coffee/Non-Coffee/Cemilan". Subkategori Espresso, Manual Brew,
  Signature, Cold Brew vs data: Kopi Susu, Americano, Milk Series, Tea Series.
- Satuan font ditulis "pt"; implementasi memakai px setara.
- Label varian di 03 memuat ukuran gelas ("Regular (12oz)", "Hot (8oz)"); data hanya punya Cold/Hot/Regular.
- Badge status berbahasa Inggris (Ready, Limited, Sold Out); ikuti papan.

## Detail tambahan yang mudah terlewat
- 02: handle + teks "Geser ke bawah untuk menutup" dan chevron; selektor Panas/Dingin berikon uap/kepingan salju;
  ukuran L dan level "Manis" ditunjukkan disabled pada papan state; tombol primary punya state default/pressed/disabled.
- 03: baris Subtotal berikon struk; tombol hapus merah persegi; "Kosongkan" dan "Edit Pesanan" bergaris tepi; chip
  "Butuh Bantuan?" berikon lonceng.
- 04: kartu hasil rekomendasi di chat memuat foto, nama, deskripsi pendek dan rating bintang; saran cepat berupa chip
  (Rekomendasi menu, Menu dingin, Menu terbaru, Lainnya); status "Online" hijau di header chat; tombol suara dan kirim.
- 05: breadcrumb "Beranda > Minuman > Espresso"; lencana jumlah filter; set ikon 24 px outline.
- 06: tiga toast bertingkat (sukses hijau, stok terbatas amber "Sisa 3 porsi", gagal merah) dengan tombol tutup.
