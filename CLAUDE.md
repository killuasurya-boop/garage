# Garage Coffee & Motor OS

## Project Context

Garage Coffee & Motor OS is an internal operational app for a coffee and food business. It now has a backend foundation using Next.js API Route Handlers, Drizzle ORM, PostgreSQL/Neon, and Better Auth.

Primary modules:
- Dashboard
- POS
- Kitchen
- Inventory
- Finance
- CRM
- Approvals
- Audit
- **Payroll V2** (behind flag `PAYROLL_V2_ENABLED`) — Absensi PIN+Selfie+GPS,
  Wallet Gaji (upah harian + lembur), Wallet Fee (Rp 200/produk pool split
  proporsional jam), cron finalisasi 23:59. Lihat `docs/PAYROLL_DESIGN.md`.

Current backend scope is internal route handlers + PostgreSQL persistence only. Do not add payment gateways, email providers, external ERP sync, production messaging integrations, or unrelated infrastructure unless explicitly requested.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- lucide-react icons
- Better Auth email/password
- Drizzle ORM with PostgreSQL/Neon
- Seed data derived from the existing Garage mock/menu/inventory sources

Important files:
- `src/components/garage/garage-app.tsx` - main app shell and module screens
- `src/lib/garage-data.ts` - seed/source data for menu, inventory, orders, finance, CRM, approvals, audit
- `src/db/schema.ts` - Drizzle schema for auth and Garage domains
- `src/lib/auth.ts` - Better Auth server setup
- `src/lib/garage-service.ts` - server-side data/query/mutation layer
- `src/app/globals.css` - Garage theme tokens and global UI styling
- `src/app/layout.tsx` - app metadata and font setup
- `design-system/MASTER.md` - design tokens, anti-patterns, per-module UI/UX checklist (source of truth for UI work; check before editing components)

## Design Direction

The UI must feel like Garage Coffee & Motor operations:
- black asphalt / dark industrial base
- chrome and silver text
- red primary accent
- amber operational highlights
- dense but readable dashboard layout
- tablet-friendly POS workflow

Use the existing Garage visual system. Avoid generic SaaS green/blue styling, marketing hero layouts, decorative blobs, and oversized landing-page composition.

Logo usage:
- Brand is **Garage Coffee** (no longer "& Motor", owner Okt 2026).
- Primary logo: `public/garage-brand/garage-coffee-logo.png` (transparent, silver/red — for dark surfaces, no light backing).
- On white paper/PDF/light cards use `public/garage-brand/garage-coffee-logo-dark.png` (logo on its dark plate).
- App icon: `public/garage-brand/garage-coffee-icon.png` (red triangle emblem).
- Render logos with `object-contain` only; do not crop the wordmark.
- Partner/sponsor logo BLACK (`public/grand-opening/sponsor-black.webp`) only on `/grand-opening` (behind the 21+ age gate), never on the homepage.

## Readability, Motion, And Scroll Policy

Every frontend revision must make the operating UI easier to read before adding decoration:
- Slightly brighter cards, tables, forms, popovers, and nested operational surfaces are preferred over pure black-on-black layers.
- Muted text must remain readable on dark asphalt backgrounds. Avoid low-opacity copy for prices, statuses, table cells, and button labels.
- Money, totals, item names, stock status, queue status, customer names, timestamps, and approval actions must never be clipped or hidden.
- Keep typography compact but legible: avoid ultra-small text in cards, long buttons, table cells, and mobile controls.
- Preserve the Garage palette: black asphalt, chrome/silver, red accents, amber highlights. Do not introduce generic green/blue SaaS styling.

Motion direction:
- Use cinematic garage motion only when it supports clarity: fast fade/slide entry, active navigation glow, hover lift, button press feedback, selected states, and drawer/dialog transitions.
- Keep animations lightweight for tablets and cashier use. Avoid parallax, heavy blur, infinite decorative motion, or layout-shifting effects.
- Always respect `prefers-reduced-motion`.

Scroll direction:
- Data-dense modules need explicit scroll containers: POS menu/cart, Kitchen queues, Inventory tables, CRM tables, Approvals lists, and Audit logs.
- Desktop can use fixed-height internal scroll areas when it improves productivity.
- Mobile must remain one-column friendly with safe horizontal table scroll only where dense tabular data requires it.
- Sticky headers/actions are allowed only when they do not cover content.

## Full-Stack Rules

- Preserve the existing Garage UI and responsive behavior.
- Use API Route Handlers for backend endpoints; do not use Server Actions for this backend v1 unless explicitly requested.
- Keep Drizzle database initialization build-safe and lazy; `next build` must not require a live DB connection.
- Validate request bodies with Zod and return `{ data }` or `{ error: { code, message } }`.
- Keep Better Auth for identity/session only; Garage roles live in `staff_profiles`.
- Do not add payment gateway, email provider, external ERP, or real-time provider until requested.
- Do not modify PRD files, PDFs, ZIPs, or source design assets unless specifically asked.
- Prefer existing component patterns before adding abstractions.
- Use shadcn/ui and lucide-react consistently.
- Keep text from overflowing buttons, cards, tables, and mobile layouts.
- Preserve responsive behavior at desktop `1366x900` and mobile `390x844`.

## POS Rules

- POS must stay fast for cashier/tablet use.
- Product/menu area stays primary; cart/payment remains reachable.
- Active menu (owner, Sep 2026) lives in `src/lib/garage-data.ts`: 10 single-price
  Makanan & Cemilan items (no recipes yet → HPP 0) plus 19 Coffee drinks from
  `HPP BAR.xlsx` and 10 Non-Coffee drinks from `NON COFFEE.xlsx` (`bar-*` ids,
  recipes on `BAR-###` bar ingredients). Coffee Latte /
  Cappuccino / Americano have `Cold` / `Hot` variants with per-variant recipes.
- HPP is never a percentage or typed guess: a variant with recipe lines always gets
  `baseCost` = Σ(recipe qty × current ingredient unit cost) via
  `syncRecipeBaseCosts` (`src/lib/menu-recipe-cost.ts`), re-run on product save,
  ingredient cost edit, supplier receiving and WMS receiving/production.
- Cart lines must include item + variant + quantity.
- Totals must calculate from selected variant price.
- Categories `Minuman Botol` (Mineral) and `Rokok` (owner, Okt 2026; menu group "Lainnya") are
  handed over by the cashier: `isDirectHandoverMenu` (`garage-production-rules.ts`) skips them
  in production tickets/chits. Rokok has `showInDigitalMenu: false`; staff open bills pass
  `allowHiddenItems`.
- "Bayar nanti" = `POST /api/orders/open-bill` (staff customer order + accept with
  `{ openBill: true }`, skipping take-away pay-first); settled later via Final Bayar.
- Order/invoice admin (owner, Okt 2026) is Owner/Manajer only, checked in the backend
  (`requireOwnerOrManager`, `assertOwnerOrManager`):
  - `updateOrderInfo`: name/phone/note only; amounts and items are never edited.
  - `revertOrderPayment`: Lunas→Pending, only while the payment's shift is open.
    The payment goes back to `pending`, nothing is deleted and it is NOT a refund.
  - `confirmOrderPayment`: Pending→Lunas via the Final Bayar flow.
  - `correctPaymentMethod`: the method changes and the total stays.
  - `voidOrder`: cancel.
  - `setOrderArchived`: archive/restore hides the order from lists only, reports unchanged
    (`orders.archived_at`, migration 0141).
  - `getOrderChangeHistory`: change history read from the audit log.
  - Audit metadata carries `orderNo`, `actionType`, `before`/`after` and `reason`.
- Kasir never cancels/deletes a processed sale: `reject` only before acceptance, void always
  goes through an approval (`APP-VOID`). Report "jenis pesanan" = `channelGroupOf`.
- Invoice delete (owner, Okt 2026) = `deleteUnpaidInvoice` / `POST /api/orders/[id]/delete`: Owner/Manajer
  only, unpaid only, reason + typed order no; soft delete through `voidOrder` (status `voided`, audit
  "Hapus invoice"). Paid invoices are never deleted — Batal/Refund. Payment status ≠ method:
  `paymentStatusOf` (`src/lib/payment-status.ts`) → Pending/Lunas/Gagal, printed on every receipt with
  method, Dibayar and Sisa tagihan.
- Cashier speed-ups (owner, Okt 2026): Favorit strip (per-device tap counts in localStorage
  `garage:pos-fav-counts`, bestseller fallback), menu shortcodes (`src/lib/menu-shortcode.ts`,
  exact code first, Enter = order top result), Bayar 1 tap (take away · uang pas / QRIS via
  `submitOrder` overrides), and a chime + notice when a kitchen ticket turns ready.
- Receipt QR: `buildThermalContent` emits a `[[QR:<invoice url>]]` marker line (`receiptQrMarker`,
  `src/lib/receipt-layout.ts`); Chrome dialog renders it as SVG, direct ESC/POS as a `GS v 0` raster,
  text-only paths (agent, `/api/print/thermal`) drop it via `stripReceiptQr` (URL text stays).
  Kitchen chits print addon no., target time, item/order notes (wrapped), item count and who printed.
- Cashier accountability (owner, Okt 2026, migration 0142): opening denomination count
  (`cash_sessions.opening_denominations`, total must equal opening cash; coin Rp1.000 key `1000k`),
  petty cash = separate fund in `petty_cash_entries` (Kasir submits expense, Owner/Manajer approve/topup;
  never touches drawer `expectedCash`), `shift_incidents`, manager review (`review_status`). Full A4 PDF
  `GET /api/reports/cashier-accountability` (`shift-accountability-report.ts` data, `-pdf.ts` render),
  file names by operational date. Logic in `src/lib/cashier-accountability.ts`.
- Kas Keluar / Masuk Laci (owner, Okt 2026, migration 0144): category catalog = `src/lib/cash-drawer.ts`
  only (direction, report group, Finance expense category, required fields). Only operational categories
  create an `expenses` row; Kasbon → `staff_cash_advances` (non-P&L, deducted at payroll); refund/setoran/
  brankas are never costs; cash-in is never sales. Logic in `recordCashMovement` / `decideCashMovement` /
  `voidCashMovement` / `correctCashMovement` (`garage-service.ts`): ref `KAS-YYMMDD-0001`, balance before/after
  from session `expectedCash`; only status `recorded` moves money (`pending_approval` = Kasir request, money not
  moved yet; rejected/voided kept, never deleted). Kasir ≥ `cashMovementPinThreshold` or refund/setoran needs a
  Manager PIN or a request; void/correct = Owner/Manajer, session still open, reason + audit before/after.
  Drawer expenses can't be cancelled from Finance/Payroll (`cancelExpenseInTx` guard). Kasir never sees drawer
  balance while the shift is open (`redactOpenShiftSummary`). Receipt photos live in non-public
  `storage/cash-receipts`, served only via `/api/finance/cash-movements/[id]/receipt`.
- Browser-dialog printing uses `browserColumns` (huruf Besar → 24 col on 58 mm) with tall
  TOTAL/Kembali lines; cashier can print Bar/Dapur chits manually (`printKitchenChits`).

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
  - Issues that used to be skipped silently are recorded in `wms_stock_issue`: not_in_wms, unit_mismatch, oversold.
  - FEFO picking: usable batches go first and expired batches last for sales. Transfer, internal order and production use `pick: "usable"`, which rejects expired batches. `moveStockBetweenWarehouses` carries batch no, expiry and HPP to the destination.
  - Waste = `src/lib/wms-waste.ts` (`wms_waste`, movement type `waste`, picks expired batches first). Staff waste ≥ Rp 50.000 is `pending_approval` until Owner/Manajer decides. Waste never creates an expense (cogs is on a purchase basis); its value shows in the owner report.
  - Opname: draft → submitted → completed, or rejected back to draft with a reason. Counters get a blind view. Variance = physical − stock at count time (`systemQty` is captured on save). Posting happens only via Owner/Manajer finalize.
  - Purchasing = `src/lib/wms-purchase.ts`:
    - stored PO (`wms_purchase_order`), partially or fully received through a receiving with `purchase_order_id`; a cancelled receiving reverses the PO qty
    - `wms_receiving.supplier_id` FK, resolved by supplier name
    - supplier price history
    - min–max per room (`wms_reorder_rule`): an outlet is filled from the main room of its area first, the rest becomes a draft PO per supplier
    - delivery note per batch (`/api/wms/documents/[doc]`)
- Preserve fields: `sku`, `name`, `alternativeName`, `category`, `unit`, `packageSize`, `onHand`, `min`, `status`, `movement`.
- Daily inventory excludes equipment/minimal tools; those belong in a future asset/equipment module.
- Keep low/watch/safe status readable and searchable.

## Finance Rules

- Profit bersih = omzet bersih − belanja bahan (penerimaan gudang, cash lunas) − biaya tetap harian − biaya lain
  (`cogsBasis: "purchase"`, lihat `docs/KONSEP-KEUANGAN.md`). Penerimaan gudang mencatat `expenses` lunas per area
  via `recordCashPurchases` (`src/lib/finance-purchases.ts`, `sourceDoc` idempoten) — tidak membuat hutang supplier.
  Hanya expense ber-`sourceDoc` yang jadi biaya bahan; expense/pelunasan kategori belanja lain = cash-out saja.
- Target profit bersih/bulan (`netProfitTargetMonthly`) = patokan balik modal (`computeCapitalTarget`).

## Table (Meja) Rules

- Table numbers/labels go through `src/lib/garage-tables.ts` only: `parseTableNumber`
  (strict, never truncates "123" → "23"), `tableLabelFor` → canonical "Meja 06".
  Max 50 (`MAX_TABLE_NUMBER`, matches table-call voice assets & QR cards).
- Tables in use per outlet live in `dining_tables` (Pengaturan → Meja & QR,
  `/api/tables/config`). No rows for an outlet → all 01–50 active. Inactive tables
  are hidden from waiter/POS maps and rejected for dine-in orders.
- Live table state = `getTableLiveData({ outletId })` / `getTableLiveRow` (always pass
  the staff outlet). Bill window = orders since `table_sessions.cleanedAt`; only
  "empty" resets `cleanedAt`. Previous-day unpaid bills surface as
  `staleFromPreviousDay` ("Cek kasir"), never auto-cancelled.
- `moveTable` moves every open bill + kitchen tickets + open service requests in one
  transaction (join code moves too).
- Table UI colours (owner PDF "Flow Pemesanan Menu Digital", Okt 2026) — same on
  customer menu, waiter, POS, smart floor, landing: Kosong green, Sedang dipilih
  yellow, Terisi red (sub-label Belum bayar / Di kasir / Lunas), Reserved blue,
  Perlu dibersihkan grey, Meja kamu = thick white outline + check. Always with a
  text label. Palette lives in `src/lib/garage-table-status.ts`.
- Customer dine-in (`/order`): pick table first (QR meja = confirm "Kamu di Meja 07,
  benar?"), server hold `table_sessions.held_until` (`tableHoldMinutes`, FOR UPDATE
  in tx). Occupied tables only via 4-digit `join_code` (cleared when emptied).
  `/api/customer/orders` sets `enforceTableClaim`; staff orders don't.

## Event Menu Rules

- Event prices and bundles reference existing products/variants; never overwrite regular prices or create parallel event transactions.
- Unlimited physical stock is the owner policy. Event quota is optional and separate; never add a second inventory decrement.
- Checkout reserves optional quota atomically and stores price/component/cost snapshots on normal orders. Durable request keys must reject payload mismatch.
- Reject/void before acceptance restores event quota once. Accept event orders before split bill; accepted orders/refunds follow the existing stock pipeline.
- Public responses must not expose HPP snapshots. Missing verified historical costs must be reported as unavailable.
- Rokok (owner, Okt 2026) is allowed ONLY as a bundle component (`bundleOnlyProduct`, `event-menu-service.ts`), never as a standalone
  event item; vape/nicotine always blocked. POS sells bundles via `Paket Event` (`pos/pos-event-bundles.tsx`, `GET /api/pos/event-menu`)
  → `POST /api/orders/open-bill` with `eventId`/`eventItems` (idempotency key = checkout key) → Final Bayar.
- Bundle price is FINAL (owner, Okt 2026): `calculateOrderBilling` puts service/PB1/rounding, QR promo, voucher and points on
  regular lines only; refund/split of a bundle must be the whole package (`packageRefundContext`) and returns its own value.
  Order item DTOs carry `package` (`orderItemPackage`, never HPP); receipts/invoice/POS group by it (`groupOrderLines`).
  Bundle photo = `event_menu_entries.image_url` (migration 0149), fallback collage of component photos.
- Release and rollback checklist: `docs/event-menu-release.md`. Production deployment requires separate owner approval and verified backup.

## Verification

After app code changes, run:

```bash
npm run db:generate
npm run lint
npm run build
```

Then verify in browser:
- `http://127.0.0.1:3000/`
- desktop around `1366x900`
- mobile around `390x844`
- no console errors
- no obvious text overlap or clipped controls
- seeded login works after `npm run db:migrate` and `npm run db:seed`

For documentation-only changes such as Claude command files, app lint/build is optional.
