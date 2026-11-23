---
name: garage-kas
description: Aturan WAJIB uang/kas Garage OS: shift & laci, Kas Keluar/Masuk, buku kas tunggal (cash_ledger_entries), petty cash, closing & setoran, final Owner, risk B6, laporan Owner B7, Finance profit, Sponsor Event. Muat sebelum menyentuh apa pun yang memindahkan atau melaporkan uang.
---

# garage-kas

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

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

- Sponsor Event (owner 16 Nov 2026, migration 0194, `docs/sponsor-event/01-IMPLEMENTASI.md`): Owner only (logged in; Manajer and
  agent keys refused in `assertOwnerHuman`), UI `/control/sponsors`, API `/api/sponsors/**`. Sponsor money ALWAYS lands in
  Rekening Jago: each payment = one `sponsor_income` ledger row external → bank_jago in the same tx (`recordSponsorPayment`,
  idempotency key, bank reference unique while posted); void = `sponsor_income_void` reversal row, never an edit/delete.
  P&L: `otherIncome` (from the ledger by business date) adds to net profit, never to net sales (ENGINE_VERSION 6). In-kind
  sponsorship is a note only (no ledger, no P&L). Installments are allocated earliest-due-first (pure `event-sponsor-rules.ts`);
  reminders via `sweepSponsorReminders` (H-3, due day, late day 1/3/7 then weekly; neutral wording). The GIGS platform
  (separate stack, `/event`) is not changed by this module. Public branding (logo, https link, `show_on_website` default
  false) is display-only, never money/contact — see skill `garage-event-lineup` (migration 0201).
- Biaya Event (GIGS EO Fase 2, owner 17 Nov 2026, migration 0198): event costs are paid from bank_jago/bank_bni (one
  `event_expense` ledger row bank → external in the same tx) or `external` (Owner personal money, no ledger row). Void =
  `event_expense_void` reversal. P&L reads `event_expense_payments` (paid date +, void date −) as category `Biaya Event`
  (`non_operating`, ENGINE_VERSION 7) — never omzet. Details: skill `garage-event-lineup`.

## Finance Rules

- Profit bersih = omzet bersih − belanja bahan (penerimaan gudang, cash lunas) − biaya tetap harian − biaya lain
  (`cogsBasis: "purchase"`, lihat `docs/KONSEP-KEUANGAN.md`). Penerimaan gudang mencatat `expenses` lunas per area
  via `recordCashPurchases` (`src/lib/finance-purchases.ts`, `sourceDoc` idempoten) — tidak membuat hutang supplier.
  Hanya expense ber-`sourceDoc` yang jadi biaya bahan; expense/pelunasan kategori belanja lain = cash-out saja.
- Target profit bersih/bulan (`netProfitTargetMonthly`) = patokan balik modal (`computeCapitalTarget`).
- HPP Mitra (audit Owner 23 Nov 2026, ENGINE_VERSION 8): biaya setoran mitra yang disetujui (expense `sourceDoc` `PSET:…`,
  `approvePartnerSettlement`) = biaya bahan SEKALI. `loadDayRaws` memisahkannya ke `DayRaw.partnerCost` (tidak masuk
  `expenses` per kategori, `purchases`, maupun stok awal `loadOpeningStockPurchases`) → `DayFigure.cogsPartner`, ditambahkan ke
  `cogs` di mode purchase DAN recipe; arus kas tetap (grup `cogs_purchase`). Dulu terhitung dua kali (opex + belanja). Baris
  laporan "Setoran mitra (HPP mitra)". Tanggal biaya = 12.00 WIB hari penjualan (`periodFrom` + 12 jam). Hari yang sudah
  dikunci (snapshot `locked`) tidak dihitung ulang.
