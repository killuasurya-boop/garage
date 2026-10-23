# Closing Stock & Replenishment Request — Garage Coffee

## Audit dan batas

Basis kode: main `2288176269eacd2271b8cd6012c5c50fc847448d` ditambah integrasi W2 PR63 `b60a045b929551dcee843e94cc6e2c2815a90a71`. Pada saat audit awal, PR63 belum merged; branch baru harus ditinjau terhadap perubahan main berikutnya. Kondisi deployed/imported tidak dibuktikan oleh audit source.

Dipakai ulang: master `wms_product`, kategori/area, `wms_warehouse`, `wms_batch`, `wms_stock_movement`, `wms_warehouse_stock`, auth staff_profiles, audit, receiving supplier dan report engine. Gap: belum ada observasi closing per tanggal/divisi, reservasi, dokumen penerimaan internal dan shortage persisten. Internal Order lama langsung memindahkan stok. UI opname lama memiliki risiko save/finalize; receiving lama berpotensi membuat draft lagi setelah completion gagal. Perbaikan jalur lama yang tidak terkait tidak dijalankan diam-diam.

Produk POS, varian, harga jual, kategori, order, penjualan, dan pembayaran tidak boleh dimutasi modul ini. Data contoh hanya fixture DB terisolasi. Framework dan deployment tetap Next.js/Drizzle/PostgreSQL pada VPS garagecoffee.id.

## Workflow final

Closing menyimpan observasi stok fisik, bukan koreksi saldo. Staf memilih businessDate dan neededDate eksplisit, divisi dan lokasi sesuai penugasan. Draft dapat dilanjutkan dengan version check; submit mengunci isi. Tidak ada kebutuhan dicatat sebagai closing selesai tanpa reservasi atau mutasi stok.

Permintaan: Draft → Submitted → Under Review → Approved / Partially Available → Preparing → Ready → Dispatched → Partially Received → Completed. Rejected/Cancelled menyimpan alasan dan audit. State pengiriman dan shortage terpisah dari state permintaan.

Approval mereservasi jumlah yang disanggupi, tidak mengurangi onHand. Dispatch mengurangi sumber dan menambah ruang transit pada ledger yang sama. Penerima mengonfirmasi sebagian/seluruh alokasi batch; hanya jumlah diterima menambah stok divisi. Kerusakan masuk lokasi damaged yang dipetakan, bukan stok siap pakai. Sisa tetap tercatat dalam transit; expiry/provenance asli dipertahankan. Jangan menutup selisih sebagai barang diterima.

Shortage menjadi purchase requisition yang dapat disetujui/ditolak dengan supplier terdaftar dan biaya referensi. PO atau approval bukan bukti barang tersedia. Penerimaan pembelian tetap melalui Goods Receipt existing; tidak ada auto-payment, final PO tanpa otorisasi, atau perubahan purchase-basis Finance.

## Rekomendasi dan kalender

Rekomendasi = max(0, target − stok tersedia divisi − incoming terkonfirmasi). Hitungan fisik menjadi observasi pembanding, tidak menimpa ledger. Override jumlah harus beralasan. Minimum stock/manual tetap bekerja tanpa forecast. Jangan mencampur pengeluaran internal dengan konsumsi bisnis untuk forecast pembelian.

Default jam operasional 15:00–23:00 WIB; cutoff configurable. BusinessDate adalah tanggal operasional yang dipilih, bukan sekadar tanggal UTC saat submit. NeededDate adalah tanggal kebutuhan nyata. Late dihitung terhadap cutoff WIB businessDate dan tetap diaudit; tidak menggeser tanggal kebutuhan diam-diam.

## Schema dan migrasi

Migrasi additive 0147 setelah event0145 dan import0146: settings/outlet mappings/access, closing request/count items, reservations, shipment/batch allocations, shortage, events, mutation idempotency. Gunakan material dan lokasi existing; mapping lokasi/outlet dan penugasan staff wajib eksplisit. Tidak menebak akses dari nama gudang.

Nomor migrasi harus diperiksa ulang sebelum merge; SQL147, snapshot prevId dan journal harus konsisten. Jangan mengubah SQL yang sudah diterapkan. Validasi DDL baru tanpa menelan error. Pertahankan histori dokumen; reset lama diblokir bila histori closing ada. Tidak menjalankan reset/migrasi produksi sebagai bagian audit.

Rollback sebelum digunakan: kembali ke aplikasi sebelumnya, tabel additive tetap. Setelah ada reservasi/pengiriman, hentikan aksi baru dan selesaikan/reversal dokumen dengan audit; jangan drop tabel atau mengosongkan ledger. Backup/restore terverifikasi dan persetujuan release Owner tetap gate produksi.

## API dan otorisasi

Namespace `/api/wms/replenishment`: catalog, requests, requests/[id], requests/[id]/actions, preparation, shortages, shortages/[id]/actions, settings, reports. GET tidak memposting stok; POST/PATCH memvalidasi Zod, tanggal, qty/satuan, scope dan state. Semua mutasi memakai idempotency key serta payload hash; replay identik mengembalikan hasil sebelumnya, mismatch ditolak. Version mencegah draft/tab lama menimpa edit baru.

Owner/Manajer mengelola settings/approval. Staff Bar/Dapur memakai akun Kasir existing dengan workstation dan assignment lokasi eksplisit; petugas warehouse memakai capability warehouse pada lokasi tertentu. Semua scope outlet, lokasi, divisi dan aksi diperiksa di backend, termasuk exports. Jangan menganggap Kasir tanpa workstation sebagai staff semua divisi.

## UI

Perluas visual WMS existing: graphite sidebar, konten light, aksen merah, warning amber. Halaman closing: tanggal/divisi/lokasi, search/filterkategori, input cepat dengan kosong=belum dihitung, sistem vs aktual, rekomendasi/alasanoverride, ringkasan submit, draft saved/error/retry. Action44px, input mobile16px, keyboard/label/fokus yang jelas. Dashboard persiapan menggabungkan pick list per bahan namun tetap menyimpan alokasi tiap permintaan.

Navigasi baru ditambahkan tanpa menghapus halaman lama. Rute closing, requests, preparation, purchasing serta laporan dapat dibuka sesuai akses. Refresh status polling server; jangan menyebutnya push real-time jika bukan. Draft aktif tidak boleh ditimpa polling.

## Tahapan dan risiko

1. Rekonsiliasi W2 + main; schema dan kontrak.
2. Closing/count observations, RBAC, draft/no-request dan kalender.
3. Reservation → picking → dispatch → partial receipt, shortage.
4. UI/settings/notifications/report export dan integrasi reminder tanpa mengubah closing kasir.
5. Tests DB/API, migrasi strict, lint/TypeScript/build, UAT desktop/HP dan release checklist.

Risiko tertinggi: duplikasi replay, alokasi melebihi saldo saat paralel, expiry hilang, receiptparsial terhitung ganda, assignment lintasoutlet, tanggal setelah tengahmalam, report di luar scope, dan legacyoperations memakai stok reserved. Penjualan tetap mengikuti kebijakan stok minus Garage; jangan mengubah POS untuk mengamankan permintaan baru. Periksa ketersediaan lagi sebelum issue.

## Checklist bukti pengujian

- [x] Bar/Dapur terpisah; staff salahscope ditolak backend.
- [x] Draft/submit/no-request tidak mengubah ledger atau pembayaran.
- [x] Incoming/rekomendasi, cutoff dan neededDate benar pada batas WIB.
- [x] Reserved mengurangi available, bukan onHand; konflik/retry aman.
- [x] Dispatch/receive parsial/damaged mempertahankan qty, biaya, batch, expiry.
- [x] Shortage/approval tidak membuat stok atau kas.
- [x] Baseline POS SHA-256 identik; order/payment existing tidak berubah.
- [x] Report/CSV/XLSX/PDF memakai seluruh hasilfilter dan identitas Garage Coffee.
- [x] DDL147 strict, chain0145→0146→0147 konsisten; generate berikutnya nochange.
- [x] TypeScript/lint/build dan UAT1366×900/390×844 lulus atau keterbatasan dicatat.

Bukti aktual setelah development dicatat terpisah; checklist ini spesifikasi, bukan klaim tes sudah lulus.

Hasil aktual: lihat `docs/WMS-CLOSING-VALIDATION-2026-10-23.md`. Pengujian memakai DB sementara; status merge/deployment harus dibaca dari catatan validasi terbaru, bukan asumsi audit awal.
