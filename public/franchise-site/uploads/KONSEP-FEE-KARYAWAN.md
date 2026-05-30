# Konsep Fee Karyawan — Kantong Karyawan dengan Lock 5 Bulan

> Status: **DESIGN APPROVED, BELUM CODED**
> Tanggal: 22 Mei 2026

## Konsep Inti

Setiap staff punya **"Kantong Karyawan"** (wallet) di sistem. Setiap event operasional (order paid, ticket ready, ticket delivered) menambah saldo di kantong. Saldo **terkunci selama 5 bulan** dari tanggal masing-masing earning. Setelah lewat 5 bulan, staff bisa request tarik. Mekanisme ini berfungsi sebagai:
- Retention bonus (kurangi turnover staff)
- Cashflow buffer untuk owner
- Performance-based reward yang fair (per event tracked)

## Rules Final

| Aspek | Decision |
|---|---|
| **Model fee** | Flat per event (ticket ready, order paid, ticket delivered) |
| **Trigger events** | `ticket_ready` (Koki/Barista), `order_paid` (Kasir), `ticket_delivered` (Waiter), `tip` (fitur baru) |
| **Lock period** | **5 bulan exact per individual earning** — setiap row punya `availableAt = createdAt + 5 months` |
| **Payout cycle** | On-demand setelah lock berakhir (staff request kapan saja) |
| **Workflow approve** | Manager approve → Finance mark paid |
| **Resign policy** | **Tetap dibayar penuh** — no forfeit. Lebih aman secara hukum + ethical |
| **Base wage** | Belum dibahas, di-handle terpisah di future module Payroll |

## Tip Handling

Tip dari customer di POS checkout ada 2 mode:

**Mode 1 — Pool (default):**
Tip dibagi proporsional ke semua staff on-shift:
- Barista: 15%
- Koki: 15%
- Waiter: 20%
- Kasir: 10%
- Manager: 10%
- Sisanya (30%) untuk staff lain on-shift, dibagi rata

**Mode 2 — Direct:**
Tip ditujukan ke 1 staff spesifik (misal waiter yang antar).

Tip JUGA kena lock 5 bulan (konsisten dengan fee biasa).

## Rate Default (Configurable)

| Role | Event | Unit Fee |
|---|---|---|
| Kasir | `order_paid` | Rp 200 |
| Barista | `ticket_ready_drink` | Rp 500 |
| Koki | `ticket_ready_food` | Rp 1.000 |
| Asisten Koki | `ticket_ready_food` | Rp 500 |
| Waiter 1 / 2 | `ticket_delivered` | Rp 300 |
| Supervisor Shift | `order_paid` | Rp 100 |

Tabel baru `staff_fee_rates` — Owner bisa edit lewat UI.

## State Lifecycle

```
[EVENT terjadi (waiter antar, dll)]
   ↓
[AUTO] insert ke staff_earnings
   status: "accrued"
   availableAt: NOW() + 5 months
   ↓
[5 bulan berlalu — server auto compute availability]
   status: "available" (derived dari availableAt <= NOW())
   ↓
[STAFF klik "Request Tarik"]
   create withdrawal_request row
   ↓
[MANAGER review]
   approve → status: "approved"
   ↓
[FINANCE transfer]
   mark paid + input bukti ref
   status: "paid"
```

## Database Schema Changes

### Existing yang dipertahankan
- `staff_earnings` — sudah ada, perfect
- `staff_earning_payouts` — sudah ada untuk bundling

### Yang perlu ditambah

```sql
-- 1. Kolom baru di staff_earnings
ALTER TABLE staff_earnings ADD COLUMN available_at timestamp with time zone;

-- Backfill: untuk earnings existing, set availableAt = createdAt + 5 months
UPDATE staff_earnings SET available_at = created_at + INTERVAL '5 months'
WHERE available_at IS NULL;

-- Index untuk query saldo available cepat
CREATE INDEX staff_earnings_available_idx ON staff_earnings(staff_user_id, status, available_at);

-- 2. Tabel rate config
CREATE TABLE staff_fee_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  event text NOT NULL,
  unit_fee integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
  UNIQUE(role, event)
);

-- 3. Tabel withdrawal requests
CREATE TABLE staff_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id text NOT NULL REFERENCES "user"(id),
  amount integer NOT NULL,
  earning_ids jsonb NOT NULL,  -- array of staff_earnings.id
  status text NOT NULL DEFAULT 'requested', -- requested | approved | paid | rejected
  requested_at timestamp with time zone NOT NULL DEFAULT NOW(),
  approved_at timestamp with time zone,
  approved_by text REFERENCES "user"(id),
  paid_at timestamp with time zone,
  paid_by text REFERENCES "user"(id),
  payment_ref text,
  notes text
);

-- 4. (Opsional) Tabel tips
CREATE TABLE tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  amount integer NOT NULL,
  mode text NOT NULL, -- 'pool' | 'direct'
  direct_staff_user_id text REFERENCES "user"(id),
  distributed_at timestamp with time zone NOT NULL DEFAULT NOW()
);
```

## API Endpoints Baru

```
GET  /api/earnings/wallet                    -- saldo karyawan (available/locked/today)
POST /api/earnings/withdraw                  -- request tarik
GET  /api/earnings/withdrawals               -- list withdrawals (filter by status)
PATCH /api/earnings/withdrawals/[id]         -- approve / reject (manager)
POST /api/earnings/withdrawals/[id]/pay      -- mark paid (finance)
GET  /api/earnings/rates                     -- list rate config
PATCH /api/earnings/rates/[id]               -- update rate (owner)
POST /api/orders/tip                         -- add tip to existing order
```

## UI Mockups

### 1. Staff Personal — "Kantong Karyawan"

```
┌─ KANTONG KARYAWAN · Dita / Kasir ──────────┐
│                                             │
│ ┌─ BISA DITARIK ──────────────────────────┐│
│ │ Rp 845.000                               ││
│ │ [💰 Request Tarik]                       ││
│ └──────────────────────────────────────────┘│
│                                             │
│ ┌─ TER-LOCK (5 bulan) ────────────────────┐│
│ │ Rp 2.340.000                             ││
│ │ ─────────────────────────────────────── ││
│ │ Earn 15-21 Mei (Rp 280K)  ⏳ buka 21 Okt││
│ │ Earn 1-14 Mei  (Rp 620K)  ⏳ buka 14 Okt││
│ │ ... [Lihat semua]                       ││
│ └──────────────────────────────────────────┘│
│                                             │
│ ┌─ EARNED HARI INI ───────────────────────┐│
│ │ Rp 24.600 · 123 order paid               ││
│ │ Bisa ditarik mulai 22 Okt 2026           ││
│ └──────────────────────────────────────────┘│
│                                             │
│ ┌─ RIWAYAT TARIK ─────────────────────────┐│
│ │ 15 Nov  Rp 680K   ✅ paid · BCA-...     ││
│ │ 1 Jul   Rp 520K   ✅ paid · BCA-...     ││
│ └──────────────────────────────────────────┘│
└────────────────────────────────────────────┘
```

### 2. Manager — "Withdrawal Approvals"

```
┌─ Withdrawal Requests ───────────────────────┐
│ 3 pending · Total Rp 2.4jt                   │
│ [Approve All] [Export]                       │
│                                              │
│ Dita    Kasir    Rp 845K  22 Mei  [Apv][Rej]│
│ Reza    Barista  Rp 1.2jt 22 Mei  [Apv][Rej]│
│ Hendra  Koki     Rp 380K  21 Mei  [Apv][Rej]│
└─────────────────────────────────────────────┘
```

### 3. Finance — Payout List (di Finance tab)

```
┌─ Withdrawal Payouts ────────────────────────┐
│ 3 approved · Total Rp 2.4jt to transfer      │
│ [📊 Export Excel] [🖨 Cetak Bukti]          │
│                                              │
│ Dita    Rp 845K   BCA-1234  [Mark Paid]     │
│ Reza    Rp 1.2jt  DANA-...  [Mark Paid]     │
│ Hendra  Rp 380K   GOPAY-... [Mark Paid]     │
└─────────────────────────────────────────────┘
```

### 4. Owner Dashboard KPI

```
┌─ Fee Liability ─────────────────────────────┐
│ Total locked         Rp 28.5jt               │
│ Available unclaimed  Rp 4.2jt                │
│ Pending request      Rp 2.4jt                │
│ Paid this month      Rp 12.8jt               │
└─────────────────────────────────────────────┘
```

## Phase Implementasi

### Phase 1 — Kantong Karyawan View (2-3 jam)
- Migration: add `available_at` ke `staff_earnings` + backfill
- Service: compute available/locked dari `availableAt vs NOW()`
- API: `GET /api/earnings/wallet`
- Frontend: rewrite EarningsView jadi "Kantong Karyawan" dengan available/locked split

### Phase 2 — Withdrawal Flow (3-4 jam)
- Migration: `staff_withdrawal_requests`
- API: POST withdraw, GET withdrawals, PATCH approve, POST pay
- Frontend Staff: tombol "Request Tarik" → input nominal/all → submit
- Frontend Manager: tab "Withdrawal Approvals" — list + approve
- Frontend Finance: tab "Payouts" di Finance module

### Phase 3 — Rate Config UI (1-2 jam)
- Migration: `staff_fee_rates` + seed default
- API: GET/PATCH rates
- Frontend Owner: tab "Fee Rates" di settings

### Phase 4 — Tip Handling (2-3 jam)
- Migration: `tips`
- POS: tombol "💰 Tambah Tip" di checkout
- Backend: distribute tip ke pool atau direct → create staff_earnings rows
- Settings: outlet pilih mode pool vs direct

### Phase 5 — Polish & Notifications (1-2 jam)
- Owner dashboard: tambah Fee Liability KPI
- Audit log: log withdrawal events
- WA notify staff saat payout cair
- Withdrawal limit per request (cegah fraud accidental)

## Edge Cases & Notes

| Skenario | Handling |
|---|---|
| Order rejected setelah accrued | Reverse earning (`status: reversed`) — sudah ada di `reverseEarningsForOrder` |
| Staff resign | **Dapat semua** — `availableAt` di-fast-forward ke hari ini → staff bisa request tarik final |
| Partial withdraw | Staff pilih nominal, sistem allocate dari earning paling lama dulu (FIFO) |
| Manager tolak withdraw | Staff bisa request ulang setelah revisi |
| Earnings ada di multiple cycles | Tampilkan grouped by due-month di lock view |
| Rate diubah owner | Apply hanya untuk earning baru, tidak retroactive |

## Catatan Implementasi

⚠️ **Sebelum implement Phase 1+, pastikan dulu:**
1. Owner setuju lock 5 bulan secara legal/etika (komunikasi ke staff tertulis)
2. Backup database (migration `available_at` backfill akan touch existing rows)
3. Test edge case: staff lama dengan earning < 5 bulan ago (apa langsung available atau pakai lock?)

## Decision Pending

- **Base wage** — apakah ada gaji pokok harian/bulanan terpisah? (User mau bahas terpisah)
- **Tip lock** — apakah tip juga di-lock 5 bulan atau cair langsung? (Default: ikut locked sesuai konsistensi)
- **Resign workflow** — apakah ada exit interview / final check sebelum unlock? (Default: instant unlock saat resign confirmed)
