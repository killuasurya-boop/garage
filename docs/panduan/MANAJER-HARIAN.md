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
3. Profil karyawan (klik nama di Direktori): data diri, absensi bulan ini, saldo gaji/fee, kasbon, dokumen, dan aktivitas. NIK & rekening tampil tersamar — hanya Owner yang bisa mengubahnya.
4. Profil member (CRM → klik member): foto (klik avatar untuk mengganti), alamat, riwayat poin dapat/pakai/kedaluwarsa dengan saldo, order, dan voucher.
5. Pengaturan: Meja & QR, printer, struk, batas PIN kas keluar/masuk.
6. CRM/Membership: koreksi poin wajib dengan alasan. Audit untuk memeriksa aksi sensitif.

## 7. Undangan Grand Opening

Menu Undangan Digital: tamu, link undangan pribadi, dan rekap RSVP.

1. Tambah tamu satu per satu, atau tab Impor → unduh template → isi Nama, WhatsApp, Jumlah orang → Pratinjau → Simpan. Baris duplikat/tidak valid tidak ikut disimpan.
2. Tekan Buat undangan untuk membuat link pribadi semua tamu yang belum punya.
3. Bagikan manual: WhatsApp terbuka dengan pesan siap kirim. Kirim pesannya, lalu tekan Sudah dikirim — tandai dibagikan.
   - **Penting:** Status Dibagikan hanya catatan petugas, bukan bukti pesan terkirim/terbaca. Jangan tandai sebelum benar-benar mengirim.
4. Link tersebar ke orang lain? Tekan Link baru (link lama mati, jawaban RSVP tetap). Cabut = link tidak bisa dipakai sama sekali.
5. Pantau rekap: Hadir (undangan & total orang), Tidak hadir, Belum menjawab. Ekspor CSV hanya untuk Owner.
6. H-1 (Jumat 23 Okt): untuk tamu berstatus Hadir tekan Ingatkan H-1 — WhatsApp terbuka dengan pesan pengingat + link undangan. Kirim manual.
   - **Penting:** Tombol Ingatkan H-1 hanya muncul untuk tamu yang sudah konfirmasi Hadir. Pengingat tidak mengubah status Dibagikan.
