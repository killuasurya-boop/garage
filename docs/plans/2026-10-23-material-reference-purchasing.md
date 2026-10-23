# Acuan bahan, kesiapan lokasi, dan purchasing Closing Stock

## Audit sebelum perubahan

Runtime main diperiksa pada 3f434b9 (23 Oktober 2026). Closing/replenishment sudah tersedia; shortage belum mempunyai PO persisten atau hubungan receipt. Master import menerima XLSX, bukan CSV owner. Tampilan closing memfilter kategori tetapi seluruh bahan tetap menjadi daftar panjang tanpa bagian kategori. Pemetaan lokasi/staf memiliki API pengaturan, belum ada pemeriksaan kesiapan terpadu.

Sumber owner DATA GUDANG.csv berisi 76 bahan: Bar 36, Dapur 40. Semua Barcode/Stok kosong. Kategori sumber hanya Bar dan Dapur; tidak dibuat pengelompokan spekulatif. Min Stok adalah batas stok, bukan isi kemasan. HPP tampak harga kemasan; data ini tidak cukup menentukan biaya per ml/gr. BAR-9NN dipetakan ke BAR-0NN, tidak membuat bahan kembar. Konflik satuan/kemasan/harga dipertahankan sebagai temuan. Resep aktif yang tervalidasi tidak ditimpa.

## Fitur existing yang dipakai kembali

Master imports/crosswalk/audit, master bahan WMS dan inventory bridge, resep aktif/draft/approval, RBAC outlet, warehouse mappings, shortage approval, receiving dan recordCashPurchases. POS produk/harga/varian/kategori/transaksi/pembayaran tetap terlindungi.

## Workflow dan API

- Owner: acuan CSV bawaan/upload → pratinjau per Bar/Dapur → cocokkan SKU canonical → terapkan referensi dan perubahan minimum yang aman secara atomik/idempoten. Stok kosong tidak diposting. Bahan baru ambigu menunggu validasi eksplisit.
- Resep: tampilkan hubungan bahan canonical dengan resep existing beserta status/qty/unit; bahan tanpa resep ditandai. Tidak membuat resep/takaran dari daftar bahan. Draft baru harus memakai gramasi aktual dan approval existing.
- Closing: bagian kategori berurutan, dapat dilipat dengan jumlah bahan dan progres; pencarian tetap mencakup seluruh kategori.
- Readiness: GET read-only khusus manajemen memeriksa lokasi/divisi/transit/rusak/akses staf tanpa mengubah izin atau ledger.
- Purchasing: approved shortage → aksi manajemen membuat draft PO → approval PO → receipt draft → penyelesaian receipt existing. PO tidak mengubah stok/kas. Receipt satu-satunya posting stok/biaya pembelian.

## Migrasi dan risiko

Migrasi 0148 additive untuk PO, detail dan tautan receipt; tidak mengubah migrasi terpasang. Referensi CSV memakai master_imports/crosswalk existing, tidak perlu tabel master ganda. Backup dan staging wajib sebelum rilis; perubahan produksi hanya setelah validasi. Rollback tidak menghapus ledger/receipt yang sudah diposting.

Risiko utama: salah mengartikan HPP/Min Stok/kemasan, duplikasi BAR9xx, lebih-terima dari dua draft, biaya pembelian ganda, akses lintas outlet, konflik reservasi, dan status readiness yang memberi kesan sudah siap tanpa staf. Semua ditangani melalui validasi eksplisit, relasi canonical, transaksi/locking, dan pengujian berbasis risiko.

## Checklist pengujian

- [ ] Parse 76 baris persis, harga berkoma, stok kosong tetap unknown.
- [ ] Pemetaan BAR9NN→BAR0NN, satuan berbeda/kemasan ambigu, konflik harga.
- [ ] Impor idempoten, RBAC Owner, POS hash sebelum/sesudah.
- [ ] Coverage resep hanya hubungan existing; tidak menebak BOM/HPP.
- [ ] Readiness lokasi/akses scope outlet dan peran backend.
- [ ] PostgreSQL multi-koneksi: reservasi bersaing, idempotency, saldo/rollback.
- [ ] PO dibuat/approved eksplisit, receipt parsial/lebih/replay dan biaya tunggal.
- [ ] db:generate, typecheck, lint, tests, build.
- [ ] UI desktop1366 dan mobile390 tanpa teks/aksi terpotong.

Bukti hasil diisi setelah pelaksanaan, bukan asumsi audit awal. Lingkungan saat audit tidak mempunyai sesi manajemen produksi; tidak ada impor, perubahan akses atau transaksi produksi dilakukan.
