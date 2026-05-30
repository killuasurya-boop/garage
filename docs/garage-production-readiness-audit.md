# GARAGE Professional Production Readiness Audit

## Status Rules

- `GO`: tidak ada fail/warn; QR pilot boleh lanjut ke aktivasi semua meja setelah 1 shift aman.
- `CONDITIONAL GO`: tidak ada fail, tetapi ada hal yang harus dicek manual sebelum 50 meja aktif.
- `NO-GO`: ada fail; perbaiki dulu sebelum pilot atau rollout.

## Command

```powershell
npm.cmd run lint
npm.cmd run build
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"; npm.cmd run smoke
npm.cmd run readiness:audit
npm.cmd run pilot:uat
```

Untuk cleanup aman order QR test yang masih pending:

```powershell
$env:READINESS_CLEANUP_TEST_ORDERS="1"
npm.cmd run readiness:audit
Remove-Item Env:\READINESS_CLEANUP_TEST_ORDERS
```

Cleanup hanya menolak order pending yang terdeteksi sebagai test, seperti `Codex`, `QA Smoke`, `smoke`, `test`, atau `Meja 99`.

## Audit Coverage

- LAN config: `BETTER_AUTH_URL`, `GARAGE_TRUSTED_ORIGINS`, `GARAGE_PUBLIC_BASE_URL`, `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL`.
- Health DB lokal dan LAN.
- Public menu API.
- QR meja pilot `01`, `25`, `50` dan validasi meja invalid.
- Halaman print pilot `/order/qr-print?tables=01,25,50`.
- Guest checkout validation.
- Cashier endpoint wajib login.
- QR Control insight protected: dashboard harian, pending SLA, meja aktif, repeat customer, dan follow-up WhatsApp.
- Pending QR orders: pisahkan test orders dan operational pending orders.

## Issue Log Format

| ID | Area | Severity | Step | Expected | Actual | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-001 | QR Customer | P1 | Scan meja 01 dari HP | Menu Meja 01 terbuka |  |  | Open |
| MVP-API | Final MVP | — | `npm run final-mvp:uat` | 5/5 PASS | Automated API UAT (cashier, finance, opname, QR, member lock) | Dev | Pass |
| MVP-DB | Setup | — | `npm run db:repair-mvp` + `db:seed` | Seed completes | payments.cash_session_id repair | Dev | Pass |

Severity:

- `P0`: transaksi/order/payment salah atau data hilang.
- `P1`: customer/kasir terblokir menjalankan flow utama.
- `P2`: flow bisa lanjut, tetapi ada risiko bingung atau salah operasional.
- `P3`: polish visual/copy, tidak mengganggu transaksi.

## Go Criteria

- `npm.cmd run readiness:audit` minimal `CONDITIONAL GO`, tanpa fail.
- Semua issue `P0/P1` tertutup.
- Pilot meja `01`, `25`, `50` lolos minimal 1 shift.
- Kasir bisa memproses QR order kurang dari 15 detik.
- QR Control menampilkan alert jika pending order melewati SLA 3 menit.
- Kitchen hanya menerima ticket dari `Accept` atau `Paid`.
- Reject masuk audit log dan tidak membuat kitchen ticket.
- WhatsApp fallback `wa.me` tampil untuk order QR.

Untuk aktivasi penuh, jalankan:

```powershell
npm.cmd run pilot:uat -- --rollout
```
