# Paket Bundling Event — checklist owner (dari `Menu_Event_GARAGE_1.xlsx`)

Paket = 1 rokok + 1 minuman pilihan (Hot/Cold) + 1 cemilan pilihan. Dijual di **POS** (tombol *Paket Event*)
dan di **menu digital** `/order` (bagian *Paket Bundling*). **Harga paket = harga final** (sudah termasuk layanan
& pajak; promo QR/voucher/poin tidak berlaku untuk paket). Harga dipecah otomatis ke komponen untuk HPP, stok,
dan laporan; struk & invoice tetap menampilkan satu baris paket. Rokok diserahkan kasir (Final Bayar menampilkan
"Serahkan langsung: 1× Black Matcha"; chit mencetak blok SERAHKAN KASIR). Pelanggan menu digital mengonfirmasi
usia 21+ saat membuka paket berisi rokok.

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
Modul Event → Buat event (tanggal & jam acara, beri jam selesai dengan cadangan) → isi alamat, link Maps, WhatsApp
→ Publish. Kalau acara molor, perpanjang jam selesai event: paket yang berakhir bersama event ikut diperpanjang.
Tab *Menu Event* → **Jadikan menu utama digital** (wajib: POS dan `/order` mengambil paket dari event ini).

## 3. Empat paket (Menu Event → Paket bundling)
Setiap paket: kelompok **Rokok** (1 opsi: Black Matcha · Regular, jumlah 1), lalu kelompok **Minuman** dan **Cemilan**
(jumlah 1, centang semua opsi). Nama kelompok singkat ("Minuman", "Cemilan") — kartu menulis
"Minuman: pilih 1 dari 5" + daftar nama · Hot/Cold. Jadwal paket = jam event. Kuota sebaiknya kosong (tanpa batas).

| Paket | Harga | Minuman (centang varian) | Cemilan |
|---|---|---|---|
| Bundling 45.000 (Nongkrong Santai) | 45.000 | Sanger · Hot, Sanger · Cold, Lychee Tea · Cold, Lemon Tea · Hot, Lemon Tea · Cold | Kentang Ori, Sosis, Nugget |
| Bundling 50.000 (Best Seller) | 50.000 | Gula Aren, Hazelnut Latte, Vanilla Latte, Matcha, Coklat — masing-masing Hot & Cold | Kentang Ori, Sosis, Nugget |
| Bundling 55.000 (Mabar/Ramean) | 55.000 | Sanger · Hot/Cold, Lychee Tea · Cold, Lemon Tea · Hot/Cold | Mix Plater (1 opsi = otomatis) |
| Bundling 60.000 (Premium) | 60.000 | Caramel Macchiato · Cold (1 opsi = otomatis) | Kentang Balado, Sosis, Nugget |

Lychee Tea hanya tersedia Cold (sesuai Excel).

Tips cepat: buat Paket 45.000 dulu, lalu tombol **Duplikat** → ubah nama, harga, dan opsi minuman/cemilan
untuk paket lain. Di setiap kelompok ada kolom **cari** (ketik "latte", "kentang") dan opsi terpilih tampil
sebagai chip. **Foto paket**: tombol "Unggah foto paket" di form (JPG/PNG/WebP, otomatis dikompres). Tanpa
foto, kartu memakai kolase foto minuman + cemilan.

## 4. Uji sebelum buka
1. Menu Event → Preview: paket tampil, pilihan Hot/Cold muncul.
2. POS → *Paket Event* → pilih paket + isi → nama pelanggan → **Simpan & Final Bayar** → Cash. Cek chit Bar/Dapur
   tanpa rokok, struk berisi komponen paket.
3. `/order` (HP): tambah 1 paket + 1 menu biasa → checkout → terima di POS.
4. Laporan Event → penjualan paket tercatat. Batalkan/refund transaksi uji sesuai SOP.
