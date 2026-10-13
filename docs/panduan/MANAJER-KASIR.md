# Panduan Supervisi Kasir (Manajer & Owner)

> Persetujuan di kasir, rekap harian, selisih kas, QRIS, dan laporan penjualan.
>
> Untuk: Manajer, Owner · Diperbarui 2026-10-13. Dokumen ini dibuat otomatis dari `src/lib/role-guides/` (`npm run docs:guides`) — ubah di sana, bukan di sini.

## 1. Persetujuan dengan PIN di tablet kasir

PIN Manajer/Owner dipakai di tablet kasir. PIN tidak boleh diberikan ke kasir.

1. PIN di kasir hanya untuk diskon manual, void, refund, dan selisih kas. Pengeluaran besar & stok opname diputus dari menu Persetujuan.
2. Diskon manual: cek alasan & nominal, lalu masukkan PIN. Persetujuan hanya berlaku untuk nominal itu.
3. Void / refund: pastikan pelanggan benar-benar dikembalikan uangnya. Uang tunai otomatis dikurangkan dari laci shift asal.
4. Kas keluar/masuk kasir mulai batas nominal (default Rp50.000) butuh PIN Anda.
5. Koreksi metode bayar & cetak ulang struk ke-4 dst. juga lewat Anda.

**Tanya jawab**

- **PIN salah berkali-kali?** 5 kali salah mengunci PIN di tablet itu selama 15 menit.

## 2. Rekap Harian & selisih kas

1. Buka Riwayat & Laporan Shift → tab Rekap Harian, pilih tanggal.
2. Periksa tiap shift: omzet, tunai, non-tunai, kas seharusnya, dihitung, selisih.
3. Selisih: tanyakan ke kasir, lalu tekan Approve Selisih bila sudah jelas.
4. Cocokkan QRIS: masukkan total mutasi BNI per shift. Selisih QRIS dicatat terpisah dari laci.
5. Shift yang lupa ditutup muncul di atas. Hitung uangnya, lalu tutup shift dari sini.
6. Cetak slip per shift atau Cetak rekap ke printer struk untuk arsip.

## 3. Laporan penjualan

1. Tab Laporan Penjualan: pilih Hari ini, Kemarin, 7 hari, Bulan ini, atau tanggal sendiri.
2. Lihat produk terlaris, kategori, metode bayar, jam ramai, per kasir, dan tipe order.
3. Unduh CSV untuk Excel, atau Cetak ringkasan ke printer struk.

## 4. Pengaturan yang mempengaruhi kasir

1. Pengaturan → Shift & Cash: batas PIN kas keluar/masuk, wajib tanda tangan saat selisih.
2. Pengaturan → Receipt: kolom tanda tangan slip manajemen & jumlah cetak slip.
3. Pengaturan → Printer: Printer Perangkat Ini (per laptop).
4. Pajak & service saat ini 0% (Garage tidak memungut PB1/service).
5. Pakai poin member di kasir wajib scan QR kartu/aplikasi member (nomor HP saja ditolak sistem).
