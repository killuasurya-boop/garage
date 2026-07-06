# PAYROLL V2 — Design Doc

**Status:** DRAFT for Fase 0
**Branch:** `feat/payroll-v2-attendance-wallet`
**Feature flag:** `PAYROLL_V2_ENABLED` (default `false`)
**Owner sign-off:** pending

## 1. Ringkasan

Sistem HR terintegrasi Garage OS:
- Absensi PIN + Selfie + GPS (metode fleksibel per role, di-atur owner).
- **Wallet Gaji** (upah harian + lembur + bonus kehadiran) — tabel baru `staffDailyWages`.
- **Wallet Fee** (Rp 200 × produk terjual → pool bersama → split proporsional jam) — reuse `staffEarnings` dgn `walletType='fee'`.
- Manajer/Owner tidak dapat fee pool.
- Zero hardcode: semua aturan lewat `payrollSettings` (key-value JSON).
- Cron 23:59 idempoten (systemd timer di VPS, manual trigger di dev).
- Payout approved → auto-catat `expenses` + `auditLogs`.

## 2. Aturan Bisnis (dikunci)

1. Wallet Gaji credit HANYA jika `checkin_valid && checkout_valid && checkout_at >= jam_keluar_minimum`.
2. Wallet Fee credit HANYA staff valid + role bukan manajer + jam kerja ≥ min (default 1 jam).
3. Fee = `feePerProduct` × produk terjual (exclude promo). Default `feePerProduct=200`.
4. Split: `bagian_i = (jam_i / Σ jam_valid) × pool_harian`.
5. Semua absent → `poolFallback ∈ {'hangus','kas'}` (owner pilih).
6. Cron idempoten via unique `(date)` di `feePoolDaily.finalizedAt`.
7. Bracket telat default: ≤15m 100% · 15–60m 75% · 60–120m 50% · >120m 0%.
8. Semua nilai di atas bisa di-override di `payrollSettings`.

## 3. Role Matrix (fitur wajib)

| Role | Absen | Wallet Gaji | Wallet Fee | Kelola |
|---|---|---|---|---|
| Barista, Koki, Asisten Koki, Kitchen/Barista | ✅ PIN+Selfie+GPS | ✅ | ✅ | — |
| Kasir | ✅ PIN (tablet) | ✅ | ✅ | — |
| Waiter 1/2, Delivery Admin | ✅ PIN+Selfie+GPS (multi) | ✅ | ✅ | — |
| Gudang | ✅ | ✅ | ✅ | — |
| Supervisor Shift, Manager Operasional | ✅ | ✅ (gaji tetap) | ❌ | Tim |
| Owner/CEO, Admin, Finance/CFO | ❌ | ❌ | ❌ | Full |

Manajer/Owner **dikunci di kode** via `MANAGER_ROLES` set.

## 4. Schema Ringkas

**Baru:**
- `payrollSettings(key text PK, value jsonb, updatedBy, updatedAt)`
- `staffWageConfig(staffUserId PK, dailyWage int, overtimeHourly int, notes, updatedAt)`
- `staffAttendanceV2(id PK, staffUserId, date, checkinAt, checkoutAt, checkinLat, checkinLng, checkinSelfieUrl, checkoutLat, checkoutLng, checkoutSelfieUrl, method, lateMinutes, status enum('valid','invalid','absent'), notes, UNIQUE(staffUserId,date))`
- `staffDailyWages(id PK, staffUserId, date, baseWage, overtimeAmount, bonusAmount, deductionAmount, totalCredited, source, finalizedAt, UNIQUE(staffUserId,date))`
- `feePoolDaily(date PK, poolAmount, productCount, finalizedAt, splitMode, notes)`
- `feePoolSplits(id PK, date, staffUserId, hoursWorked, share, amount, createdAt, UNIQUE(date,staffUserId))`
- `staffPayoutRequests(id PK, staffUserId, walletType enum('gaji','fee','keduanya'), amount, reason, status enum('pending','approved','rejected','paid'), reviewedBy, reviewedAt, expenseId FK, createdAt)`

**Extend:**
- `staffEarnings` → tambah `walletType text default 'fee'`, `source text` (fee_pool | bonus_target | bonus_komplain | manual)

## 5. Alur Data

```
POS order paid
  → if PAYROLL_V2_ENABLED:
      accumulateFeePool(date, productCount)
      feePoolDaily.poolAmount += 200 × produk
Sepanjang hari:
  Staff checkin → staffAttendanceV2 INSERT (status='invalid')
  Staff checkout → UPDATE, hitung lateMinutes, status='valid' bila jam checkout ≥ min

Cron 23:59 (systemd/manual):
  finalizePayrollDay(date):
    if feePoolDaily.finalizedAt IS NOT NULL → SKIP (idempoten)
    tx:
      1. get validRows = staffAttendanceV2 where date=X and status='valid'
      2. for each row:
          - if manager role → skip fee credit, tetap dapat gaji
          - creditDailyWage(staff, wageConfig × bracketMultiplier + overtime)
      3. sum totalHoursValidFee (exclude manager)
      4. get poolDaily.poolAmount
      5. for each valid non-manager staff:
          - share = jam_i / total → creditFee(staff, share × pool)
          - INSERT feePoolSplits + staffEarnings(walletType='fee', source='fee_pool')
      6. bonusTarget/zero-komplain checks
      7. feePoolDaily.finalizedAt = now
      8. auditLog: 'payroll_finalize', metadata: {date, totalStaff, pool, totalCredited}

Payout approve:
  tx:
    debit wallet (staffDailyWages / staffEarnings)
    INSERT expenses (kategori 'Gaji Karyawan' / 'Fee Karyawan')
    UPDATE payoutRequest.status='paid', expenseId
    auditLog
```

## 6. Kunci Anti-Bug

- **Feature flag** — semua hook baru dilindungi `PAYROLL_V2_ENABLED`.
- **Idempoten** — `feePoolDaily.finalizedAt` sebagai lock per tanggal.
- **Transaction** — semua credit/debit dalam `db.transaction()`.
- **Unique constraint** — `(staffUserId, date)` di attendance & wages.
- **Non-destructive migrasi** — hanya CREATE/ADD.
- **Rate limit** — `/api/attendance-v2/checkin` max 3x/menit/staff.
- **PIN hash** — bcrypt (reuse `pinHash` di `staffProfiles`).
- **Foto** — kompres client 200KB, simpan `/uploads/attendance/YYYY-MM-DD/{staff}-{type}.jpg`.

## 7. Endpoint (ringkas)

```
POST   /api/attendance-v2/checkin          { pin, lat, lng, selfieBase64 }
POST   /api/attendance-v2/checkout         { pin, lat, lng, selfieBase64 }
GET    /api/attendance-v2/today
GET    /api/attendance-v2/history?month=

GET    /api/wallet-gaji/me
GET    /api/wallet-gaji/transactions

GET    /api/wallet-fee/me
GET    /api/wallet-fee/transactions
GET    /api/wallet-fee/pool/[date]

GET    /api/payroll/settings               (owner)
PATCH  /api/payroll/settings               (owner) { key, value }
GET    /api/payroll/staff                  (owner) — list wallet semua staff
PATCH  /api/payroll/staff/[id]/wage        (owner)

POST   /api/payroll/payout-request         (staff) { walletType, amount, reason }
POST   /api/payroll/payout-approve/[id]    (owner) { note }
POST   /api/payroll/payout-reject/[id]     (owner) { reason }
POST   /api/payroll/payout-batch           (owner) { month }

POST   /api/payroll/cron/finalize          (admin) { date? } — manual + systemd
GET    /api/payroll/reports/monthly?month= (owner) — JSON + ?format=pdf|xlsx

GET    /api/attendance-v2/live             (supervisor/owner)
```

Response: `{ data }` sukses, `{ error: { code, message } }` gagal.

## 8. Verifikasi (10 skenario UAT wajib lulus)

Referensi ke plan: cek `plans/oke-planing-dahulu-lalu-dreamy-alpaca.md` bagian "Verifikasi End-to-End".

## 9. Rollback Plan

1. Set `PAYROLL_V2_ENABLED=false` (hook POS langsung stop).
2. Frontend baru tetap ada tapi backend kosong.
3. Untuk rollback penuh: `DROP` tabel baru (non-destructive → aman) + revert kolom `walletType` di `staffEarnings`.
