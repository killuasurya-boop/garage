# APEX WMS Data Quality Gate — MVP Slice 01

## Tujuan

Owner meminta APEX WMS AI berbasis Garage OS aktual. Perubahan ini bukan agent pengganti. Ini fondasi R0 read-only quality gate untuk menghindari auto-pembelian atau koreksi stok dari data yang belum valid.

## Sumber data asli

Route baru: GET /api/wms/apex-health (hanya Owner). Menggunakan fungsi resmi:

- getWmsProducts({warehouseId:"all"}): posisi agregat seluruh lokasi.
- getReorderSuggestions(): kebutuhan per ruang dan transfer/pembelian.
- listPurchaseOrders(50): draft/PO terbaru.
- getMenuMarginReport(): biaya resep aktif per varian.
- listExpiringWmsBatches(7): batch dan expiry (verifikasi fisik).
- getWmsBatchIntegrity(): gap batch vs saldo stok.
- getWmsLossReport() untuk minggu berjalan WIB: paparan selisih bruto.

Semua dibaca dari database resmi. Tidak ada tabel stok baru, mutasi, PO, pembayaran, jurnal, agent background, atau API universal bypass approval.

## Output

- state: PASS / WARN / BLOCKED.
- dataGatePass: false jika syarat keselamatan procurement gagal.
- executionAuthorized: selalu false. PASS bukan izin auto-approve R2/R3.
- metrics: statistik produk, PO, rekomendasi, resep/HPP, batch, blockers, findings.
- findings: bukti per kejadian, severity, maksimal 100 dalam respons dengan total findings dan indikator truncated.
- period, dataAsOf: cutoff audit.

## Quality rules

| Rule | Dampak |
| --- | --- |
| SUPPLIER_MISSING | Blokir auto-procurement |
| PRICE_UNVERIFIED | Blokir auto-procurement |
| INVALID_REORDER_QTY | Blokir auto-procurement |
| CROSS_WAREHOUSE_REVIEW | Blokir sampai stok lintas ruang diverifikasi |
| PO_VALUE_UNVERIFIED | Blokir auto-procurement |
| RECIPE_COST_UNVERIFIED | Warning; harga jual ≠ margin akurat |
| BATCH_EXPIRY_UNKNOWN / BATCH_EXPIRY_REVIEW | Warning, cek fisik, tidak auto-waste |
| BATCH_LEDGER_GAP | Blokir auto-procurement |
| OPNAME_GROSS_VARIANCE | Warning, nilai bruto bukan confirmed loss |

## Evidence live MCP 2026-11-01

- Cup total 50.020 pcs namun Gudang Utama Bar 0 pcs pada reorder; supplier dan harga belum ada.
- Fresh Milk total 43.920 ml, gudang utama Bar 0 ml, saran beli 45.408 ml.
- PO Ice Crystal PO-20261031-ZL4R masih draft dengan harga item 0.
- Laporan margin: 83 varian, 82 memiliki 0 komponen bahan aktif/recipe cost 0.
- Opname mingguan 26 Okt–1 Nov: shortage bruto Rp58.326.900, surplus bruto Rp147.599.553, akurasi 6,8%, cakupan 34,7%. Tidak membuktikan kerugian ekonomi final.

## Security and tests

- Auth Owner diverifikasi server-side.
- Semua fungsi R0; tidak ada POST/PATCH/PUT/DELETE.
- Tes murni di src/lib/apex-wms-quality-gate.test.ts mencakup PASS, missing supplier/harga, perbedaan lokasi, PO nol, resep, gross variance, expiry, integrity, deduplikasi.
- Tes BELUM dijalankan di lingkungan build. PR tetap draft hingga typecheck/lint/test/build/E2E terverifikasi.
- Sebelum deploy, ukur beban query; 7 operasi baca dipanggil paralel.
- Tambah pengujian permission non-owner ditolak, timestamp WIB, stale data, query failures, dan hasil >100 issues.

## Tidak boleh dilewati

Tidak ada auto-approval, auto-dispatch, auto-waste, auto-adjustment, auto-closing atau perubahan hak staf. Tindakan R2/R3 tetap mengikuti backend preview dan konfirmasi Owner.

## Deployment

1. Jalankan npx tsc --noEmit.
2. Lint, Vitest pada src/lib/apex-wms-quality-gate.test.ts.
3. Full test, build, E2E, security check.
4. Review beban DB, rate limit, dan Auth.
5. Review PR, staging, backup, health/smoke, manual rollout sesuai docs/DEPLOY_MANUAL.md.
6. Jangan auto-merge, tidak restart VPS lain.

## Prioritas tahap berikut

Owner action queue, perbaikan false positive low stock per ruang, verifikasi konversi bahan dan PO, lengkapi resep/BOM terverifikasi, baru delegasi otomatis deterministik.
