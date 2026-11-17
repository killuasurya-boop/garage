# Panduan Kasir — Pesanan & Penjualan Mitra (Partner Hub)

Keputusan Owner 16 Nov 2026. Panduan ini untuk kasir, Manajer, dan Owner di POS.

## 1. Membuka pesanan mitra
POS → menu kiri → **Pesanan Mitra**. Angka merah di menu = jumlah pesanan mitra yang perlu perhatian.

Panel terbuka di dalam POS. Di atas ada dua tab:
- **Berjalan**: pesanan yang masih diproses.
- **Selesai hari ini**: pesanan yang sudah diserahkan, diantar, ditolak, atau dibatalkan, beserta jam dan nama petugas.

## 2. Alur satu pesanan mitra
Setiap kartu memperlihatkan 4 langkah: **Masuk → Diproses → Siap → Diserahkan/Diantar**. Tombol utama selalu menunjukkan langkah berikutnya.

| Status | Yang dilakukan kasir |
|---|---|
| Menunggu mitra | Tunggu mitra menekan Terima. Kalau mitra lambat, hubungi lewat tombol **WA mitra** atau **Telepon**. Kalau perlu, tekan **Terima a.n. mitra**. |
| Diterima / Diproses | Mitra sedang membuat pesanan. Tekan **Tandai siap a.n. mitra** hanya bila barangnya sudah ada di titik serah-terima. |
| Siap · **take away** | Ambil di mitra, panggil pelanggan, lalu tekan **Serahkan ke pelanggan**. Cukup satu ketukan, langsung selesai. |
| Siap · **meja** | Tekan **Klaim & antar**, antar ke meja, lalu tekan **Sudah diantar**. Waiter bisa melakukan hal yang sama dari menu Ambil dari Mitra. |
| Ditolak mitra | Bill lunas → **Ajukan refund**. Bill belum dibayar → **Keluarkan dari bill**. Keduanya lewat persetujuan Manajer/Owner seperti biasa. |

Tombol "a.n. mitra" tercatat atas nama Anda di log mitra.

Kalau pesanan sedang dibawa staf lain, kartu menampilkan "Sedang diserahkan/diantar oleh …". Hanya Owner/Manajer yang bisa menyelesaikan pesanan itu.

## 3. Jam layanan produk mitra
Default jam layanan **17.00–22.30 WIB**. Owner bisa mengubahnya di Pengaturan → Partner Hub. Kalau kedua jam dikosongkan, tidak ada batas jam.

Di luar jam layanan:
- Produk mitra tampil **"Tutup · buka 17.00"** di POS, waiter, dan menu digital, dan **tidak bisa dipesan**.
- Status mitra yang masih Buka/Jeda ditutup otomatis pukul 22.30, dan mitra mendapat notifikasi di HP.
- Pesanan yang **sudah masuk sebelum 22.30 tetap diselesaikan**. Pesanan pelanggan pukul 22.29 tetap sah walau kasir baru menerimanya pukul 22.32.

Pukul 17.00 produk otomatis bisa dipesan lagi, dan mitra mendapat pengingat untuk menekan BUKA.

## 4. Penjualan mitra di laporan shift
- **Selama shift berjalan:** POS → Laporan → kartu **Penjualan mitra shift ini**, lalu tombol **Rincian mitra**.
- **Setelah tutup shift:**
  - Riwayat & Laporan Shift → detail shift → kartu **Penjualan Mitra**;
  - PDF **Laporan Lengkap** → seksi **Penjualan Mitra (Partner Hub)**, plus 3 kartu di Ringkasan Eksekutif.
  - PDF **tutup shift** (tombol PDF di POS / Laporan Shift) → seksi **Penjualan Mitra (Partner Hub)** sebelum
    Rekonsiliasi Kas Laci: tabel per mitra (produk, qty, harga, penjualan, modal mitra, profit), wajib bayar ke mitra,
    profit Garage, belum siap, ditolak, bill belum dibayar, dan catatan setoran;
  - **Slip tutup shift** (printer struk) → seksi **PENJUALAN MITRA** sebelum KAS LACI dengan rincian yang sama.
    Angka mitra bukan uang laci; dibayar lewat setoran harian mitra.

Arti angka:

| Angka | Arti |
|---|---|
| Penjualan mitra | Harga jual × qty produk mitra yang **sudah siap** dari mitra di order shift ini. |
| Modal mitra = **Wajib bayar ke mitra** | Harga setor × qty siap. Garage wajib membayar walau bill pelanggan belum dibayar atau dibatalkan setelah siap. |
| Profit Garage | Penjualan − modal mitra − refund pelanggan atas produk mitra. |
| Belum siap | Masih di mitra; dihitung setelah mitra menandai Siap. |
| Ditolak/batal | Rp0 ke mitra. |

Uang mitra **tidak dibayar dari laci**. Wajib bayar ini masuk rekap setoran harian mitra (Keuangan Mitra), dan dibayar paling lambat esok harinya pukul 12.00 WIB lewat transfer.

## 5. Cek silang laporan shift (Keuangan Mitra)
Keuangan Mitra → kartu **Cek silang laporan shift** membandingkan dua angka untuk tanggal yang dipilih:
- **Wajib bayar di rekap setoran:** semua pesanan mitra yang sudah siap.
- **Tercatat di laporan shift:** yang masuk laporan shift kasir.

Status kartunya:
- **Cocok:** kedua angka sama.
- **Ada selisih:** muncul daftar pesanan yang tidak masuk shift mana pun, beserta sebabnya. Contohnya pesanan Owner tanpa shift, atau bill pelanggan yang belum dibayar. Pesanan itu tetap wajib dibayar ke mitra. Periksa dulu sebelum menyetujui setoran.

## 6. Bila koneksi terputus
Panel Pesanan Mitra tetap menampilkan kartu terakhir disertai banner **"Koneksi terputus — data terakhir pukul …"**. Panel mencoba lagi otomatis. Setiap tombol tetap dicek ulang oleh server, jadi tidak ada pesanan yang berubah tanpa tercatat.

## 7. Proses otomatis
Penutupan jam layanan, peringatan pesanan mitra lambat, dan pengingat setoran berjalan otomatis di server.
- Bila salah satunya gagal 3 kali berturut-turut, Owner mendapat notifikasi.
- Bila sudah normal kembali, Owner juga dikabari.
- Statusnya bisa dilihat di Partner Hub → Kelola Mitra → **Kesehatan mitra → Proses otomatis**.
