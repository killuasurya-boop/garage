# Garage Coffee — audit kesiapan operasional WMS

Status revisi: PR #66, head `443f9677e0c86030d19766da9f8efd29081cdc23`. **Belum di-merge/deploy; belum dinyatakan siap operasional penuh.** Audit ini membedakan bukti kode/tes terisolasi dengan data dan aktivitas produksi. Runtime produksi sebelumnya berasal dari PR #64.

## Bukti yang sudah selesai

- CI #180 SUCCESS: https://github.com/killuasurya-boop/garage/actions/runs/39950671332 . Typecheck dan lint lulus; 164 file/1.058 tes lulus. Tiga tes PostgreSQL dilewati pada job PGlite, kemudian dijalankan terpisah.
- PostgreSQL16 multi-koneksi SUCCESS: https://github.com/killuasurya-boop/garage/actions/runs/39950671103 . Tiga tes benar-benar lulus, bukan fallback PGlite. Mencakup permintaan idempoten, reservasi bersaing dan penerimaan berulang/stale. Bukti dua backend PID menunggu lock diverifikasi dalam tes. Ini membuktikan serialisasi modul, bukan kinerja beban produksi atau efikasi row lock secara terpisah.
- Build standalone produksi revisi443f967 berhasil (317 halaman); Typecheck terpisah sudah lulus pada source yang sama. Build memakai secret acak khusus uji, database terisolasi dan scheduler dimatikan. Percobaan awal gagal karena BETTER_AUTH_SECRET pengujian belum diisi; konfigurasi itu diperbaiki tanpa mengubah kode aplikasi.
- Lokal: db:generate tidak menemukan perubahan schema yang belum dimigrasikan; typecheck lulus dengan heap6GB; lint0error dan1warning logo POS lama. Integrasi terfokus9file/52tes lulus.
- CSV sumber persis76baris (36Bar/40Dapur) disertakan beserta SHA dan raw cells. Stok kosong tetap unknown; tidak ada posting saldo awal atau penimpaan harga/satuan/resep tervalidasi.

## Cakupan gudang dan batas bukti

| Alur | Bukti kode/tes | Persyaratan sebelum operasional penuh |
|---|---|---|
| Master bahan & impor | Rekonsiliasi SKU, insert-only, validasi unit/kemasan, alias/minimum, replay, POS baseline | Jalankan preview terhadap database produksi; konfirmasi konflik dan isi kemasan nyata |
| Kategori Bar/Dapur | Inventory area→kategori→SKU; closing kategori lipat/progres; acuan mengikuti kategori sumber | UAT HP/desktop revisi ini dan pencocokan kategori aktual |
| Resep/HPP | Coverage resep existing, approval draft, konversi eksplisit dan cost sync diuji | Head Bar/Kitchen memvalidasi takaran; CSV bahan tidak menjadi resep otomatis |
| Closing/replenishment | Observasi fisik, draft/version, target/incoming, partial, no-request, WIB, RBAC | Staf produksi ditugaskan pada lokasi yang benar |
| Reservasi/transfer/FEFO | Ledger tunggal, batch/provenance, transit, partial/damage, replay/rollback; uji PostgreSQL nyata | Pastikan lokasi sumber/divisi/transit/karantina nyata dan uji satu siklus staf |
| Purchasing/receiving | Shortage disetujui→draftPO→approval→receipt parsial; draft lain ikut mengurangi sisa; posting stok/biaya hanya GoodsReceipt existing | Konfirmasi harga per satuan stok, supplier/nota, batch/expiry dan kebijakan pembayaran saat menerima |
| Pembatalan/koreksi | Draft receipt tertaut bisa dibatalkan dengan alasan; koreksi receiving existing tetap memakai kontrol stok/keuangan | Harga PO immutable dan belum ada alur cancel/amendPO; jangan membuat PO dengan harga/supplier belum pasti |
| Opname/waste/produksi/internal order | Suite existing wms-ops/inventory-extra/production/internal-order/pro/hardening/transfer turut lulus CI | UAT perangkat dan SOP aktual masing-masing divisi; kelulusan tes bukan bukti hitungan fisik benar |
| POS bridge/keuangan | Suite sale-stock/pos-area/bridge/receiving dan baseline POS turut lulus; sourceDoc biaya idempoten | Rekonsiliasi nota/pembelian aktual; supplier Finance belum disatukan dan tidak ada invoice/hutang otomatis baru |
| Laporan/ekspor/notifikasi | Regresi report/import-export/closing API lulus; laporan dari ledger/dokumen aktual | Bandingkan satu periode transaksi nyata dengan laporan dan bukti fisik |
| Lokasi & akses | Diagnostik read-only20tes lulus, termasuk helper/area/outlet/inactive roles | Hasil pemeriksaan produksi belum tersedia: halaman Warehouse meminta sesi masuk |
| Release/backup/rollback | Migrasi0148 additive; reset terblokir ketika histori closing ada | Backup, staging, build/UI gate dan persetujuan rilis revisi ini; jangan reset ledger |

## Temuan yang menghalangi klaim siap penuh

1. **P0 keamanan dependensi:** npm audit pada lockfile existing melaporkan38temuan (3critical/22high/13moderate). Ini hasil advisori paket, bukan bukti eksploitasi produksi. Next16.2.6 termasuk rentang advisori maintainer; ada pembaruan. Perlu PR pembaruan dependency terkontrol beserta seluruh regresi sebelum klaim aman produksi. Jangan menjalankan npm audit fix --force karena menyarankan downgrade/breaking change pada sebagian paket.
2. **P1 data operasional:** semua76kolomStok kosong; saldo awal tidak boleh direka. Isi kemasan/satuan beberapa bahan ambigu, dan ada konflik biaya trusted (misalnya coklat/freshmilk). Simpan acuan tidak sama dengan memvalidasi seluruh biaya/resep.
3. **P1 pengaturan produksi:** pemetaan lokasi dan penugasan akun aktual belum diperiksa. Diagnostik baru tidak otomatis memberi hak akses atau membuat lokasi berdasarkan tebakan.
4. **P1 UAT/release:** revisi ini belum dipasang. UAT browser PR64 tidak boleh dipakai sebagai bukti layar baru PR66. Build final sudah lulus; UAT HP/desktop revisi ini masih perlu dicatat terpisah.
5. **P2 pengecualian purchasing:** PO immutable, belum ada cancel/amendPO. Penerimaan draft dapat dibatalkan dan dibuat ulang; transaksi supplier/utang tetap mengikuti kebijakan existing.

Sumber keamanan maintainer: https://nextjs.org/blog/nextjs-security-update-october-14-2026 dan https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw . Tindak lanjut patch harus diverifikasi terhadap versi aktual saat dikerjakan.

## Keputusan operasional

Gunakan modul existing yang telah tervalidasi; jangan menganggap seluruh master/stock/resep sudah lengkap. Revisi66 merupakan kandidat release. Penutupan audit memerlukan bukti patch keamanan, build dan UAT revisi akhir, preview/apply data produksi yang valid, hitungan fisik, hasil readiness aktual, serta satu siklus Bar/Dapur/Gudang yang direkonsiliasi dengan laporan. Tidak ada perubahan stok, akses, resep atau impor produksi dilakukan oleh audit ini.
