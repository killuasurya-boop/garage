---
name: garage-partner-hub
description: Aturan WAJIB Smart Partner Hub (mitra resmi, produk partner, portal /partner & /mitra, settlement, payout, harga, website promo). Muat sebelum mengubah apa pun terkait mitra/partner.
---

# garage-partner-hub

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

- Smart Partner Hub (Owner 10 Nov 2026, `docs/partner-hub/`, migration 0188): official registered partners only (rokok/cookies/retail
  stay Quick Retail). Setting `partnerHubEnabled` per outlet (default OFF = old behaviour; partner products hidden). Pure rules
  `partner-hub-rules.ts`; order hooks `partner-hub-orders.ts` (no garage-service import); server `partner-hub-service.ts`; PDF
  `partner-report-pdf.ts`. Partner products = `menu_items.product_type 'partner'` + station `none` (no Bar/Dapur ticket) +
  `partner_product_links` (one partner per item, inactive until Owner approves). Availability = `menu_items.stock` ready/sold_out
  (unlimited, no qty/WMS). Order rule (owner 12 Nov 2026): anyone (customer, waiter, cashier) may order a partner product while it
  is Tersedia; `partnerOrderBlockReason` blocks only hub off / partner not aktif / product not approved / Habis, re-validated on every
  order and at cashier accept (`assertPartnerItemsOrderable`). BUKA/JEDA/TUTUP/offline/last order never refuse an order: the ticket
  goes to the portal and the partner accepts or rejects; screens show it as `partner.note` (`partnerServiceNote`), never as a lock; customer self-order of partner items follows setting `partnerCustomerSelfOrder` (default ON,
  owner Nov 2026; OFF = old DEC-14). Customer orders wait for the cashier; partner tickets are created only at cashier accept, which
  re-validates the hard rules + Habis only. Orders create one `kitchen_tickets`
  row per partner (station `Mitra`, `partner_id`) + `partner_order_lines` with price/HPP snapshot (UNIQUE order_item). Production
  Hub excludes `partner_id` tickets. Partner portal `/partner` uses its own session (`partner-auth.ts`, cookie
  `garage_partner_session`, never staff_profiles); `partner_id` always from the session. Ready (mitra) sets `handoverAt` so the
  existing waiter claim/deliver works. Liability (DEC-03) = HPP of lines whose ticket is ready/delivered; void before ready = 0;
  refund = `partner_adjustments` row. Settlement lines hold `active_line_key` UNIQUE (anti-double); Owner approve → one
  `expenses` row "HPP Mitra" (`sourceDoc PSET:<no>`); payouts (`partner_payouts`, reference & idempotency UNIQUE) never touch
  the drawer; Manajer records → Owner verifies (Owner = self_verified). FINAL PDF only after approval, official logo required
  (fail-closed), versions + checksum in `partner_reports` (regenerated from snapshot). `partner_events` is append-only.
  Staff UI `/partners` (tabs per role; POS nav "Partner Hub" when enabled).
  Hardening (11 Nov 2026, migration 0189): effective service status = `effectiveOperationalStatus` (Buka/Jeda never carries past
  05:00 WIB; portal heartbeat `partners.last_seen_at` older than `partnerHeartbeatMinutes` → "offline", 0 = off) — always go through
  `loadPartnerLinks`. Rejected paid tickets stay on the cashier monitor (`needsRefund`) until refunded via
  `POST /api/pos/partner-orders/[ticketNo]/refund` (existing refund/void approval, no new money path). `partnerSlaEscalateMinutes`
  = one urgent notify per ticket (cashier + management). Partner Web Push = `partner_push_subscriptions` (`sendPartnerPush`, sent
  after commit). Owner with 2FA must pass `totpCode` to approve a settlement. Payout proof photos reuse `storage/cash-receipts`.
  Split bill moves/splits `partner_order_lines` (`movePartnerLineOnSplit`). Kasir MAY see partner HPP/profit (Owner 15 Nov 2026, A3;
  Excel export, dashboard, internal PDF stay Owner/Manajer); session 7 days.
  Public partner portal (11 Nov 2026, migration 0190): `/mitra` (Crystal V5, `partner-public/partner-landing.tsx`) → public
  `POST /api/partner-applications` (rate limit + honeypot, one active application per WhatsApp) → `partner_applications`; staff tab
  "Pendaftar Mitra" (`desk-applications.tsx`); Owner "Jadikan mitra" (`convertPartnerApplication`) = partner DRAFT + products INACTIVE.
  PRD 05 catalog (Es Krim Pokat Au 4 SKU, Dimsum 20 SKU) lives only in `partner-hub-catalog.ts` (test pins the PRD numbers) and is
  imported by Owner via `POST /api/partners/import-catalog` (idempotent, draft/inactive). Product settings = `updatePartnerProductSettings`
  (display only); price rule HPP + margin = `applyPartnerMarginRule` (Owner, goes through `setPartnerProductPrice` history).
  Operasional (11 Nov 2026, no migration): sidebar module `partners` (Owner/Manajer) → `/partners`; Kelola Mitra activation checklist +
  "Aktifkan mitra sekarang" (path follows `PARTNER_STATUS_FLOW`); partner/account phones must be digits (`partnerPhoneOrThrow`).
  Rejected-unrefunded partner tickets never age out of the cashier queue. SLA escalation + "siap belum diambil" run in the server
  sweeper (`sweepPartnerSla`, instrumentation-node, dedup per ticket). Partner gets push on settlement approved / payout verified.
  Portal: earnings + history by period (`/api/partner/finance`, `/api/partner/tickets?scope=history&from&to`), payouts list,
  read-only Info kerja sama, self PIN change `POST /api/partner/auth/pin` (old PIN, weak PIN refused, sessionVersion+1), reject
  reasons panel. Staff: product photo upload (`/api/partners/products/[linkId]/image` → `/garage-uploads/menu`), variants add/remove
  (Owner), price history + event log, payout void button, Excel `GET /api/partners/finance-export` (Owner/Manajer; ringkasan,
  terlaris = `partnerBestSellers`, transaksi), Owner dashboard widget `/api/partners/dashboard`, waiter card "Ambil dari Mitra".
  Growth (Nov 2026, migration 0191, `docs/partner-hub/01-IMPLEMENTASI.md`): pure rules `partner-hub-insights.ts` (price proposals,
  performance report, health alerts — neutral wording). Partner price proposals = `partner_price_proposals` (one pending per variant,
  partial unique index); master price changes only on Owner approval through `applyPartnerPrice` (the single price writer, also used by
  `setPartnerProductPrice`); reject needs a reason. Portal shows the partner's own harga setor (same as its finance lines). Performance
  (`/api/partner/performance`, `/api/partners/[id]/performance`, setting `partnerPrepTargetMinutes`) and health (`/api/partners/health`,
  Owner/Manajer, read-only) never change data. Partner product Tersedia/Habis belongs to the partner: `updateMenuProductStock` /
  `updateMenuProduct` throw `PartnerProductStockError` (409) for `product_type 'partner'`, bulk stock/type actions skip them, and
  the POS "Atur Stok Habis" dialog hides them and never resets them. Waiter "Ambil dari Mitra" groups ready tickets per table
  (`groupPickupByTable`) with Klaim/Antar semua — still one call per ticket to the existing claim/deliver endpoints.
  Open screens refresh partner status: `usePartnerMenuRefresh` (digital menu `/api/customer/menu`, POS/waiter `/api/menu`) every
  30 s while visible + on focus, only when the list has partner items; `mergePartnerStatus` (`partner-menu-refresh.ts`) copies only
  `stock`/`partner` of partner items (event prices, bundle variants, cart untouched; missing item = locked).
  Partner products are never edited through the general product form: `PATCH /api/menu/[id]` checks `partnerProductEditBlock`
  BEFORE schema validation (409 `PARTNER_PRODUCT_EDIT`, names the partner) and `updateMenuProduct` only lets tags/sortOrder/featured
  through (`PartnerProductEditError`); Inventory "Kelola Produk" shows the Partner Hub hint instead of opening the form.
  Wrong partner = Owner "Pindahkan ke mitra lain" (`movePartnerProduct`, `POST /api/partners/products/[linkId]/move`, reason
  required): only future orders follow the new partner, old lines/liabilities stay, pending price proposals are cancelled, events on
  both partners. Bulk = "Pindahkan semua produk…" (`movePartnerProducts`, `POST /api/partners/[id]/products/move`, optional `linkIds`;
  one tx, links locked FOR UPDATE, a foreign link rejects the whole request; UI always sends the ids the Owner saw). Health alerts `NO_PORTAL_ACCOUNT` (products, no portal account) and `NO_ACTIVE_PRODUCT` (account, no products).
  Decision stays with the partner (12 Nov 2026, migration 0192): rejected ticket on an UNPAID bill = cashier "Keluarkan dari bill"
  (same endpoint `/api/pos/partner-orders/[ticketNo]/refund` → `requestUnpaidItemCancelApproval`, APP-PCX); `needsRefund` follows the
  bill the partner line now lives on; Belum Bayar shows a warning chip only (Final Bayar is never blocked). Garage cancelling an order
  (`cancelProductionForOrder` / `cancelProductionQuantities`) calls `schedulePartnerCancelNotice` (push + event
  `ticket_cancelled_by_garage`), portal shows "Dibatalkan Garage" for 10 min (`listRecentlyCancelledTickets`). Staff-set PINs: weak PIN
  refused (`isWeakPartnerPin`), `partner_accounts.must_change_pin` → `requirePartnerSession` returns 403 `PIN_CHANGE_REQUIRED` except
  with `allowPinChangePending` (me, pin, logout). `moveTable` updates `partner_order_lines.table_label`. Partner payouts ARE posted to the cash book
  (owner 12 Nov 2026): a VERIFIED payout from bank_jago/bank_bni = one `partner_payout` row bank → external (`postPayoutToLedger`,
  one per payout); void = `partner_payout_void` reversal row; `external` and unverified (`recorded`) payouts are never posted; payouts
  verified before this change are not backfilled (Owner corrects the bank balance via opening-balance certification).
  Self-order digital menu shows partner items with the partner status ("Tersedia di mitra" or the partner reason, never the Garage OS stock "Sold Out") plus "Disiapkan mitra · <nama>"; with `partnerCustomerSelfOrder` OFF the stepper is replaced by "Pesan ke kasir atau waiter" (DEC-14). POS search: Enter on an exact SKU/barcode (product or variant, partner items included) adds that variant (scanner).
  Media marketing (11 Nov 2026, no migration): homepage section `#mitra` (`partner-showcase.tsx`, public `GET /api/site/partner-products`,
  no HPP/contact) + hero tab "Mitra" + mobile drawer links. A product shows only when Owner picks it (tag `PARTNER_WEBSITE_TAG`
  "Promo Website", max 8, `setPartnerWebsitePromotion`) AND it still passes `partnerMarketingBlockers` (partner aktif + verified bank,
  product approved, real photo, description ≥15, in digital menu, price > HPP) and the outlet hub is on. Owner panel "Media marketing
  website" in product settings. `/partner` login = Crystal V5 split layout (`partner-login.css`).
  Status control (15 Nov 2026, no migration): Kelola Mitra list row = clickable status chip → `PartnerStatusControl`
  (`partner-status-control.tsx`) with actions from pure `partnerStatusActions(status, role)` → dialog (effect, active orders,
  missing activation requirements, reason) → `POST /api/partners/[id]/status-action` → `applyPartnerStatusAction` (checks
  activation requirements BEFORE the path so status never stops halfway, pushes the partner). Aktif/disetujui/nonaktif = Owner
  (`partnerStatusNeedsOwner`); freeze/draft/verifikasi = Owner or Manajer. `listPartners` returns `readiness`, `activeOrders`.
  Kasir (Owner 16 Nov 2026, no migration, guide `docs/partner-hub/03-PANDUAN-KASIR.md`):
  - POS "Pesanan Mitra" / "Penjualan Mitra Hari Ini" open as native panels in `PosV6ModuleSheet` (kind `partners`), not an iframe.
  - Card buttons come from pure `partnerDeskPlan` / `partnerDeskSteps` (`src/lib/partner-cashier-rules.ts`): one primary action per
    status. Take away/delivery (`isPartnerPickupOrder`) + money holder = "Serahkan ke pelanggan" → `POST /api/pos/partner-orders/[no]/handover`
    (`handoverPartnerTicket`: READY only, never skips the partner like `serve_direct`; claimed by someone else = Owner/Manajer only).
  - Partner "Siap" runs `announceTicketsProgress` (garage-service, shared with Bar/Dapur): completion print + "semua siap" once per order.
    `partner_ready` also goes to the cashier for pickup orders.
  - A delivered partner ticket sets its `partner_order_lines` to `delivered` and resolves the partner_ready notifications.
  - Shift report "Penjualan Mitra" = `partnerShiftSales` over the shift's order ids (`partnerSalesForOrders`): sales, modal mitra
    (= wajib bayar), profit Garage, plus pending / rejected / unpaid-bill / refund. Shown in the PDF (`renderPartnerSales`), the POS
    card and the shift detail via `GET /api/finance/cash-sessions/[id]/partner-sales`. Open shift is allowed: no drawer cash.
    Read-only; payment to partners stays the daily settlement.
  - Service hours `partnerServiceOpen`/`partnerServiceClose` (default 17:00–22:30 WIB, empty = no limit) are an exception to
    "status never refuses":
    - outside the window `partnerOrderBlockReason` refuses (card label "Tutup · buka 17.00");
    - cashier accept checks against `orders.createdAt`;
    - `sweepPartnerServiceHours` (server sweeper) sets Buka/Jeda → Tutup once after close and sends an open reminder.
    Tests set the hours to "" when they are not testing them.
