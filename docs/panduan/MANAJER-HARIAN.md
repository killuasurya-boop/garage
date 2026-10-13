# Panduan Harian Manajer

> Persetujuan, gudang (penerimaan, transfer, opname), keuangan harian, absensi & gajian, tim, dan pengaturan.
>
> Untuk: Manajer, Owner · Diperbarui 2026-10-13. Dokumen ini dibuat otomatis dari `src/lib/role-guides/` (`npm run docs:guides`) — ubah di sana, bukan di sini.

## 1. Buka hari

1. Buka Dashboard / Control Center: antrean produksi, meja, stok menipis, dan peringatan.
2. Absensi → Absen Hari Ini: cek siapa yang sudah masuk / terlambat.
3. Pastikan shift kasir dibuka dengan modal yang benar.

## 2. Persetujuan

1. Menu Persetujuan: diskon, void, refund, selisih kas, pengeluaran, dan opname. Tolak wajib dengan alasan.
2. Pengajuan yang Anda buat sendiri (pengeluaran, kasbon, opname) harus disetujui orang lain — sistem menolak persetujuan sendiri.
3. Pengeluaran di atas batas Owner: persetujuan Anda menjadi Direview — menunggu Owner.
4. Void/refund: bahan menu yang belum dibuat kembali ke stok; menu yang sudah dibuat/diantar dicatat waste (tercatat di Audit sebagai wasteItems).

## 3. Gudang (Warehouse)

1. Penerimaan barang: Receiving → buat draft (supplier, tanggal terima, metode bayar, qty, harga, QC) → Selesai. Stok bertambah, HPP diperbarui, belanja tercatat lunas.
   - **Penting:** Harga beli wajib benar — HPP semua menu ikut berubah. Salah input? Batalkan penerimaan dari Receiving.
2. Transfer antar ruang, Production (olah bahan), dan Adjustment (wajib alasan) hanya oleh Manajer/Owner.
3. Stock Opname dari staf: periksa hitungan, lalu Finalisasi & Reconcile Stok. Bahan yang tidak dihitung tidak diubah.
4. Smart Reorder untuk draft pesanan pembelian bahan yang menipis.

## 4. Keuangan harian

1. Catat pengeluaran (Finance → Pengeluaran) dengan kategori & bukti.
2. Riwayat & Laporan Shift → Rekap Harian: cocokkan QRIS, setujui selisih kas, tutup shift yang lupa ditutup.
3. Laporan Penjualan untuk omzet, produk terlaris, dan metode bayar.
4. Closing Keuangan harian di akhir hari (membuka ulang closing hanya Owner).

## 5. Absensi & gajian

1. Koreksi absen karyawan dengan alasan. Absen Anda sendiri hanya bisa dikoreksi Owner.
2. Gaji & fee harian difinalisasi otomatis pukul 23:59 — tidak bisa difinalisasi sebelum hari selesai.
3. Gajian & Kasbon: bayar per karyawan sampai tanggal tertentu. Sistem mencegah pembayaran ganda.
4. Rekap & Slip untuk dicetak / dibagikan.

## 6. Tim & pengaturan

1. Manajemen Tim: buat, ubah, nonaktifkan, atau reset password akun Kasir/Waiter. Atur posisi (workstation): Bar, Dapur, Helper, atau Kurir.
2. Reset PIN absen bila karyawan lupa.
3. Pengaturan: Meja & QR, printer, struk, batas PIN kas keluar/masuk.
4. CRM/Membership: koreksi poin wajib dengan alasan. Audit untuk memeriksa aksi sensitif.
