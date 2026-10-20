# Audit WMS Garage OS — Oktober 2026

Audit ini dibuat untuk upgrade WMS F&B (MASTER+ PROMPT owner, 20 Okt 2026).
Sumber data: repository, skema `src/db/schema.ts`, API `src/app/api/**`, UI
`src/app/warehouse/**`, dan workbook `Garage_Coffee_Master_Pro_Final_v3.1_POS.xlsx`.

**Aturan yang dilindungi:**
- Identitas produk & varian POS, harga jual, dan kategori POS tidak diubah oleh pekerjaan gudang.
- Transaksi historis tidak dihapus.
- Bukti: `GET /api/admin/pos-baseline` (Owner) memberi snapshot + hash SHA-256. Unduh sebelum & sesudah deploy, lalu bandingkan hash-nya.

## Kondisi awal (sebelum upgrade)

- **Satu ledger stok:** `wms_stock_movement`. `inventory_items.onHand` = cermin total WMS.
- **Peran:** hanya Owner, Manajer, Kasir, Waiter. Bar/Dapur = workstation Kasir (`src/lib/role-access.ts`).
- **UI gudang yang hidup:** `/warehouse`. Modul "Warehouse" di app shell hanya redirect ke sana.
- **Penjualan POS memotong bahan** di dalam transaksi order (`consumeWmsStockForSale`).

## Inventaris keputusan

### KEEP

| Komponen | Keterangan |
|---|---|
| WMS `/warehouse/*` | Dashboard, inventory, receiving, transfer, internal order, kitchen/bar, recipe, production, opname, checklist, adjustment, activity log, reports, keuangan, reorder, cold chain, analytics, master, settings. |
| `recordStockMovement` | Satu-satunya jalur ubah stok: row lock, tolak minus, FEFO, ledger, cermin OS. |
| Batch & kedaluwarsa (FEFO) | Dipertahankan. |
| `recordCashPurchases` / `voidCashPurchases` | Belanja bahan idempoten per `sourceDoc`. |
| `syncRecipeBaseCosts` | HPP varian = Σ resep × biaya bahan. |
| Report Center | `/api/reports/export` (PDF/XLSX/CSV). |
| Endpoint baca gudang lama | GET daftar transfer/penerimaan/opname lama, PDF dokumen lama, audit harian. Data historis tetap bisa dibaca. |

### FIX (selesai di PR W1)

| Masalah | Perbaikan |
|---|---|
| Stok "OS-SYNC" disuntik ke ruang ber-qty ≤ 0 setiap server cold start (`ensureWmsSeeded`). | Bootstrap hanya bila ledger WMS kosong total. Produk WMS yang sudah ada tidak ditimpa dari data OS (`wms-bridge.ts`). |
| Transfer/stok lokasi lama menulis `onHand` cermin untuk SKU gudang. | Ditolak untuk SKU WMS (`garage-service.ts`), dan endpoint tulisnya ditutup (410). |
| Webhook `/api/wms/webhook/sale` bisa memotong order yang sudah dipotong POS; retry bersamaan lolos cek duplikat. | `ref` wajib. Ref = order Garage ditolak (409). Kunci advisory per ref. |
| Approval selisih penerimaan >10% tidak pernah tersimpan (ter-rollback oleh `throw`). | Server mengembalikan 409 `RECEIVING_DISCREPANCY`; Owner/Manajer mengonfirmasi di UI lalu dikirim ulang dengan `confirmDiscrepancy`. |
| Pembatalan penerimaan mengeluarkan stok dari ruang tebakan area. | Mengeluarkan dari ruang tempat barang dulu masuk (ledger). |
| Penerimaan mengabaikan ruang tujuan yang dipilih. | Ruang dipilih dipakai bila areanya sama dengan area bahan. |
| Bayar invoice supplier bisa dobel (tanpa kunci). | Klaim atomik `paidAmount`; gagal catat pengeluaran → klaim dikembalikan. |
| Invoice yang sudah dibayar bisa diubah nominalnya lewat input ulang nomor invoice. | Ditolak. |
| Resep WMS dihapus permanen (Kasir bisa). | "Hapus" = arsip, Owner/Manajer saja. Impor massal resep juga Owner/Manajer. |
| Bahan dengan histori ledger WMS bisa dihapus permanen. | Ditolak, harus diarsip. |
| Produk WMS terarsip tidak ikut terpotong saat jual. | Tetap terpotong. |
| Draft PO bisa dibuat Kasir via API. | Owner/Manajer saja. |
| Kasir bisa membuka opname gudang utama. | Ruang utama khusus Owner/Manajer. |
| Transfer, penyesuaian, finalisasi opname, internal order, dan produksi tanpa `audit_logs`. | Semua dicatat (`writeWmsAudit`). |
| `npm run db:seed:catalog` bisa menimpa harga/kategori POS setelah live. | Dibatalkan bila sudah ada order, kecuali `--confirm-overwrite-pos`. |

### MERGE

| Duplikasi | Arah |
|---|---|
| Hitung Cepat Stok di POS (menulis stok OS langsung) vs Stok Opname WMS. | Tombol POS → `/warehouse/opname`. Dialog lama dihapus. |
| Penerimaan supplier lama vs WMS Receiving. | Hanya WMS Receiving. |
| Transfer/permintaan outlet lama vs Internal Order WMS. | Hanya Internal Order. |
| Opname lama (approval) vs opname WMS. | Hanya opname WMS. Approval opname WMS menyusul di PR W3. |
| Smart Reorder lama vs `/warehouse/reorder`. | Hanya WMS. Daftar belanja Finance disatukan di PR W3. |
| Supplier `suppliers` (finance) vs `wms_supplier`. | Ditautkan di PR W3 (PO/hutang). |

### DEPRECATE (410 `LEGACY_INVENTORY_GONE`, data lama tetap ada)

Endpoint tulis berikut ditutup:
- `POST /api/inventory/supplier-receivings`
- `POST /api/inventory/transfers`, `/transfers/preview`, `PATCH /transfers/[id]/{approve,issue,reject}`
- `POST /api/inventory/opname`, `PATCH /opname/[id]/{approve,apply,reject}`
- `PATCH /api/inventory/location-stocks`
- `POST|DELETE /api/inventory/audit-daily/lock`
- `GET /api/inventory/smart-reorder`

Fungsi service lama (`createSupplierReceiving`, `createInventoryTransferRequest`, `createStockOpname`, dll.) tetap ada untuk tes & data historis. Fungsi ini tidak lagi punya jalur API tulis.

### REMOVE

| Komponen | Bukti tidak terpakai |
|---|---|
| UI gudang lama di `inventory-view.tsx` (±4.600 baris: tab stok gudang/outlet, request outlet, receiving supplier, kasir gudang, dashboard & laporan harian gudang, dialog opname/SKU gudang) | Komponen hanya dirender dengan `productsOnly`; semua blok itu tidak pernah tampil. |
| `warehouse-cashier-pos.tsx` | Satu-satunya pemanggil adalah blok mati di atas. |
| `inventory-smart-reorder-panel.tsx` | Satu-satunya pemanggil adalah blok mati di atas. |
| Placeholder "Fase berikutnya" di dashboard WMS | Diganti tautan aktif. |

## Keputusan terbuka (dikerjakan PR berikutnya)

- **W2:** impor master Excel (40 bahan Dapur, 10 resep makanan status DRAFT, crosswalk).
- **W3:** Permintaan Belanja Bar/Dapur → PO → penerimaan parsial → invoice/hutang → bayar; waste; approval opname; approval internal order.
- **W4:** dashboard & laporan gudang lengkap; panduan peran; laporan akhir.
- **Sengaja dipertahankan:** staf outlet tetap boleh MEMBACA stok gudang utama. Internal Order membutuhkannya untuk melihat ketersediaan; perubahan stok tetap dibatasi.
