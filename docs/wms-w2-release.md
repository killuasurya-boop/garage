# WMS W2 — integrasi impor master dengan main

Lanjutan pekerjaan Claude Code PR #60 (head `23413f9e1407b86df6d8d1ba21ce692c7c122636`) di atas main `d022aa65dc9c0d1e65071dc75d27833a64314289`. Scope: integrasi W2 dan perbaikan keselamatan impor, bukan implementasi W3 atau instalasi runtime ERPNext.

## Perubahan

- Pertahankan 0145 event SQL/snapshot/journal milik main; tambahkan 0146 master import dan snapshot dari schema gabungan. Isi SQL master import identik dengan SQL W2 semula; runner produksi memakai hash isi. Timestamp journal baru mengikuti event.
- Pertahankan event quota reset; log/crosswalk impor masuk KEEP.
- Preview tidak mengubah bahan/resep/POS; pencatatan log preview tetap berjalan. Apply atomik, replan setelah advisory lock, tidak mengubah produk/varian/harga/kategori POS.
- Reimport tidak menghidupkan resep archived/rejected atau membuat hitungan draft semu.
- Kuantitas harus positif; hanya unit berdimensi sama yang dikonversi. Draft dengan baris invalid diblokir. Approval memeriksa ulang jumlah, unit, harga bahan, dan produk WMS.
- Approval menyinkronkan BOM hanya untuk menu terkait dalam transaksi yang sama; kegagalan sinkron mengembalikan draft/HPP semula.
- Decoder ZIP dibatasi ukuran input, jumlah entri, ukuran hasil dekompresi per entri/total dan memeriksa offset ZIP.

## Gate rilis (belum dijalankan di VPS)

1. Review PR dan CI; jangan merge PR #60 lama secara terpisah setelah integrasi ini.
2. Dapatkan persetujuan deploy owner sesuai CLAUDE.md; push/merge main memicu deployment VPS yang sudah ada.
3. Verifikasi backup database dan restore pada lingkungan terisolasi. Catat posisi migrasi aktual. Bila W2 0145 lama pernah dijalankan di luar main, verifikasi tabel/journal/hash sebelum tindakan; jangan menghapus histori migrasi.
4. Unduh baseline POS Owner sebelum dan setelah deploy, bandingkan hash; jangan menjalankan catalog overwrite atau reset produksi.
5. Jalankan migrasi dengan runner yang dipakai VPS. Pastikan tabel import/crosswalk dan tabel event tersedia. Jangan mengubah migrasi event 0145.
6. Owner membuka Gudang → Kelola Master → Impor Master Excel; pratinjau workbook asli pada database aktual. Angka 40 bahan/10 resep adalah hasil seed test, bukan janji keadaan produksi.
7. Terapkan setelah konflik/unit/gramasi diperiksa. Resep Dapur tetap draft sampai Owner/Manajer menyetujui; bahan ber-confidence rendah dan allowance yang dilewati tetap perlu verifikasi.
8. Uji order, void/refund, HPP, ledger, dan laporan; pastikan stok tidak terpotong ganda serta harga reguler/event tetap benar.

## Pemulihan

Sebelum impor: rollback aplikasi ke release sebelumnya bila perlu; tabel tambahan dapat dibiarkan. Sesudah impor: jangan drop tabel atau hapus bahan/ledger historis; hentikan persetujuan resep, arsipkan melalui alur yang diaudit atau gunakan prosedur restore terverifikasi sesuai keputusan owner. Jangan restore produksi otomatis atau mengubah stok langsung.

## Lanjutan yang belum diimplementasikan

W3 mengikuti `docs/WMS-AUDIT-2026-10.md`: permintaan belanja Bar/Dapur, PO, penerimaan parsial, supplier linkage, invoice/hutang/pelunasan, waste dan approval opname/internal order. Telusuri purchase-basis Finance dan `sourceDoc` terlebih dahulu agar penerimaan/invoice/pembayaran tidak menjadi biaya ganda. W4: dashboard/laporan serta panduan peran.
