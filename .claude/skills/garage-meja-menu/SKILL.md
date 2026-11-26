---
name: garage-meja-menu
description: Aturan WAJIB meja (nomor, status, warna, hold, join code, pindah meja) dan mode menu digital (self_order / waiter_list, Menu V5). Muat sebelum mengubah meja, QR meja, /order, atau alur dine-in.
---

# garage-meja-menu

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

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
  in tx). Occupied tables: setting `tableJoinCodeRequired` (default OFF, owner Nov 2026) — OFF = anyone scanning the table QR
  may add orders to that table's bill (`assertTableClaimable` returns "join"; picker shows a confirm sheet; cashier still accepts
  every order); ON = 4-digit `join_code` (cleared when emptied), except a re-order whose WhatsApp number
  (`normalizePhone`) matches a live bill at that table (`lockTableSession().liveBillPhones`; picker "Saya sudah pesan di meja
  ini", hold route rate-limited per IP). Cleaning/reserved/held-by-other still win; a sent code must still be correct.
  `/api/customer/orders` sets `enforceTableClaim`; staff orders don't.
- Digital menu mode (Menu V5, owner 4 Nov 2026) = setting `digitalMenuMode` per outlet (`src/lib/digital-menu-mode.ts`):
  `self_order` (default, flow above) or `waiter_list` (customer builds a Daftar Pilihan → "Tunjukkan ke Waiter" QR =
  `/order?table=NN&mode=waiter&daftar=<base64url ids/qty/notes, no prices>`; waiter's Pesankan opens prefilled, validated
  against the current menu). `/api/customer/orders` returns 403 `DIGITAL_MENU_VIEW_ONLY` in `waiter_list`; delivery is off and
  no table hold is needed in that mode. Staff orders are unaffected. Daftar Pilihan is kept in sessionStorage per outlet & table.
- Menu V5 customer extras (5 Nov 2026): table pick in `waiter_list` = info only (`table-info-v5.tsx`, GET only, never holds/occupies);
  Signature = product tag "Signature", Unggulan = `featured` (never the same badge); AYA 3D = lazy `three` (`aya-stage-3d.tsx`, official
  V5 layers, 2D fallback); AYA chat stays rule-based (no AI key in frontend). Details: skill `garage-menu-v5`.

- Tanpa voucher & tanpa Promo QR (Owner 25 Nov 2026): `/order` tidak punya tombol "Kode promo"/isian voucher dan tidak ada
  banner "Welcome QR"; diskon otomatis Promo QR = 0 (`qrPromoDiscount`, `voucher-policy.ts`). Poin member tetap bisa dipakai.
