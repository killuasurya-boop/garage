# Panduan Owner — Payroll V2

Sistem Payroll V2 memisahkan **Wallet Gaji** (upah harian + lembur) dan **Wallet Fee** (Rp 200/produk pool). Semua otomatis via cron 23:59. Owner tinggal atur & approve.

## 1. Aktifkan Sistem

- Set env `PAYROLL_V2_ENABLED=true` di VPS lalu restart app.
- Buka `/owner/payroll/settings` → set koordinat GPS toko + radius (default 50m).
- Set upah harian per staff via tab **Upah** atau langsung dari halaman detail staff.

## 2. Alur Harian

| Waktu | Aktivitas |
|---|---|
| 09:00 | Staff checkin di `/absen` (PIN+Selfie+GPS) |
| Sepanjang hari | Setiap POS order paid → pool fee otomatis `+ Rp 200 × produk` |
| 22:30+ | Staff checkout (checkout < 22:30 = invalid, Rp 0) |
| 23:59 | Cron otomatis: credit gaji + split pool ke staff valid non-manajer |

## 3. Halaman Owner

- **`/owner/payroll`** — Dashboard: saldo wallet gaji & fee semua staff, tombol Finalisasi H-1 manual.
- **`/owner/payroll/settings`** — 12 tab: GPS, upah, bracket telat, fee pool, bonus, payout mode, dll.
- **`/owner/payroll/requests`** — Approve/reject request pencairan (2 wallet terpisah).
- **`/owner/payroll/[staffId]`** — Detail per staff (fase lanjut).

## 4. Approve Payout

1. Staff request cair dari HP → status `pending`
2. Owner buka `/owner/payroll/requests` → filter tab **pending**
3. Klik **Approve** → sistem:
   - Debit wallet (gaji / fee / keduanya)
   - Insert `expenses` kategori "Gaji Karyawan" / "Fee/Insentif Karyawan"
   - Update status → `paid`
   - Catat `auditLogs`
4. Slip PDF bisa di-download dari halaman detail (fase lanjut).

## 5. Manual Finalisasi

Kalau cron mati/gagal, klik tombol **Finalisasi H-1** di dashboard. Sistem idempoten — aman dijalankan berulang.

## 6. Rollback / Matikan

- Set `PAYROLL_V2_ENABLED=false` → hook POS berhenti akumulasi pool, cron tetap safe.
- Data lama tidak hilang, akan tetap konsisten.

## 7. Aturan Penting (dikunci)

- Absen tidak lengkap (tanpa checkin/checkout valid) → **Rp 0** untuk kedua wallet
- Manajer/Owner/Admin/Finance-CFO/Supervisor tidak dapat fee pool (hanya gaji tetap)
- Cron 23:59 idempoten via `feePoolDaily.finalizedAt`
- Semua perubahan setting & payout tercatat di `auditLogs`
