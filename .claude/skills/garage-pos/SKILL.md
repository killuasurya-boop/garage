---
name: garage-pos
description: Aturan WAJIB modul POS Garage OS: kasir, keranjang, order/invoice admin, Bayar nanti, Belum Bayar, POS V6, struk/QR, cetak, Event Menu & bundle. Muat sebelum mengubah apa pun di POS, order, invoice, struk, atau event menu.
---

# garage-pos

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

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
- Owner without shift (owner, Nov 2026): POS "mode Owner" (`ownerNoShift` in `pos-view.tsx`) allows every NON-cash action without
  an open shift — order with QRIS/Transfer/E-Wallet, Bayar nanti/accept, Final Bayar non-tunai (payments get `cash_session_id` null,
  no ledger row). Cash (incl. a cash part of a split) is still refused server-side in `createOrderOnce` / `updateCustomerOrderStatus`
  because cash must land in a drawer. Kasir/Manajer still need an open shift.
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

- POS V6 (owner, Nov 2026, `docs/design-system/POS-V6-DESIGN-SYSTEM.md`): visual only — topbar/sidebar/catalog/cart/cash panel in
  `src/components/garage/pos/pos-v6*.tsx|css`; handlers stay in `pos-view.tsx` (no second transaction logic). 4 themes =
  `garage-signature` (default; old `garage-default` maps to it), `garage-clear`, `warm-light` (Warm Coffee), `focus-blue`; colours =
  `--pos-*` tokens in `globals.css`, AA contrast enforced by `pos-v6.test.ts`. Theme Studio = per-device prefs (`CashierPosSettings`:
  productView/showPhotos/sidebarMode/reducedMotion/textSize). Cashier topbar never shows omzet/expected cash (blind count).
  Legacy cashier CSS lives in `@layer components` with `!important`: V6 overrides must stay in the same layer with higher specificity.
- Belum Bayar (owner, Nov 2026): one place for every unpaid order of the staff outlet, all dates
  (`GET /api/customer/orders?scope=unpaid`). Pure rules in `src/lib/pos-pending-bills.ts` (Cash pending vs QRIS/Transfer/
  E-Wallet pending, age 30/60 min/yesterday, one next action, priority); UI `pos/pos-v6-pending.tsx` (sheet + detail popup with
  name/WA/items + `PosV6FinalizeDialog`). "Bayar nanti" stores `paymentMethod: "Cash"` only as a placeholder: payment
  metadata `staffOrder: true` → shown as "Belum dipilih". Final Bayar cash amount is REQUIRED (empty ≠ uang pas). Only bill
  totals are shown, never drawer cash. Nav "Belum Bayar" (F6), sidebar collapse `[`, always-on red edge line (off with reduced
  motion), POS links/`window.open` to internal pages open in `PosV6ModuleSheet` (no new tab; PDFs via `?inline=1`).

- Browser-dialog printing uses `browserColumns` (huruf Besar → 24 col on 58 mm) with tall
  TOTAL/Kembali lines; cashier can print Bar/Dapur chits manually (`printKitchenChits`).

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

- Tanpa voucher & tanpa Promo QR (Owner 25 Nov 2026, `src/lib/voucher-policy.ts`): POS tidak punya kotak kode voucher; order
  bervoucher (klien lama/antrean offline) ditolak server dengan pesan jelas. Potongan yang tersisa: diskon kasir manual
  (+ approval) dan tukar poin member. `qrPromoDiscount` selalu 0; isian Promo QR & cap voucher dihapus dari Pengaturan.
