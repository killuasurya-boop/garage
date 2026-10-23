# Panduan Closing Stock — Garage Coffee

## Pengaturan awal oleh Owner/Manajer

Buka **Warehouse → Persiapan Besok → Atur lokasi & akses**.

1. Petakan gudang sumber, lokasi Bar dan lokasi Dapur yang sudah terdaftar ke outlet aktif. Periksa area bahan dan satuan master sebelum digunakan.
2. Pilih lokasi transit dan barang rusak yang terpisah. Jika belum tersedia, gunakan **Tambah lokasi pendukung**, masukkan kode unik serta nama lokasi sebenarnya. Tindakan ini membuat lokasi kosong; tidak membuat bahan atau saldo stok.
3. Tugaskan akun staf sebenarnya ke lokasi dan wewenangnya. Staf Bar/Dapur tetap memerlukan workstation yang sesuai. Petugas gudang memerlukan penugasan gudang sumber.
4. Periksa jam operasional dan batas pengajuan dalam WIB, lalu simpan.

Pemetaan lokasi tidak memindahkan stok. Owner/Manajer harus memeriksa stok awal dan rekonsiliasi melalui prosedur inventaris yang berlaku.

## Closing Bar dan Dapur

1. Buka **Closing Stock**. Periksa divisi, lokasi, tanggal operasional dan tanggal bahan dibutuhkan. Tanggal kebutuhan selalu eksplisit, termasuk setelah tengah malam.
2. Cari bahan atau filter kategori. Isi stok fisik: **0 berarti sudah dihitung dan kosong berarti belum dihitung**. Periksa target dan jumlah usulan. Jika jumlah permintaan berbeda dari rekomendasi, tulis alasan.
3. Pilih **Tinjau & Kirim**, periksa ringkasan, lalu **Kirim ke Gudang**. Jika tidak membutuhkan tambahan, pilih **Tidak Ada Permintaan**.

Draft disimpan ke server setelah perubahan. Pastikan indikator sudah tersimpan sebelum meninggalkan halaman. Gunakan **Lihat Riwayat → Lanjutkan draft closing** untuk melanjutkan. Jika koneksi tidak pasti, gunakan pengulangan tindakan yang sama agar sistem tidak membuat dokumen ganda.

Selisih hitungan fisik tidak mengubah stok resmi. Koreksi persediaan tetap menggunakan prosedur penyesuaian yang disetujui. Permintaan setelah batas waktu diberi penanda Late Request.

## Persiapan dan pengiriman gudang

1. Buka **Persiapan Besok**, pilih tanggal kebutuhan/divisi/status. Daftar picking gabungan mempertahankan referensi setiap permintaan.
2. Buka permintaan. Owner/Manajer memilih gudang sumber dan menyetujui jumlah yang dapat dipenuhi. Persetujuan hanya mereservasi stok.
3. Petugas gudang mengisi jumlah disiapkan, lalu menandai siap diserahkan.
4. Pilih sumber dan jumlah yang benar, lalu kirim bahan. Stok sumber pindah ke transit; stok Bar/Dapur belum bertambah.
5. Jika stok kurang, buka **Kekurangan & Pembelian**. Jangan mengganti jumlah diterima agar dokumen terlihat selesai.

Penerimaan stok baru atau pembelian tidak otomatis menjalankan persetujuan/pengiriman ulang. Manajemen perlu meninjau kembali sisa kebutuhan dan reservasi.

## Penerimaan oleh divisi

Buka permintaan dan pilih **Konfirmasi penerimaan**. Periksa batch serta jumlah tersisa. Isi tambahan jumlah baik dan rusak yang benar-benar diterima pada pemeriksaan ini; tulis alasan kerusakan. Jumlah baik menambah stok divisi, jumlah rusak masuk lokasi rusak, dan sisa tetap dalam perjalanan.

Penerimaan dapat dicicil. Jangan memasukkan jumlah kumulatif yang sudah pernah dikonfirmasi.

Jika seluruh pengiriman sudah dipertanggungjawabkan tetapi terdapat barang rusak, Owner/Manajer dapat memilih **Tutup dengan selisih disetujui** dan mencatat alasan. Opsi ini hanya muncul saat tidak ada sisa transit atau reservasi dan jumlah baik+rusak memenuhi jumlah diminta. Histori dan jumlah rusak tetap terlihat; tidak ada penambahan stok baik atau pembayaran.

## Kekurangan dan pembelian

Owner/Manajer memilih supplier terdaftar serta menyetujui/menolak usulan. Persetujuan ini bukan PO final, pembayaran atau bukti barang tersedia.

Proses pengadaan dan **Penerimaan barang / Goods Receipt** menggunakan modul existing. Saat ini hubungan usulan ke dokumen penerimaan ditelusuri melalui referensi operasional; belum ada pembuatan/penautan PO otomatis dari shortage. Setelah stok benar-benar diterima, tinjau kembali permintaan gudang.

## Riwayat dan laporan

Buka **Permintaan Bahan** untuk status/notifikasi aktual dan histori pelaksana. Gunakan filter tanggal, divisi dan status; ekspor PDF, Excel atau CSV menggunakan data yang diizinkan untuk akun tersebut.

Laporan membedakan stok fisik closing, selisih, permintaan, persetujuan, pengiriman, penerimaan dan kerusakan. Pemenuhan tepat waktu berarti penerimaan selesai sebelum jam mulai operasional pada tanggal kebutuhan. Dokumen yang ditutup dengan kerusakan diberi keterangan selisih disetujui.

Panduan ini menjelaskan implementasi pada branch pengembangan. Penggunaan produksi menunggu validasi dan release terkontrol.
