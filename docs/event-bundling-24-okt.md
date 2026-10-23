# Paket Bundling Event — checklist owner (dari `Menu_Event_GARAGE_1.xlsx`)

Paket = 1 rokok + 1 minuman pilihan (Hot/Cold) + 1 cemilan pilihan. Dijual di **POS** (tombol *Paket Event*)
dan di **menu digital** `/order` (bagian *Paket Bundling*). Harga paket tetap, dipecah otomatis ke komponen
untuk HPP, stok, dan laporan; rokok diserahkan kasir (tidak masuk tiket Bar/Dapur).

## 1. Deploy + data menu
1. Deploy branch ini (persetujuan owner + backup sesuai `docs/event-menu-release.md`), lalu `npm run db:migrate`.
   Migrasi `0148_menu_event_hot_variants.sql` hanya **menambah** (harga yang sudah ada tidak ditimpa):
   - Varian **Hot**: Sanger 15.000, Gula Aren 23.000, Hazelnut Latte 23.000, Vanilla Latte 23.000, Matcha 20.000,
     Coklat 20.000, Lemon Tea 15.000, Peach Tea 15.000, Ice Tea 8.000. Resep Hot = resep Cold tanpa es batu
     (dosis Hot sebaiknya dicek di Produk → Resep).
   - Produk baru: Red Velvet (Cold 22.000 / Hot 20.000), Taro (22.000 / 20.000), Tea Pahit (8.000 / 8.000),
     Strawberry Tea (15.000 / 8.000 — sesuai Excel, cek lagi harga Hot), LA Manggo 37.000 (rokok, tidak tampil di menu digital).
     Minuman baru belum punya resep → HPP masih kosong.
2. Opsional: Gudang → Sinkron resep OS supaya tampilan resep WMS ikut menampilkan varian Hot.
3. Produk → cek harga di atas. Nama tetap seperti di sistem: "Apel Djarum" (= Djarum 76 Apel), "Mineral" (= Mineral cleo).

## 2. Event
Modul Event → Buat event (tanggal & jam acara) → isi alamat, link Maps, WhatsApp → **aktifkan age gate (21+)** → Publish.
Tab *Menu Event* → **Jadikan menu utama digital** (wajib: POS dan `/order` mengambil paket dari event ini).

## 3. Empat paket (Menu Event → Paket bundling)
Setiap paket: kelompok **Rokok** (1 opsi: Black Matcha · Regular, jumlah 1), lalu kelompok **Minuman** dan **Cemilan**
(jumlah 1, centang semua opsi). Beri nama kelompok singkat ("Minuman", bukan "Pilihan Minuman") — kartu paket
otomatis menulis "Minuman pilihan". Jadwal paket = jam event. Kuota opsional.

| Paket | Harga | Minuman (centang varian) | Cemilan |
|---|---|---|---|
| Bundling 45.000 (Nongkrong Santai) | 45.000 | Sanger · Hot, Sanger · Cold, Lychee Tea · Cold, Lemon Tea · Hot, Lemon Tea · Cold | Kentang Ori, Sosis, Nugget |
| Bundling 50.000 (Best Seller) | 50.000 | Gula Aren, Hazelnut Latte, Vanilla Latte, Matcha, Coklat — masing-masing Hot & Cold | Kentang Ori, Sosis, Nugget |
| Bundling 55.000 (Mabar/Ramean) | 55.000 | Sanger · Hot/Cold, Lychee Tea · Cold, Lemon Tea · Hot/Cold | Mix Plater (1 opsi = otomatis) |
| Bundling 60.000 (Premium) | 60.000 | Caramel Macchiato · Cold (1 opsi = otomatis) | Kentang Balado, Sosis, Nugget |

Lychee Tea hanya tersedia Cold (sesuai Excel).

## 4. Uji sebelum buka
1. Menu Event → Preview: paket tampil, pilihan Hot/Cold muncul.
2. POS → *Paket Event* → pilih paket + isi → nama pelanggan → **Simpan & Final Bayar** → Cash. Cek chit Bar/Dapur
   tanpa rokok, struk berisi komponen paket.
3. `/order` (HP): tambah 1 paket + 1 menu biasa → checkout → terima di POS.
4. Laporan Event → penjualan paket tercatat. Batalkan/refund transaksi uji sesuai SOP.
