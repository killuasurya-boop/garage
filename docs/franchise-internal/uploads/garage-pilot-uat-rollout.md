# GARAGE QR Pilot UAT ke Rollout 50 Meja

## Tujuan

Menjalankan pilot fisik QR menu di outlet untuk meja `01`, `25`, dan `50` sebelum semua QR meja `01-50` ditempel penuh.

## Command Operator

```powershell
npm.cmd run pilot:uat
```

Untuk panduan rollout penuh setelah pilot lolos:

```powershell
npm.cmd run pilot:uat -- --rollout
```

## Sebelum Shift Pilot

1. Jalankan:

```powershell
npm.cmd run lint
npm.cmd run build
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"; npm.cmd run smoke
npm.cmd run readiness:audit
```

2. Status `readiness:audit` wajib `GO`.
3. Buka `http://192.168.110.142:3001/order/qr-print?tables=01,25,50`.
4. Print dan tempel hanya QR meja `01`, `25`, `50`.
5. Brief kasir memakai `docs/garage-qr-cashier-sop.md`.

## Skenario Wajib 1 Shift

| Meja | Customer | Aksi Kasir | Expected |
| --- | --- | --- | --- |
| 01 | Guest | Reject | Order hilang dari pending, tidak ada kitchen ticket, audit tercatat |
| 25 | Guest | Accept | Kitchen ticket terbentuk setelah kasir accept |
| 50 | Member | Paid | Kitchen ticket, payment, dan points member diproses |

Semua order harus menampilkan nomor meja benar, nama/WA customer, item, total, status invoice, dan link WhatsApp `wa.me`.

Panel `QR Control hari ini` di POS harus menampilkan total QR, paid, average proses, SLA >3 menit, meja aktif, alasan reject, repeat customer, dan tombol follow-up WhatsApp.

## Gate Keputusan

`GO full rollout` jika:

- Tidak ada issue `P0/P1`.
- Kasir memahami flow `Accept`, `Paid`, `Reject`.
- Kitchen hanya menerima ticket dari order `Accept` atau `Paid`.
- Invoice WhatsApp fallback `wa.me` muncul.
- QR Control tidak menunjukkan pending order lewat SLA tanpa ditangani.

`Conditional` jika:

- Hanya ada issue `P2/P3`.
- Flow transaksi utama tetap jalan.
- Supervisor setuju lanjut terbatas sambil fix minor.

`No-Go` jika:

- Ada order salah meja.
- Payment salah.
- Kitchen ticket dobel atau hilang.
- Customer atau kasir terblokir menjalankan flow utama.

## Rollout 50 Meja

1. Jalankan ulang:

```powershell
npm.cmd run readiness:audit
```

2. Jika status `GO`, buka `http://192.168.110.142:3001/order/qr-print`.
3. Print dan tempel QR meja `01-50`.
4. Pantau 1 shift pertama lewat panel `QR Orders` di POS.
5. Supervisor cek meja acak `01`, `10`, `25`, `35`, `50`.

## Issue Log

Catat semua masalah di `docs/garage-production-readiness-audit.md` memakai format:

| ID | Area | Severity | Step | Expected | Actual | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-001 | QR Customer | P1 | Scan meja 01 dari HP | Menu Meja 01 terbuka |  |  | Open |
