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
- `design-system/COMPONENTS.md` + `src/lib/design-tokens.ts` - U1 semantic tokens `--gos-*` (WCAG AA tested) and base components in
  `src/components/ds/` (`StatusPill`, `MoneyText`, `StateView`); live registry `/control/design-system`. Check before adding a component.

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
  (`cash_sessions.opening_denominations`, total must equal opening cash; coin Rp1.000 key `1000k`; opening cash is any
  amount in Rp100 steps up to `shiftOpeningCashMax`, e.g. Rp55.200 — `src/lib/opening-cash.ts`, owner Nov 2026),
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
  moved yet; rejected/voided kept, never deleted). Kasir cash in/out is recorded at once (owner Nov 2026); only kasbon +
  refund_pelanggan (`requiresApproval`) or a cash-out pushing the shift total over `cashMovementShiftLimit` need a Manager PIN or
  a request (`cashDrawerNeedsApproval`). Cash-out ≥ `cashMovementPinThreshold` without receipt photo → Kontrol Kas queue
  `cash_out_no_receipt`; risk rule `CASH_OUT_DIRECT_HIGH` (review priority only); void/correct = Owner/Manajer, session still open, reason + audit before/after.
  Drawer expenses can't be cancelled from Finance/Payroll (`cancelExpenseInTx` guard). Kasir never sees drawer
  balance while the shift is open (`redactOpenShiftSummary`). Receipt photos live in non-public
  `storage/cash-receipts`, served only via `/api/finance/cash-movements/[id]/receipt`.
- Buku kas tunggal (owner, Okt 2026, P1 closing, migration 0159, `docs/AUDIT-P0-CLOSING-2026-10.md`):
  - Every rupiah that moves = one immutable row in `cash_ledger_entries` (from/to `cash_accounts`: drawer, petty,
    bank_jago, bank_bni, qris_clearing, external). DB trigger blocks UPDATE/DELETE; corrections = reversal rows
    (`reverses_id`). Only the grand-opening reset may purge (`SET LOCAL garage.cash_ledger_purge = 'on'`).
  - Never write `cash_sessions.expected_cash` directly: use `postDrawerCash` (`src/lib/cash-ledger.ts`), which posts
    the row and updates the cache in the same tx. Writers: opening, sale (cash part only), final_pay (confirmed
    payment amount, not order total), refund/void (drawer actually paying out, origin shift untouched), method_fix,
    payment_revert, drawer_out/in + drawer_reversal, expense/expense_cancel.
  - `cash_sessions.ledger_mode`: shift reports/closing use the ledger (`getDrawerLedger`, `drawerBalance`); old-format
    shifts keep the legacy formula with a label. Open shifts at migration got a `legacy_opening` row.
  - Finance cash expenses need `cashSource` (`src/lib/cash-sources.ts`): drawer = only the recorder's own open shift;
    bank_jago/bank_bni posted as account rows; external (Owner personal money) not posted. No shift + no source =
    `ExpenseCashSourceError` — never cut another cashier's drawer. Payroll/agent expenses default to external.
  - Petty cash (P2, migration 0160): approval ≠ payment. Balance = ledger account `petty` (`pettyCashBalance*` via
    `accountBalance`), moves only on "pay" (`decidePettyCashEntry` decision `pay`, recipient required for expenses,
    advisory lock per outlet, never below 0). Kasir/Manajer entries are submitted; approver ≠ creator. Owner entries
    are approved+paid at once with `self_approved` ("tanpa pemeriksa kedua"). Top-up has `fund_source`
    (bank_jago/bank_bni/external). Cancel after pay = `petty_reversal` ledger row; history never changes. Old approved
    entries were backfilled as paid at their entry time.
  - Closing & access (P3/P4, migration 0161):
    - Denominations are mandatory in `closeCashSession`. Closing without them = emergency only:
      `countSkippedReason` + Manager PIN.
    - Discrepancy status (`cashDiscrepancyStatus`, labels in `src/lib/cash-discrepancy.ts`):
      - `ok` only at Rp0.
      - `minor` ≤ Rp10.000: not escalated, still shown.
      - `review`/`critical`: approval queue.
    - `actual_cash` = cashier's first count, never overwritten; the checker's recount goes in `recount_*`.
    - `reviewCashSession`:
      - verifier ≠ shift opener/closer (Owner = `review_self_verified`, "tanpa pemeriksa kedua");
      - Manajer outlet-scoped (`assertSessionAccess`);
      - "verified" with a discrepancy (first count or recount) needs `acknowledgeDiscrepancy` + note.
    - Incidents are resolved by Owner/another Manajer, never the reporter.
  - Setoran (no brankas, no handover to Owner):
    - Category `setoran` requires `depositAccount` (bank_jago/bank_bni) and posts drawer → `deposit_transit`.
    - `confirmCashDeposit` (Owner/Manajer ≠ depositor, bank ref) posts `deposit_transit` → bank.
    - A confirmed setoran can't be voided.
    - Category `brankas` is `retired`.
    - Setoran at shift close (owner 29 Okt 2026, "kasir catat setoran"): `closeCashSession` needs `depositAccount` when
      counted − `floatLeft` > 0 (no `floatLeft` = everything stays in the drawer). `postShiftClosing` (`cash-ledger.ts`) closes the
      shift drawer to 0 with `close_variance` / `close_deposit` (drawer → deposit_transit + a `setoran` cash_movements row,
      confirmed later via `confirmCashDeposit`) / `close_float` rows. These `SHIFT_CLOSE_SOURCE_TYPES` never touch
      `expected_cash` and are excluded from `drawerBalance` / shift ledger lines (`getDrawerLedger().closingLines`).
  - Owner cash oversight (P5): `/control/cash-closing` panel `CashOversightPanel`. Data and Excel come from one
    `getCashOversight` (`src/lib/cash-oversight.ts`; labels in `-meta.ts`; xlsx in `-xlsx.ts`) via
    `GET /api/control/cash-oversight` (Owner only).
    - Action queues: discrepant shifts not acknowledged, review >24h, unconfirmed deposits, pending cash-outs,
      petty submitted / approved-unpaid, open incidents, QRIS mismatch.
    - Control exceptions: emergency close, self-verified, Owner petty, self-confirmed deposit, cache≠ledger.
    - Read-only except the inline deposit confirm (existing endpoint).
  - Opening balances (P6, migration 0162): `src/lib/cash-opening.ts` (labels `-meta.ts`), `/api/control/cash-opening`
    (Owner only), card `CashOpeningCard` in the oversight panel.
    - Migration backfill rows (`request_hash = 'legacy'`, `isLegacyLedgerRow`) are `legacy_unverified`; never recompute them.
    - Owner certifies the real balance once per scope (petty per outlet, bank_jago/bank_bni global) with evidence and
      `expectedLedgerBalance` (stale = `LEDGER_CHANGED`); difference = one `opening_balance` row, external ↔ account.
      `cash_opening_certifications` is immutable (same trigger as the ledger) and CLEARed by the grand-opening reset.
    - The drawer is activated at the shift boundary (opening count), never certified here.
    - T25: `cashLedgerFingerprint` = `scripts/cash-ledger-fingerprint.sql` (test keeps them identical); restore drill in
      `docs/DEPLOY_VPS.md`.
  - Probe `closing-audit-probe.integration.test.ts`: no `it.fails` left. Tests close shifts with
    `cashCount(amount)` (`test-helpers/cash-count.ts`) for both `denominations` and `recountDenominations`.
  - B4 (owner, Okt 2026, migration 0167, PRD §10.8/§13):
    - Double blind count: `closeCashSession` needs `recountDenominations` (#2, empty form, never copied from #1)
      while setting `shiftRequireDoubleCount` is on (default OFF since migration 0181, owner Nov 2026: count once). #1 ≠ #2 per denomination (`denominationMismatches`)
      → `CashSessionCountMismatchError` (409 `COUNT_MISMATCH`) until `thirdCountDenominations` (#3) is sent; #3
      becomes `actual_cash`/`denominations`. Every count (+ manager recount) is an append-only row in
      `cash_session_counts` (trigger; purge only with the grand-opening GUC).
    - Cashier close and manager verify are NOT final. `cash_sessions.final_status`: pending → approved |
      approved_with_exception | returned (→ review `needs_followup`, manager re-verifies); `legacy` = closed before B4.
      Final = Owner only via `src/lib/cash-final-approval.ts` (`GET/POST /api/finance/cash-sessions/[id]/final`):
      preview recomputes a summary hash + step-up challenge; decide re-locks the row, recomputes the hash (changed
      data → `STALE`), verifies TOTP (`step-up-totp.ts`), `final_version` guards concurrent decisions. Any exception
      (discrepancy, count #3, emergency close, open incidents, self-verified…) forbids plain "approve".
    - Step-up TOTP (`step-up-totp.ts`, table `step_up_challenges`): challenge bound to user/purpose/subject/summary
      hash, single-use nonce (hash only), 5 min; used codes stored hashed (no replay). Never log codes or secrets.
    - B7a (migration 0168): each final decision inserts an append-only `cash_session_final_snapshots` row
      (`finalReportId` = `FIN-<code>-V01`, summary, hash, exceptions). Shift PDF: DRAFT watermark until final,
      count history, Owner block, audit metadata; file name `officialShiftFileName` (PRD §20.2).
  - B6 risk (migration 0169, PRD §14): rules are pure in `src/lib/risk-rules.ts` (explainable, LV = review priority,
    never an accusation — tests forbid accusing words; repeat rules use shift denominators; QRIS/bank alerts are not
    cashier custody). `risk-engine.ts` upserts by `dedupe_key` and only refreshes OPEN alerts (human dispositions
    are never overwritten); scans run in background after close/review/final (`scanRiskInBackground`). Manajer can
    not review alerts about themself; SUBSTANTIATED/CLOSED/OPEN are Owner only; escalation creates an `audit_cases` row.
  - B7b (no migration, PRD §13.5/§16.1/§20.2): `owner-reports-build.ts` (pure: daily dossier, monthly ledger, case dossier;
    shortage/surplus never netted; missing data = `UNAVAILABLE_METRICS`, never 0), `owner-reports.ts` (DB loaders; shift numbers
    come from `getShiftAccountability`), `owner-reports-pdf.ts` (PDF B CLOSING / C FINANCIAL_AUDIT / D CASE, B7a writer).
    `GET /api/reports/owner-official?type=closing|monthly|case[&format=pdf]` Owner only; UI `OwnerDossierPanel` (Kontrol Kas).
  - B7c: `cash-ledger-report.ts` (period cash book per account from `cash_ledger_entries`, running balance, opening+in−out=closing
    checked against `accountBalance`, `external` = flows only), PDF `cash-ledger-pdf.ts`, Excel `cash-ledger-xlsx.ts`;
    `type=ledger&month=|from&to[&format=pdf|xlsx]` (all outlets — bank accounts are global). Query schema: `owner-reports-query.ts`.
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
- Invoice Digital V4 / CX Engine (owner, Nov 2026, migration 0182, `docs/CX-ENGINE-V4.md`): `/invoice/[token]` =
  components in `src/components/garage/invoice-v4/` (`iv-*` CSS in `@layer components`). Pure rules: `invoice-v4.ts`
  (payment state via `paymentStatusOf`, 5-step flow, station cards, `maskPhone`), `customer-offers.ts` (eligibility,
  `voucherEffectiveStatus`, `verifiedTierBenefits` from Settings point rules — never unimplemented perks), `cx-whatsapp.ts`,
  `cx-events.ts`; server `customer-experience-service.ts`. Invoice token ≠ account ownership: member data only from the
  member session, invoices are never linked to a member from the public page. "Saya Sudah Bayar" only opens WA proof help.
  wa.me clicks = "opened", never "sent". Promo WA needs latest `customer_marketing_consents` = granted + max 1/7 days.
  Events (`customer_experience_events`) carry no phone/PIN/token/IP.
- Member OTP WhatsApp (owner Nov 2026, migration 0183, `docs/MEMBER-OTP-WHATSAPP.md`): rules pure in `member-otp-rules.ts`,
  server `member-otp.ts`, UI `member-auth/member-phone-otp.tsx` (shown only when the provider is configured — no fake OTP).
  Codes/tokens stored only as HMAC in `member_otp_challenges`; sent straight to Cloud API (never via `whatsapp_messaging_queue`).
  `registerMember` refuses to merge a POS customer with history (points/visits/paid order) unless `phoneVerified`; OTP active
  = every registration needs `otpToken`. Never name a public-route function `verifyMember*` (matches a guard pattern). Without Meta, "Kode klaim kasir" works the same way: POS
  `POST /api/pos/member/claim-code` (crm-only customer, 15 min, HMAC, `delivery_status='cashier'`) →
  member enters it via "Punya kode dari kasir?" (`/api/member/auth/claim/verify`) → same OTP token → `phoneVerified`.
- Browser-dialog printing uses `browserColumns` (huruf Besar → 24 col on 58 mm) with tall
  TOTAL/Kembali lines; cashier can print Bar/Dapur chits manually (`printKitchenChits`).
- Production Hub V4 (owner, Nov 2026, no migration): UI `src/components/garage/production-hub/` (portal over the shell,
  `production-view.tsx` only re-exports). Display rules are pure in `src/lib/production-hub-v4.ts` (one primary action per
  status, pickup = no table → AMBIL/`serve_direct`, never delivery actions; `stabilizeOrder` keeps the card in use in place;
  `resolveGrid` never shrinks cards below `CARD_MIN_*`). Transitions stay server-validated (`updateKitchenStatus`).
  Completion ticket ("tiket SELESAI") = `print_jobs` rows `order_completion` / `order_completion_reprint`
  (`production-completion-print.ts`, rules `-rules.ts`): queued once per order at the existing all-ready point (advisory
  lock per order); a device with "Auto Print" claims atomically (pending → printing, lease 90 s) and prints through
  `deliverPrintContent` without the Chrome dialog; definite failure → back to pending (max 5), expired claim → failed
  "tidak pasti" (never auto-reprinted); reprint needs a reason, Kasir max 3/order, Owner/Manajer unlimited; every step
  in `audit_logs`. History drawer = `GET /api/production/history` (read-only; corrections via existing reopen).
- Smart Notification V2 (Nov 2026, `docs/notifications/`, migration 0183): staff feed = `notifyStaff` only; audience `bar`/`dapur`
  for single-station work (`production` = both). Resolve with `resolveStaffNotifications` after the domain mutation succeeds
  (resolved = no toast/repeat/action). Client sound = once per device via `claimSound` (`sound-claim.ts`; pass a `dedupKey` to
  `voice.announce`). Hub sound rules are pure in `hub-sound-rules.ts` (device station only; "pesanan siap" only when the whole
  order is ready). Payment text in notifications via `paymentNoticeLabel` (QRIS never reads as paid). Logout releases push.
  Shift-close check panel = `shift-close-check.ts` (pure) + `GET /api/finance/cash-sessions/[id]/close-check`: info only, never blocks
  closing, never sends cash/expected cash to a Kasir while the shift is open.

- MCP ChatGPT (owner D-01, batch M0): OAuth 2.1 via `@better-auth/mcp` + `jwt` plugin, only when
  `GARAGE_MCP_CHATGPT_ENABLED=true` and `BETTER_AUTH_URL` is HTTPS (`resolveMcpChatgptConfig`, `mcp-chatgpt-config.ts`);
  off = no OAuth endpoints. Tables `jwks`/`oauth_*` (migration 0163) come from the drizzle-adapter schema generator — keep
  them in sync with the plugin version. `/api/mcp/chatgpt` = `requireMcpAuth` → `handleMcpChatgptRequest`
  (`mcp-chatgpt-gateway.ts`): kill switch `mcpChatgptPaused`, Owner + 2FA only (`mcpChatgptAccess`, also used by
  `/oauth/consent`), synchronous audit before each tool. Owner universal write (Okt 2026): `ubah_data_garage`
  (R2, `confirmOnly` = ChatGPT confirmation flow only; money paths `isMoneyPath` → R3 via `riskFor` = `kode2fa` required,
  Owner 28 Okt; encoded `%2e`/`%2f` paths rejected) + `garage_api` GET + `katalog_endpoint`
  (`api-route-catalog.generated.ts`, regenerate with `npx tsx scripts/generate-api-catalog.ts`) call `/api/*` via a
  temporary agent key revoked right after (`mcp-delegated-api.ts`; scope owner/readonly, hidden from key list);
  blocked paths in `ubahDataBlockReason`; switch `mcpChatgptWriteEnabled` (off = writes `MCP_WRITE_DISABLED`). Login/2FA pages forward the signed
  `oauth_query` (`oauth-login-continue.ts`). See `docs/AGENT-API.md` §6.
- Owner AI Connect (blueprint GOS-AI-MCP V3 Phase 1, `docs/owner-ai/`, migration 0175): `/control/ai-connect` + navbar chip
  (`AiStatusChip`). Status is per dimension (`computeAiStatus`, `owner-ai-status.ts`, pure): gateway / identity / ChatGPT link / tool
  access / execution — never a single green. `VERIFIED` only via MCP tool `garage_verify_connection` with a one-time code from
  `POST /api/owner-ai/connection/challenge` (hash bound to Owner, 10 min, 5 tries) within a 24 h TTL; `READ_WRITE` only after a write
  actually succeeded from ChatGPT (previews don't count). Gateway records `ai_connections` per OAuth client and rejects tokens with
  `iat` ≤ `revoked_at` (JWTs are stateless). Revoke = Owner + TOTP (`/api/owner-ai/connections/revoke`), also revokes refresh tokens.
  `/api/owner-ai/*` is in `isAgentForbiddenPath` and rejects agent-key sessions: AI must never mint its own verification code.
- Owner AI Command Center (Phase 2, ADR-001): `/control/ai-command` runs agent tools on the SAME engine as ChatGPT
  (`owner-ai-commands.ts` → `runToolWithConfirmation` with `source: "garage_owner_ui"`, synchronous audit first). Never add a
  UI-only shortcut that skips preview/token/2FA. Receipts carry `sidikArgumen` + `sidikHasil` (`resultHash`, recomputable via
  `operationView`). Form = `SchemaForm` from the tool JSON schema (`parseIdNumber`: "2.5" stays 2.5).
- MCP hardening (owner-ai Phase 4): `tools/call` keeps the plain-text result but adds `structuredContent.dataAsOf` + `_meta`
  (`garage/requestId`, `garage/contentIsData`); errors = `toolFailure` (`code, message, requestId, retryable, recovery`) and NEVER forward
  unexpected error text (SQL/stack) — `EXECUTION_FAILED` + ref, details only in server logs. `mcp-load-guard.ts`: max 4 concurrent
  ChatGPT tool calls per Owner, read tools time out at 25 s, write tools are never cut. Fraud Watch tools `garage_list_anomaly_cases` /
  `garage_get_anomaly_case` wrap `listRiskAlerts` (same role scoping) and are read-only.
- MCP tool registry & confirmation (batches M1/M2): every agent tool declares `domain` (16 PRD domains) + `risk` R0–R3
  (`mcp-tool-registry.ts`, enforced by tests; `write === risk !== "R0"`). On `/api/mcp/chatgpt`, R2/R3 tools go through
  `runToolWithConfirmation` (`mcp-confirmation.ts`, table `mcp_operations`, migration 0164): first call = preview +
  single-use token (5 min, only nonce hash stored), confirmed call must repeat the exact args; claim is one atomic
  `UPDATE … WHERE status='pending'`. Never log the token. Tools may define a read-only `preview()`.
  R3 (D-01a): preview also creates a step-up challenge (subject = operation id, hash = args digest); the confirmed
  call needs `kode2fa` (Owner TOTP), verified BEFORE the token is claimed.

- Smart Approval V3 (owner, Nov 2026, migration 0177, `docs/smart-approval-v3/`): `approvals` carries `outlet_id`,
  `amount_value`, `execution_status` (decision ≠ execution: running/succeeded/failed/not_required/legacy), error/attempts,
  `decision_snapshot_hash`, `review_state` (Tunda/Minta revisi, status stays pending). Rules pure in `src/lib/smart-approval.ts`
  (tier R1–R3, `bulkDecisionBlockReason`, `autoApprovalDecision`, `canDecideForOutlet`). `decideApproval` checks outlet, optional
  `expectedSnapshotHash` (`approvalSubjectSnapshot`, 409 STALE), records failed execution (back to pending + audit), PCX split is
  idempotent (`payload.splitChildId`). Bulk approve never touches R3/void/refund/cash/stock; auto-approval = expense, low/medium,
  < threshold, requester ≠ sweeper, max 3/day/requester. Owner Decision Center `/control/decision` (`decision-center*.ts`,
  `/api/control/decision-center`): explanation A–J is rule-based; R3 = Owner TOTP step-up bound to the snapshot hash.
- Smart Approval Batch 7 (Nov 2026, migration 0179, `docs/smart-approval-v3/09-BATCH7.md`):
  - Document Approval: a new company document version = `review_status` pending + sha256 + approval `APP-DOC-<versionId>` (one tx);
    effective version = `company_documents.approved_version` (set only when approved; rejected keeps the old one, file kept).
    `ownerOnlyApproval` (`smart-approval.ts`): APP-DOC hidden from and undecidable by non-Owner. Snapshot hash covers doc/version.
  - A8: APP-PCX `payload.requestedBy` = user id (name in `requestedByName`); self-approval check also matches legacy "Nama / Peran".
  - AI Governance `/control/ai-governance` (`ai-governance.ts` pure, `-server.ts`, Owner screen only): mode = the two existing
    switches (`settingsForMode`; paused also turns writes off), tool risk from the code registry (read-only). `mcpChatgpt*` and
    `securityRequire2faForOwner` are Owner-only (`assertRoleMayWriteSettings`); `ubah_data_garage` refuses protected setting keys.
  - Decision PDF `GET /api/control/decision-center/[id]/pdf` (`decision-pdf.ts`): DRAFT until decided AND execution recorded;
    printing never creates a step-up challenge (`getDecisionDetail(..., { stepUp: false })`).
- Smart Approval decision policy (audit Nov 2026, `docs/smart-approval-v3/10-AUDIT-FIXES.md`): ONE rule set in
  `decisionPolicyBlock` (`smart-approval.ts`), called inside `decideApproval` for every channel (board, pin, langsung, auto,
  decision_center, chatgpt, owner_command, agent_key). Agent API keys never decide/defer (`AGENT_CANNOT_DECIDE`). Approving R3 =
  Owner + 2FA verified for that decision (`stepUpVerified`, set only by Decision Center after TOTP or by the MCP R3 confirm flow);
  rejecting is always allowed. Non-Owner "langsung" on high risk stays pending (`canSelfApprove(garage, risk)`). `putuskan_approval`
  is R3. APP-CASH: opener/closer can't approve own discrepancy; an existing sign-off is never overwritten.
  Tahap B (migration 0180): `approvals.expires_at` (discount 6 h, `APPROVAL_TTL_HOURS`), statuses `expired`/`superseded`
  (never deleted); `reconcileApprovals` (`approval-reconcile.ts`, rules pure in `-rules.ts`, every minute from the server
  sweeper) expires/supersedes, verifies stuck `running` executions (succeeded only with proof, else `uncertain`) and pushes
  R3 / R2>30 min to Owners. Sweep skips `reviewState`; errors never carry SQL (`safeExecutionError`).
  Tahap C/D: Decision Center loads deterministic cross-module context (requester 30 days, open risk alerts, same order) +
  evidence-completeness `confidence`; `getDecisionQueues` = read-only index of other modules' approval queues; decisions
  record `payload.decisionCenter` (recommendation, confidence, followed) → AI Governance "Kualitas keputusan".
- AYA Problem Solver V4 (`docs/smart-problem-solver-v4/`, migration 0178): `garage-problem-solver.ts` (R0 whitelist, facts,
  hypotheses, report; tool errors never forwarded — ref only), service sends only `aiSafeExcerpt` to AI providers; MCP tool
  `garage_analisis_masalah` (R0, Owner). Cases `ai_problem_cases` + append-only `ai_problem_case_events` (`ai-problem-cases.ts`):
  analysis → decision (STALE) → link the Owner's own executed `mcp_operations` → verification (`compareOutcome`). UI
  `/control/aya-solver`; Living Intelligence `/control/intelligence` (16 registry domains, real signals, no signal = unverified).

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
  `/api/tables/config`). No rows for an outlet → all 01–50 active. `floor` (migration 0183, Crystal V5) = lantai per
  meja; null → `defaultTableFloor` (01–25 = 1, 26–50 = 2). Customer picker groups/filters via `src/lib/table-floor-view.ts`. Inactive tables
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
- Digital menu mode (Menu V5, owner 4 Nov 2026) = setting `digitalMenuMode` per outlet (`src/lib/digital-menu-mode.ts`):
  `self_order` (default, flow above) or `waiter_list` (customer builds a Daftar Pilihan → "Tunjukkan ke Waiter" QR =
  `/order?table=NN&mode=waiter&daftar=<base64url ids/qty/notes, no prices>`; waiter's Pesankan opens prefilled, validated
  against the current menu). `/api/customer/orders` returns 403 `DIGITAL_MENU_VIEW_ONLY` in `waiter_list`; delivery is off and
  no table hold is needed in that mode. Staff orders are unaffected. Daftar Pilihan is kept in sessionStorage per outlet & table.
- Menu V5 customer extras (5 Nov 2026): table pick in `waiter_list` = info only (`table-info-v5.tsx`, GET only, never holds/occupies);
  Signature = product tag "Signature", Unggulan = `featured` (never the same badge); AYA 3D = lazy `three` (`aya-stage-3d.tsx`, official
  V5 layers, 2D fallback); AYA chat stays rule-based (no AI key in frontend). Details: skill `garage-menu-v5`.

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

- Staging (R1, `docs/STAGING.md`): `docker-compose.staging.yml` in `/root/garage-staging` on the same VPS, own DB
  `garage_staging`, app joins `garage_default` as `garage-staging-app` for the prod Caddy (`caddy-sites/staging.caddy`,
  basic auth). Data = prod dump anonymized by `scripts/staging-anonymize.sql` (refuses non-staging DB names); outbound
  messaging/AI keys off. Deploy any branch with `scripts/deploy-staging.sh`; prod stays `scripts/deploy-manual.sh`.
  Staging service names MUST be `staging-*` (never `app`/`db`): a same-named service on `garage_default` made prod
  Caddy load-balance into staging (incident 28 Okt 2026, random "Silakan login"). `scripts/staging-network-guard.sh`
  stops staging when `app`/`db` resolve to more than one container.
- Security guards (audit 29 Okt 2026, F1): every `src/app/api/**/route.ts` must call a known guard (`KNOWN_ROUTE_GUARDS`) or be
  listed in `src/lib/public-routes.ts` with a reason + abuse guard — enforced by `api-route-auth.test.ts`. Attendance PIN
  guessing = `pin-attempt-guard.ts` (DB, survives restart); Better Auth `rateLimit.storage: "database"` (table `rate_limit`,
  migration 0170). CSP is report-only (`next.config.ts` → `/api/csp-report`, audit_logs `csp_violation`); staging has its own
  `BETTER_AUTH_SECRET` (2FA/JWKS cleared by `staging-anonymize.sql`).
- Release safety (29 Okt 2026, `docs/DEPLOY_MANUAL.md`): `scripts/release-check.sh` must pass on the MERGED main before
  `deploy-manual.sh` (stamp `.git/garage-release-check` = SHA; catches combined-PR breakage like the API catalog);
  deploy runs `scripts/smoke-prod.sh` after health (fail → rollback). `scripts/vps-monitor.sh` (cron, read-only) →
  `POST /api/jobs/system-alert` (job secret) → `notifyStaff` push to Owners, dedup 1×/hour/check (`src/lib/system-alert.ts`).
  `scripts/restore-drill.sh` restores the latest backup into a throwaway container on its own network (never `garage_default`).
- E2E (audit #8, F3): `npm run test:e2e` = Playwright `e2e/critical-flows.spec.ts` (login, POS tunai/QRIS, tutup shift + setoran,
  Owner PDF/Excel, Kelola Staff scroll) on a FRESH PGlite (`e2e/start-server.mjs` → migrate → seed → `next dev :3101`); seed password
  random per run; local Chrome (`E2E_BROWSER_CHANNEL=""` + `playwright install chromium` in CI). Runs in `release-check.sh`
  (`--skip-e2e` = emergency, stamped). Scroll checks must use wheel/touch, not `scrollIntoView` (code can scroll overflow-hidden).
  CI template `docs/ci/ci.yml` (Owner moves it to `.github/workflows/`; agent token lacks `workflow` scope).
- Offsite backups are GPG-encrypted (audit #11): `scripts/pull-backups.sh` encrypts with the Owner's PUBLIC key only
  (`~/.garage-ops/backup-public.asc`, made once by `scripts/setup-backup-key.sh`) and deletes plaintext; opening needs the Owner's
  private key + passphrase (`scripts/restore-from-encrypted.sh --check|--drill|--out`). Never store the private key or passphrase
  in the repo, OneDrive, logs or scripts; never type them for the Owner.

## UI/UX Tooling (skills + free MCP)

Use these automatically when the task calls for them; do not wait to be asked. Design rules above (Garage palette,
`design-system/MASTER.md`, member contract) always win over any skill or MCP output.

Skills (`.claude/skills/`): `ui-ux-pro-max` (style/palette/layout ideas), `frontend-design` (hierarchy, type, restraint,
copy; never a rebrand), `web-design-guidelines` (audit UI code, output `file:line`).
Garage Crystal V5 (owner, 8 Nov 2026) is the visual source of truth for ALL public surfaces (`/order` landing, table
picker, digital menu, member login/dashboard/card) and the internal sidebar: boards `docs/design-references/crystal-v5/`,
spec `docs/crystal-v5/01-DESIGN-SYSTEM.md`, tokens `--gc-*` (`src/lib/crystal-tokens.ts`, `src/components/crystal/crystal.css`,
AA-tested), components `src/components/crystal/` (CrystalCard/Button/Chip/Badge/Sheet/LaserBorder/StatusDot). It replaces the
older Menu V5 boards and member palette as the visual target; behaviour, data and ordering rules stay (self-order kept).
Skill `garage-menu-v5` still applies for menu data rules (no fake options/badges, real photos, Daftar Pilihan wording).
Animation skills (owner, Nov 2026: customer surfaces = cinematic, operational screens = fast and restrained):
`animate`, `emil-design-eng`, `review-animations`, `improve-animations`, `animation-vocabulary` (Emil Kowalski, craft rules);
`motion-design` (LottieFiles, choreography/timing tables); `micro-interaction`, `page-transition-animation`,
`60fps-animation`, `accessible-animation`, `svg-animation`, `lottie-animation` (iart-ai); `gsap-core`, `gsap-timeline`,
`gsap-scrolltrigger`, `gsap-react`, `gsap-performance`, `gsap-plugins`, `gsap-utils` (official GreenSock).
Use `framer-motion` (installed) and CSS first. GSAP (`gsap@3.15.0`, pinned) was added with owner approval (Nov 2026) for the
website Cinematic Laser UI (`src/components/garage-website/cinematic/`: hero, laser border, ScrollTrigger progress, site
SFX default OFF in `site-sfx.ts`); Lottie is still NOT a dependency: ask the owner before adding it.
Skipped on purpose: glassmorphism (heavy blur conflicts with the motion policy) and auto-invoking AI image-generation
skills. Licenses: `.claude/skills/_licenses/`.
Image generation (owner, Nov 2026): MCP `mcp-image` (pinned 0.18.2, template `.claude/mcp-ui.example.json`) needs
`GEMINI_API_KEY` from the environment/secrets, never in a file or chat. Use it ONLY when the owner asks for an image
(it spends API quota; never auto-generate). Output goes to `docs/design-handoff/assets-incoming/generated/`, then follow
`docs/design-handoff/README.md` (no text/prices/logos inside images, logo and AYA only from official assets).

MCP servers (free, no API key; config template `.claude/mcp-ui.example.json`, copy to `.mcp.json` which is gitignored
because it can hold secrets; versions pinned):
- `shadcn`: before writing a new UI component, search the shadcn registry (`search_items_in_registries`,
  `view_items_in_registries`) and prefer adding/adapting an existing one. Style is `radix-nova` in `components.json`.
- `context7`: before using Next.js, Tailwind v4, shadcn/Radix, Drizzle or Better Auth APIs, look up current docs
  (`resolve-library-id` then `query-docs`) instead of relying on memory.
- `playwright`: visual QA after UI changes. Screenshot desktop 1366x900 and mobile 390x844, check console errors,
  horizontal overflow, clipped money/status text. Take screenshots, read them, fix, repeat.
- `chrome-devtools`: debugging only (layout, CSS, network, Lighthouse a11y/perf) when Playwright shows a problem.
  Do not run both browsers on the same task without reason.

Theme workflow: pick the theme/direction from the brief and the Garage system first (or propose it and state any
deviation before building), then use `shadcn` for parts, `context7` for API accuracy, `playwright` to verify.
In a cloud session the preinstalled Chromium is at `/opt/pw-browsers/chromium` (pass `--executable-path` plus
`--no-sandbox` if the default browser is not found). Never put tokens in `.claude/mcp-ui.example.json`.

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

## GARAGE COFFEE — IMMUTABLE UI DESIGN CONTRACT

**Scope.** Member (customer) UI: `/member-login` and future member screens. Staff/ops UI keeps `design-system/MASTER.md`.

**Crystal V5 override (owner, 8 Nov 2026).** The palette/typography in the documents below is superseded by Garage Crystal V5
(`docs/crystal-v5/01-DESIGN-SYSTEM.md`, `--gc-*` tokens, Montserrat display + Inter body). All other rules here (official logo,
no automotive imagery, real member data, reduced motion, no fake OAuth/OTP, responsive QA) still apply. Google sign-in is
allowed once `MEMBER_GOOGLE_CLIENT_ID`/`_SECRET` (fallback: the existing `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`) are configured on
the server (button hidden otherwise): code + PKCE,
server-verified ID token (`src/lib/member-google-oauth.ts`), link by `google_sub` then Google-verified email (no duplicates),
new accounts complete name + WhatsApp + S&K, marketing consent separate & default off (migration 0184, `docs/crystal-v5/02-GOOGLE-LOGIN.md`).
An existing phone account is linked only after its PIN (`completeGoogleMember`, pin-guard); Google-only accounts may set a first PIN
without the old one while `member_accounts.pin_set_at` is null (migration 0185).
**Member V6 (owner, 9 Nov 2026).** `/member-login` follows `docs/design-references/member-v6/` (`docs/crystal-v5/03-MEMBER-V6.md`):
real Three.js cards (`member-auth/cinematic3d/`, lazy, adaptive quality, CSS fallback without WebGL, no chip/NFC), showcase left +
glass panel right (`member-v6.css`), intro once per session, register needs S&K (`acceptTerms` → `terms_accepted_at`), success
screen shows the tier returned by the backend. `MemberLoginCard`/`BrandExperiencePanel`/`CinematicBackground` are no longer used by the page.

**Sources of truth.** Before you touch member UI, read all three:
- `docs/GARAGE_MEMBER_DESIGN_SYSTEM.md`
- `docs/GARAGE_MEMBER_MOTION_SPEC.md`
- the approved screenshots in `docs/design-references/member-login/` (`desktop`, `tablet` and `mobile.webp`)

**Implementation.**
- Components: `src/components/garage/member-auth/`.
- Tokens and primitives: `member-auth.css`, using `gm-*` classes scoped to `.gm-root`.

**Rules.**
1. Always read the approved design-system document before modifying member UI.
2. Always inspect the approved screenshots before changing visual components.
3. Never change the approved brand colors, typography (Space Grotesk headings, Inter body) or visual hierarchy without owner authorization.
4. Never redesign the Garage Coffee logo. Use `GarageBrandLogo` (official PNG, `object-contain`).
5. Never replace the visual style with a generic template.
6. Always reuse the shared components (`MemberField`, `MemberButton`, `MemberLoginCard`, `AuthenticationStatus`, `MotionReveal`, `CinematicBackground`) and the `--gm-*` tokens. Do not hand-roll duplicate styles.
7. Always keep desktop (split ≥1024), tablet (centered) and mobile (form first) consistent.
8. Never introduce an unrelated visual identity. No automotive or motorcycle imagery in member UI.
9. Never sacrifice usability for motion. The UI must work fully with `prefers-reduced-motion`.
10. Always run responsive visual QA after member UI changes: 1440×900, 1920, 1366, 1024×768, 768×1024, 390×844 and 360. Check for no horizontal overflow, clipping or overlap.
11. Never modify unrelated Garage OS modules as part of member UI work.
12. Preserve member authentication: phone/email + PIN via `/api/member/auth/*` with JWT cookies, plus the `next`, `mode=register`, `ref`, `name` and `phone` URL params. Never expose credentials.
13. Never invent unavailable member data or features. No fake OAuth/OTP buttons: Google/OTP appear only once a real provider is configured.
14. State any proposed deviation from the approved design before implementing it.

15. Member card = `PremiumMembershipCard` (`src/components/garage/premium-membership-card.tsx` + `.css`). Card data for the screen, PNG/JPG (`membership-card-image.ts`) and PDF (`membership-card-pdf.ts`) comes only from `src/lib/membership-card-model.ts`:
    - the real member code (never zero-padded);
    - "Berlaku s/d" from `expiresAt`, never from the member-since date;
    - perks and multiplier from `memberLevelRules`;
    - a real QR `{v:1,id,tier,n}`, dark on a white plate;
    - no bank-card props (CVV, signature, magstripe, fake barcode) and no fake address or phone placeholders.

Design consistency is a mandatory acceptance criterion for every member UI change.
