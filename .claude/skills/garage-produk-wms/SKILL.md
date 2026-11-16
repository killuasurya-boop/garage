---
name: garage-produk-wms
description: Aturan WAJIB Product Management (kategori, tipe produk, HPP) dan Inventory/WMS (ledger stok, batch, valuasi, purchasing, opname, Minta Bahan, UOM, resep usulan, master data, pengadaan). Muat sebelum mengubah produk, resep, stok, gudang, atau pembelian.
---

# garage-produk-wms

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

## Product Management Rules

- Product categories are dynamic (owner, Okt 2026): table `product_categories` (`src/lib/product-management.ts`),
  never a hardcoded list. `menu_items.category_id` is the relation; `menu_items.category` keeps the display name
  (rename updates it, `order_items` snapshots untouched). Category carries kind (fnb/retail/operational), default
  product type, station (`bar`/`dapur`/`none` = handed over by cashier), POS group (Dapur/Bar/Lainnya, POS sub-tabs
  are built from it) and SKU prefix. Categories are never deleted: archive, and an archive with active products
  requires moving them (`archiveProductCategory`). Seeded categories = the 6 that already existed (migration 0143).
- `menu_items.product_type`: `menu` (recipe HPP), `retail` (rokok, mineral — cost = harga modal per variant, no
  recipe needed), `bundle`. Variants carry `sku`, `barcode`, `sell_unit`, `unit_contents`; SKU & barcode are unique
  across products AND variants (`assertUniqueProductCodes`).
- HPP status (`hppStatusFor`): complete only when every variant cost is valid (recipe for menu/bundle, harga modal
  for retail); manual menu HPP = "unverified". Margin is shown only for complete HPP — never as final otherwise.
- Catalog/KPI (`GET /api/products/catalog`), bulk actions (`POST /api/products/bulk`, audited per product) and
  exports (`GET /api/products/export?type=&format=xlsx|pdf&<filters>`, file `GarageOS_<Jenis>_YYYY-MM-DD.<ext>`)
  are Owner/Manajer only and always use every row matching the filter (`loadCatalogRows` = single source).
- Physical stock quantity/stock card/opname/purchasing stay in the warehouse module (being replaced); the product
  module only uses the ready/limited/sold_out status.

## Inventory Rules

- Inventory is raw-material and consumable stock. The old PDF-derived mock catalog
  (INV-###) was deleted Sep 2026; the seeded catalog is the 36 bar ingredients from
  `HPP BAR.xlsx` + `NON COFFEE.xlsx` (`BAR-###`, units ml/gr/pcs, `unit_cost` =
  real purchase price (Harga Beli) ÷ package contents, NOT the sheet's buffered
  "Harga HPP"; freight goes in as receiving additional cost, spoilage as recipe
  waste %). Unit cost is Rp per ml/gr/pcs as
  numeric(14,4) — keep 4-decimal precision, do not round unit costs to integers).
- WMS is the single physical stock ledger. Order recipe deductions (POS, QR,
  void, refund, split bill) are forwarded to WMS via `consumeWmsStockForSale` /
  `returnWmsStockForSale` (outlet room first, then main room of the same area;
  sales may go negative instead of silently skipping). `inventory_items.onHand`
  is a mirror of the WMS total (set in `recordStockMovement`) — never write it
  directly for WMS-managed SKUs.
- `npm run db:seed` is insert-only (safe after go-live); `npm run db:seed:catalog`
  (`--sync-catalog`) overwrites catalog/prices/recipes/unit costs from
  `garage-data.ts` and archives menu items not in the seed.
- WMS hardening (owner, Okt 2026, `docs/WMS-AUDIT-2026-10.md`): OS→WMS stock bootstrap only when the WMS
  ledger is empty; legacy `/api/inventory` write endpoints (supplier-receivings, transfers, opname, location-stocks,
  smart-reorder, audit-daily lock) return 410 → use `/warehouse`. POS data (products, variants, prices, categories)
  is protected: `GET /api/admin/pos-baseline` (Owner) = snapshot + SHA-256 before/after changes;
  `db:seed:catalog` refuses once orders exist unless `--confirm-overwrite-pos`. Recipes are archived, never deleted.
- Master Excel import (Owner, Gudang → Kelola Master; `master-import*.ts`, `master_imports`/`master_crosswalk`,
  migration 0146): insert-only materials (Excel `BAR-9NN` = Garage `BAR-0NN`), kitchen recipes land as
  `menu_recipes.status = 'draft'` (no stock deduction, no baseCost) until Owner/Manajer approves; `V-*`
  allowances are not stock. Never touches POS products/prices/categories. See `docs/WMS-DATA-RECONCILIATION.md`.
- W2 integration (migration 0146, after event 0145): apply/import decisions share a transaction advisory lock and replan inside the transaction. Archived/rejected recipes remain skipped on reimport. Normalize only explicit same-dimension units; reject nonpositive quantities and invalid unit lines. Approval revalidates material/BOM readiness and syncs only this menu to WMS in the same transaction, so a sync failure rolls back activation/HPP. See `docs/wms-w2-release.md`.
- WMS ERPNext-style overhaul (owner, Okt 2026, migrations 0151–0154):
  - Ledger: every `wms_stock_movement` row stores `balance_after`, `valuation_rate` and `batch_id`.
  - Negative stock: an inbound movement first nets off negative stock; batch qty is only the part above 0, so Σ batch = room balance.
  - Batch integrity: `getWmsBatchIntegrity` / `fixWmsBatchIntegrity`, endpoint `/api/wms/integrity` (fix is Owner only, no ledger change).
  - Units: sale qty is converted from the recipe unit to the WMS unit via `saleQtyInWmsUnit` (`src/lib/stock-units.ts`). A unit from a different dimension is logged as `unit_mismatch`.
  - Issues that used to be skipped silently are recorded in `wms_stock_issue`: not_in_wms, unit_mismatch, oversold, expired_sold.
  - Valuation (owner): **moving average only**. Every outflow is valued at qty × `wms_product.hpp`; only receiving/production change the average. Batches are for FEFO, expiry and traceability, and a batch's `hpp` is informational. Moving stock between rooms keeps the value.
  - Sale returns: each sale records `wms_sale_allocation` (ref `SALE <orderNo>`, batch per room, a null batch for the unbatched/negative part, `seq` for LIFO). Void, refund and reject pass `saleOrderNo` and return stock to the original room and batch (`restoreToBatchId`). Old sales without allocations fall back to a `RETUR-` batch.
  - Opname approver ≠ submitter, except the Owner.
  - FEFO picking: usable batches go first and expired batches last for sales. Transfer, internal order and production use `pick: "usable"`, which rejects expired batches. `moveStockBetweenWarehouses` carries batch no, expiry and HPP to the destination.
  - Waste = `src/lib/wms-waste.ts` (`wms_waste`, movement type `waste`, picks expired batches first). Staff waste ≥ Rp 50.000 is `pending_approval` until Owner/Manajer decides. Waste never creates an expense (cogs is on a purchase basis); its value shows in the owner report.
  - Opname: draft → submitted → completed, or rejected back to draft with a reason. Counters get a blind view. Variance = physical − stock at count time (`systemQty` is captured on save). Posting happens only via Owner/Manajer finalize.
  - Purchasing = `src/lib/wms-purchase.ts`:
    - stored PO (`wms_purchase_order`), partially or fully received through a receiving with `purchase_order_id`; a cancelled receiving reverses the PO qty
    - `wms_receiving.supplier_id` FK, resolved by supplier name
    - supplier price history
    - min–max per room (`wms_reorder_rule`): an outlet is filled from the main room of its area first, the rest becomes a draft PO per supplier
    - delivery note per batch (`/api/wms/documents/[doc]`)
- Minta Bahan (owner, Okt 2026, migration 0156) = `src/lib/wms-material-request.ts` (`wms_material_request`/`_item`, doc `MRQ-`):
  - Bar/Dapur staff build a shopping list from the production screen (`production-material-request-dialog.tsx`, permission `kitchen:write`). There is no approval step; management gets a notification.
  - The warehouse sends from `/warehouse/material-requests` (`inventory:write`). Stock moves from the area's main room to the Bar/Dapur room via `moveStockBetweenWarehouses`, with FEFO, expired batches rejected and the batch carried over. Anything not sent becomes `shortQty`.
  - The division confirms receipt. Shortages turn into a draft PO per last supplier (`createPurchaseOrdersFromShortages`). The delivery note comes from `/api/wms/documents/MRQ-…`.
- Kemasan bertingkat (owner, Okt 2026, migration 0157, ERPNext UOM Conversion): base unit (ml/gr/pcs) stays
  the truth for stock, HPP, POS/recipe deductions. `wms_product_uom` (kotak/botol/dus, `factor` = base units, one
  `is_purchase` + one `is_count` default) is only for input/display; no rows → default from `inventory_items.packageQty`
  > 1 (`loadProductUoms`, `src/lib/wms-uom.ts`). Helpers `src/lib/stock-uom.ts` (`formatPacks` "3 kotak + 250 ml"),
  UI `PackQtyInput`/`PackQtyText` (`src/components/wms/pack-qty.tsx`) for opname, Minta Bahan, waste, PO, lists.
  PO per kotak stores base qty + per-base price plus `uom`/`uom_factor` snapshot for printing. Portions per pack =
  factor ÷ (recipe qty × (1 + waste%)) (`getPortionYield`). Biang Teh BAR-035 = kotak 1000 ml; Fresh Milk = dus beli,
  botol 946 ml hitung.
- Resep usulan (owner, Okt 2026, migration 0158, `docs/RESEP-USULAN-2026-10.md`): every product without a recipe
  got a DRAFT recipe (barista/koki proposal) + insert-only Dapur materials `KIT-001…052` and finished-goods stock
  `RTL-001…005` (Mineral btl/dus, Rokok bks/slop; 1 per sale). Drafts never deduct stock/HPP until approved
  (`approveDraftRecipe`, error names each bad line) or activated from the product form ("Pakai resep usulan").
  `listDraftRecipes` is per variant (HPP = 'all' lines + variant lines). Product save never deletes draft/archived
  recipe rows unless it saves new recipe lines (which supersede drafts). Retail with one recipe line and stock cost 0:
  harga modal seeds the stock cost (`seedRetailStockCosts`). Product form shows ingredient stock in packs, portions
  left, "+ Stok awal" (`recordOpeningStock`, STOK-AWAL at current HPP, Owner/Manajer) and "Bahan Baru". The test
  harness strips 0158 data; `recipe-proposals.integration.test.ts` re-runs it.
- Master Data (owner, Okt 2026, migration 0171) = `/warehouse/master` (tabs Bahan/Kategori/Supplier/Satuan/Impor,
  `src/components/wms/master/`, server-guarded Owner/Manajer). Guards live in `src/lib/wms-master-data.ts`:
  - Master edits never touch stock. Product/category/supplier writes run in one tx + `audit_logs` (`metadata.module =
    'wms-master'`, before/after). API errors = `WmsMasterError` via `withMasterErrors` (`src/lib/wms-master-route.ts`).
  - SKU empty = server-generated `PREFIX-NNN` under an advisory lock (archived + OS catalog counted); SKU/barcode unique.
  - Base unit is locked once the product has ledger/stock/active recipe (`assertUnitChangeAllowed`, also in import preview).
  - Archive refuses products in active menu/published WMS recipes or with stock ≠ 0. Categories are archived, never
    deleted; renaming cascades `wms_product.category` + `inventory_items.category`. API calls pass `strict` (category must
    exist); internal callers may still use unknown categories (area "umum").
  - Supplier phone = WhatsApp, normalized to `08…`; supplied products + price history from completed receivings.
- Pengadaan Phase 2 (owner, Okt 2026, migration 0172) = `src/lib/wms-procurement.ts` (+ `-meta.ts` client-safe),
  UI `/warehouse/purchase-orders` (Procurement Command Center, `src/components/wms/procurement/`):
  - PO status: draft → pending_approval → approved ("Siap Dikirim") → wa_opened → sent → confirmed → processing →
    partial/received; cancelled. Approver ≠ creator unless Owner. Receiving from a PO / "send" need an approved PO.
  - "Terkirim" only via `confirmPoSent` (manual staff confirmation of the CURRENT revision, status must be wa_opened) or
    future official API evidence. Editing after WhatsApp was opened/sent = `revision+1` + re-approval; PDF/message say REVISI n.
  - Every PDF/WA/send/supplier-response event is appended to `wms_po_dispatch` (user, time, recipient, revision, pdf sha256).
  - PDF `/api/wms/purchase-orders/[id]/pdf` (Owner/Manajer only, no public link) = `wms-po-pdf.ts` (pdfkit, logo
    `public/garage-brand/garage-coffee-logo.png`, deterministic: CreationDate = PO time). Message text = `buildPoWhatsappText`.
  - WhatsApp Mode 1 = wa.me link, staff attaches the PDF. Mode 2 (Business API) is capability-detection only
    (`getPoWhatsappCapabilities`, env `WMS_PO_WHATSAPP_TEMPLATE`); never claim delivery without provider proof.
  - Shortage POs prefer the product's master supplier (`preferredSupplierFor`), PO lines keep `source_refs` (MRQ + division).
  - Money: purchase cost stays ONE `expenses` row per receiving area (sourceDoc). Receiving `paymentMethod: "Tempo"` records
    it as `recorded` + a `wms_supplier_bill`; `wms_supplier_payment` (payment/DP) never creates expenses, never touches the
    drawer/cash ledger (fund: bank_jago | bank_bni | petty | external). Verified payments fully paying a bill flip that same
    expense row to `paid`. Payments: Owner = auto-verified, others need Owner/another Manajer; void = Owner + reason.
    Cancelling a receiving with active payments is refused.
  - Invoices/proofs live in `storage/supplier-docs` (Docker volume `garage-supplier-docs`), served via
    `/api/wms/supplier-docs/...` to Owner/Manajer only.
- Smart Stock Opname Phase 3 (owner, Okt 2026, migration 0174) — UI `/warehouse/opname` (`src/components/wms/opname/`, 8 tabs;
  Kasir/Waiter see only Hitung + Hitung Ulang):
  - Every opname endpoint checks location (`opnameAccessError`): staff only Bar/Dapur rooms. Blind = no system qty/variance/
    value/class AND no other counter's numbers (`viewerId`). PATCH response never returns system data.
  - Save = row lock on line + `wms_warehouse_stock` snapshot, idempotent `clientRequestId`, append-only `wms_opname_count`;
    first count kept (`first_*`). Tolerance = `wms-opname-rules.ts` (`classifyVariance`, settings key `wms.opname.tolerance`):
    beyond tolerance → auto `needsRecount`; still off after recount → manager; ≥ ownerValue or repeated → Owner-only approval.
  - Scope: partial (old behaviour), full/cycle (all lines must be counted). Finalize stores `posted_value/rate` from the ledger.
  - Loss metrics (`wms-loss.ts`) and reports (`wms-opname-report.ts` via report-engine) are managerial only: NO expense/journal.
    Unexplained = gross shortage (surplus never nets it). Risk score `riskScores`, recommendations `wms-opname-insights.ts`
    (deterministic rules with evidence + limitation, `wms_opname_action` tracker). Wording never blames staff.
  - Aya: read-only tools `ringkasan_loss_opname`, `prioritas_cycle_count`, `rekomendasi_opname` (Owner/Manajer). No opname write tool.
- Preserve fields: `sku`, `name`, `alternativeName`, `category`, `unit`, `packageSize`, `onHand`, `min`, `status`, `movement`.
- Daily inventory excludes equipment/minimal tools; those belong in a future asset/equipment module.
- Keep low/watch/safe status readable and searchable.
