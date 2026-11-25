# Panduan Supervisi Kasir (Manajer & Owner)

> Persetujuan di kasir, rekap harian, selisih kas, QRIS, dan laporan penjualan.
>
> Untuk: Manajer, Owner · Diperbarui 2026-10-19. Dokumen ini dibuat otomatis dari `src/lib/role-guides/` (`npm run docs:guides`) — ubah di sana, bukan di sini.

## 1. Persetujuan dengan PIN di tablet kasir

PIN Manajer/Owner dipakai di tablet kasir. PIN tidak boleh diberikan ke kasir.

1. PIN di kasir hanya untuk diskon manual, void, refund, dan selisih kas. Pengeluaran besar & stok opname diputus dari menu Persetujuan.
2. Hapus invoice BELUM lunas: di POS buka Pesanan Pelanggan atau detail meja → Hapus invoice → isi alasan → ketik nomor invoice → Ya, hapus. Pesanan Bar/Dapur ikut batal, stok kembali, tercatat di Audit Log.
   - **Penting:** Invoice LUNAS tidak bisa dihapus. Gunakan Batal (void) / Refund dari Riwayat Struk Shift dengan alasan — riwayat tetap ada untuk laporan penjualan & keuangan.
3. Riwayat Penjualan → filter status bayar (Pending/Lunas/Dibatalkan/Refund), metode, jenis pesanan, tanggal, arsip. Tombol ⋯ / detail: Edit info, Konfirmasi lunas, Ubah metode bayar, Batalkan pelunasan (salah input, shift masih buka — bukan refund), Batalkan order, Hapus/Arsip/Pulihkan, Riwayat perubahan. Semua wajib alasan & tercatat.
4. Diskon manual: cek alasan & nominal, lalu masukkan PIN. Persetujuan hanya berlaku untuk nominal itu.
5. Void / refund: pastikan pelanggan benar-benar dikembalikan uangnya. Uang tunai otomatis dikurangkan dari laci shift asal.
6. Kas keluar/masuk kasir mulai batas nominal (default Rp50.000) butuh PIN Anda.
7. Koreksi metode bayar & cetak ulang struk ke-4 dst. juga lewat Anda.

**Tanya jawab**

- **PIN salah berkali-kali?** 5 kali salah mengunci PIN di tablet itu selama 15 menit.

## 2. Rekap Harian & selisih kas

1. Buka Riwayat & Laporan Shift → tab Rekap Harian, pilih tanggal.
2. Periksa tiap shift: omzet, tunai, non-tunai, kas seharusnya, dihitung, selisih.
3. Selisih: tanyakan ke kasir, lalu tekan Approve Selisih bila sudah jelas.
4. Cocokkan QRIS: masukkan total mutasi BNI per shift. Selisih QRIS dicatat terpisah dari laci.
5. Shift yang lupa ditutup muncul di atas. Hitung uangnya, lalu tutup shift dari sini.
6. Cetak slip per shift atau Cetak rekap ke printer struk untuk arsip.

## 3. Laporan pertanggungjawaban kasir (PDF)

Satu PDF A4 berisi seluruh aktivitas kasir, uang, produk, void, refund, petty cash & kejadian.

1. Riwayat & Laporan Shift → tab Laporan Lengkap → pilih tanggal operasional.
2. Unduh per shift, per kasir, Seluruh kasir, Kas & Petty cash, atau Gabungan harian. Nama file: GARAGE_[OUTLET]_SHIFT_YYYY-MM-DD_[ID-SHIFT].pdf (revisi final: _V02), Laporan_Kasir_…, Laporan_Kas_PettyCash_…, Laporan_Operasional_Kasir_Garage_….
3. Buka detail shift yang sudah ditutup → Pemeriksaan Manajer → tulis hasil, lalu Verifikasi laporan atau Perlu tindak lanjut. Status ini tercetak apa adanya di PDF.
4. Verifikasi modal awal dari kartu yang sama (siapa menghitung & siapa memverifikasi tercatat).
5. Petty cash: tab Petty Cash → Setujui / Tolak pengajuan kasir (tolak wajib alasan). Isi dana lewat jenis Penambahan dana.
6. Catatan kejadian: beri Catatan Manajer & tandai selesai dari detail shift.

## 4. Laporan penjualan

1. Tab Laporan Penjualan: pilih Hari ini, Kemarin, 7 hari, Bulan ini, atau tanggal sendiri.
2. Lihat produk terlaris, kategori, metode bayar, jam ramai, per kasir, dan tipe order.
3. Unduh CSV untuk Excel, atau Cetak ringkasan ke printer struk.

## 5. Pengaturan yang mempengaruhi kasir

1. Pengaturan → Shift & Cash: batas PIN kas keluar/masuk, wajib tanda tangan saat selisih.
2. Pengaturan → Receipt: kolom tanda tangan slip manajemen & jumlah cetak slip.
3. Pengaturan → Printer: Printer Perangkat Ini (per laptop).
4. Pajak & service saat ini 0% (Garage tidak memungut PB1/service).
5. Pakai poin member di kasir wajib scan QR kartu/aplikasi member (nomor HP saja ditolak sistem).
