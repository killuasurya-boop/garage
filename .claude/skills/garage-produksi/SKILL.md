---
name: garage-produksi
description: Aturan WAJIB Production Hub V4/V7 (Bar/Dapur), tiket SELESAI, dan Smart Notification V2. Muat sebelum mengubah layar produksi, kitchen ticket, print job, atau notifikasi staf.
---

# garage-produksi

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

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
- Production V7 (owner, 12 Nov 2026, migration 0193, `docs/production-v7/01-IMPLEMENTASI.md`): the hub is a 3-column board
  MENUNGGU | DIPROSES | SIAP, scrollable, NO pagination/filter that hides active tickets. Pure rules `src/lib/production-v7.ts`
  (`fifoSort` = server `createdAt` → `ticketNo`, `boardColumns` drops nothing, `productionIndicators` = fact/calculation/suggestion
  from real board data only, `syncHealth`, `batchFifoAhead`). SLA never reorders the queue. Manual priority = `setFifoOverride`
  (Owner/Manajer, reason, audit; `kitchen_tickets.fifo_override_*`) via the existing ticket endpoint (`prioritize`/`unprioritize`).
  `getProductionBoard` never hides a ticket by age (READY stays until staff closes it; oldest first, limit 600 + `truncated` warning).
  Tapping a card (`.phv7-cover`) only opens the detail drawer — production status changes only through explicit action buttons
  (`actionLockText` shared by card and drawer). Offline/failed sync = banner + stale label, cards stay, actions refused (no offline
  queue). No infinite animations in `.phv4`/`.phv7-*` (`production-v7-tokens.test.ts` also guards AA contrast).
- Smart Notification V2 (Nov 2026, `docs/notifications/`, migration 0183): staff feed = `notifyStaff` only; audience `bar`/`dapur`
  for single-station work (`production` = both). Resolve with `resolveStaffNotifications` after the domain mutation succeeds
  (resolved = no toast/repeat/action). Client sound = once per device via `claimSound` (`sound-claim.ts`; pass a `dedupKey` to
  `voice.announce`). Hub sound rules are pure in `hub-sound-rules.ts` (device station only; "pesanan siap" only when the whole
  order is ready). Payment text in notifications via `paymentNoticeLabel` (QRIS never reads as paid). Logout releases push.
  Shift-close check panel = `shift-close-check.ts` (pure) + `GET /api/finance/cash-sessions/[id]/close-check`: info only, never blocks
  closing, never sends cash/expected cash to a Kasir while the shift is open.
