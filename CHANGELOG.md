# Garage Coffee & Motor OS — Changelog

## [Unreleased] - 2026-05-22

Full operational loop upgrade: POS, CRM, KDS, Finance, Approvals, Audit.
18 major features added across 1 development session.

### POS & Checkout

- **Cash payment panel** — Big clear "Uang Pas" button, large change display, Indonesian thousands separator while typing, prominent Rp prefix
- **Item notes per cart line** — "+ Tambah catatan" → input "less ice" / "no garlic" / "extra spicy" → flows to kitchen ticket as `itemNotes`
- **Hold/Park Order** — Snapshot cart + table + customer + voucher to `localStorage` (key: `garage:pos:parked-orders`). Resume restores full state. Max 20 parked bills
- **Split Bill calculator** — Display-only utility: 2-20 orang, auto-round ke Rp 1.000, show exact + rounded versions
- **Add Order to occupied table** — `TableSessionInfoCard` replaces generic warning. Shows previous order info (orderNo, customer, total, durasi). Cart header gets `ADD-ON SESSION` badge

### Thermal Printer

- **Win32 raw spool API** (`winspool.drv` P/Invoke via PowerShell) — bypass GDI `Out-Printer` which fails on Generic/Text drivers like RPP02N
- **Friendly error UI** — replaces giant PowerShell error dump with: title + hint + numbered action checklist + collapsible "Detail teknis (untuk IT)"
- **32-char thermal layout** — center alignment, dynamic name+price columns, dynamic spaces, full bill structure spec

### Customer Journey

- **Customer invoice live tracking** (`/invoice/[token]`) — 8-second polling via new endpoint `/api/invoice/[token]/live-status`
- **Countdown timer** during cooking phase — `mm:ss` with progress bar, over-time shows `+02:15` red
- **Per-station breakdown** — Dapur / Bar / Waiter status chips
- **Auto-stop polling** when status terminal (delivered/completed/rejected)
- **WhatsApp invoice button** — Auto-template with pre-filled customer phone, fallback to wa.me contact picker
- **Compact 1-page PDF invoice** — fits all info on single page for printer-friendly delivery

### Finance Invoice Tab

- **Tab in Finance module** (alongside Overview Keuangan)
- **List with filter** — search by invoice no / customer / phone / table, status filter, date range
- **Detail modal** — full info + WhatsApp resend + copy invoice link + open in new tab
- **Pagination** — 20/page, server-side count

### CRM Upgrade (Tier 1 + 2)

- **Customer list** with search, tier filter, sort (recent/spend/visits/points/name)
- **Detail modal** — stats (total spend, paid orders, AOV, last visit), favorite items top 5, order history (20 latest with invoice link)
- **Profile fields** — `staffNote` (preferences), `birthday`, `referralCode`, `referredByCode`
- **Voucher generation** — percent only (5%-50% bounded by `MIN/MAX_PERCENT_VOUCHER`), auto-code `GIFT-NAME-XXXX`
- **8 Smart Segments** computed on-the-fly:
  - VIP (spend >500K/bulan atau tier Gold+)
  - At-Risk (repeat 3+ visit, hilang >30 hari)
  - New Customer (visit pertama ≤7 hari)
  - Voucher Ready (poin cukup redeem)
  - Birthday Week (ulang tahun dalam 7 hari)
  - Stamp Mission (dekat reward kunjungan 10x)
  - VIP Exclusive (Gold/Platinum)
  - Referral Ready (sudah punya kode referral)
- **Bulk WA** — open first tab + copy rest to clipboard (avoid popup blocker)

### Approvals Upgrade

- **Filter tabs** — Pending / Approved / Rejected / All with badge count
- **Stats bar** — pending, high-risk pending, avg decide time, decided today (with approved/rejected breakdown)
- **Pending breakdown chips** — by type
- **Filters** — risk level (high/medium/low), type (auto-populate), search across requester/action/object
- **Group by type** toggle (collapsible per type)
- **Detail modal** — full info, audit trail (`decidedByName`, `decidedAt`, `reasonDecided`)
- **Required reject reason** (min 5 char) with template chips
- **Optional approve reason** with template chips
- **Bulk approve/reject** with single reason for all
- **WA notify requester** auto-open after decide (bulk: first tab + clipboard for rest)

### Audit Log Viewer

- **Filter** — status (recorded/warning/critical/blocked/etc), date range, actor, full-text search
- **Stats bar** — events today, critical today, warnings today, total events
- **Top actor / top module chips** — click to filter
- **Detail modal** with metadata JSON viewer (pretty-printed)
- **Auto-poll 15s** — new events show up automatically
- **Pagination** 30/page

### Inventory Detail

- **Status filter** — Low / Watch / Safe / All
- **Clickable row** → detail modal
- **Stock-on-hand visual** — progress bar with status color
- **Adjust stock form** — input new onHand + audit note (wajib min 3 char), delta preview
- **Movement history per item** — full audit with actor + timestamp + qty + type badge (stock_in/stock_out)

### KDS Polish

- **Sound alert** — new order (two-tone chime) + late ticket (alert tone)
- **Toggle Sound ON/OFF** persisted to `localStorage` (`garage:kds:sound`)
- **Smart detection** — snapshot previous IDs, only alert on delta (no re-alert for old tickets)
- **Pulse animation** for late tickets (`garage-kds-late` / `garage-kds-list-danger` classes)
- **ADD-ON badge #N** for orders 2+ at same table session (computed by service from `tableLabel` + unique `orderId`)

### Dashboard Owner Snapshot

- **Live KPI panel** at top of Dashboard (role-gated: Owner/Admin/Manager/Finance)
- **Smart alerts** — auto-detected from finance/approvals/audit/inventory/orders
- **4 KPI cards** — Revenue today, Net profit, Pending approval, Audit events
- **Payment mix bar** — cash vs non-cash with percentage
- **Stock watch** — top 3 low/watch items
- **Recent orders strip** — 6 latest
- **Quick links** — Finance / Approvals / Kitchen / Audit
- **Auto-refresh 30s**
- **Resilient** — Promise.allSettled, kalau 1 endpoint fail yang lain tetap render

### Schema Changes

All migrations idempotent (`IF NOT EXISTS` guard via `DO $$ ... END $$`):

- `customers`:
  - `staff_note text` (preferences notes)
  - `birthday text` (YYYY-MM-DD format)
  - `referral_code text` (unique index)
  - `referred_by_code text`
- `approvals`:
  - `requester_phone text` (untuk WA notify)
  - `decided_by_name text` (audit display)
  - `reason_decided text` (audit trail)

Migration files:
- `drizzle/0020_lovely_moon_knight.sql` — staff_note (rewritten to idempotent after cruft removal)
- `drizzle/0021_crm_membership_growth.sql` — birthday + referral_code
- `drizzle/0023_approvals_audit.sql` — approvals audit fields

### New API Endpoints

- `GET /api/finance/invoices` — list with filter + pagination
- `GET /api/invoice/[token]/live-status` — polling 1KB payload
- `GET /api/crm/customers` — list with filter + sort + pagination
- `GET /api/crm/customers/[id]` — detail with orders + favorites
- `PATCH /api/crm/customers/[id]` — update staffNote / birthday / referralCode
- `POST /api/crm/customers/[id]/voucher` — issue personal percent voucher
- `GET /api/crm/segments` — 8 smart segments computed on-the-fly
- `GET /api/approvals/stats` — pending/highRisk/decidedToday/avgTime
- `POST /api/approvals/bulk` — bulk decide with shared reason
- `GET /api/audit/stats` — events today + top actor/module
- `GET /api/inventory/[sku]` — detail + movement history

### Permissions

- New: `crm:write` (assigned to Owner / Admin / Manager Operasional)

### Frontend Components (New Files)

- `src/components/garage/finance-invoice-list.tsx`
- `src/components/garage/crm-customer-list.tsx`
- `src/components/garage/crm-segments.tsx`
- `src/components/garage/approvals-board.tsx`
- `src/components/garage/audit-log-viewer.tsx`
- `src/components/garage/dashboard-owner-snapshot.tsx`
- `src/app/invoice/[token]/invoice-live-tracker.tsx`

### Pattern Consistency

All upgraded modules now follow same pattern:
- List with search + filter + sort
- Modal-based detail (no new Next.js routes/pages)
- Stats bar at top where relevant
- WA integration where customer/staff communication needed
- Pagination + auto-poll where data is live
- Idempotent migrations with `IF NOT EXISTS` guards

### Migration Caught Bugs

- `getAuditData` signature changed (`AuditLog[]` → `{rows, total, hasMore}`) → fixed 2 consumers in `company-control.ts` and `garage-ai-context.ts`

### Verification

Build clean, lint clean, all migrations applied, seed runs successfully.

---

## Quick Reference

### Seed Credentials
- Email format: `{role}@garage.local`
- Password: `garage12345`
- Member password: `member12345`
- POS Terminal: `GARAGE-POS-01`
- POS API key: `garage-pos-dev-key`

### Dev URLs
- Local: `http://localhost:3001`
- LAN: `http://192.168.110.54:3001`

### Key Roles for Testing
- `owner@garage.local` — full access, sees Owner Snapshot
- `kasir@garage.local` — POS access
- `finance@garage.local` — Finance + Invoice tab
- `manager@garage.local` — most modules including CRM write
- `koki@garage.local` — KDS (Food station locked)
- `barista@garage.local` — KDS (Bar station locked)
- `gudang@garage.local` — Inventory

### LocalStorage Keys
- `garage:pos:parked-orders` — Park/Hold orders
- `garage:kds:sound` — KDS sound toggle preference
