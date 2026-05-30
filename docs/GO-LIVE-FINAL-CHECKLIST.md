# Go-Live Final Checklist GARAGE

Checklist ini dipakai tepat sebelum outlet dinyatakan live.

## 1. Technical Gate

- [ ] `npm.cmd run db:migrate` sukses.
- [ ] `npm.cmd run lint` sukses.
- [ ] `npm.cmd run build` sukses.
- [ ] `npm.cmd run smoke` sukses.
- [ ] `npm.cmd run readiness:audit` menghasilkan `READINESS STATUS: GO`.
- [ ] `/api/health` database reachable.
- [ ] Dev/production server berjalan stabil.

## 2. Environment Gate

- [ ] `DATABASE_URL` final.
- [ ] `BETTER_AUTH_SECRET` diganti dari default.
- [ ] `MEMBER_AUTH_SECRET` diganti dari default.
- [ ] `GARAGE_JOB_SECRET` atau `CRON_SECRET` diganti dari default.
- [ ] `GARAGE_POS_API_KEY` diganti dari default.
- [ ] `BETTER_AUTH_URL` sesuai IP/domain final.
- [ ] `GARAGE_PUBLIC_BASE_URL` sesuai IP/domain final.
- [ ] `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL` sesuai IP/domain final.
- [ ] `GARAGE_TRUSTED_ORIGINS` berisi localhost, 127.0.0.1, dan IP/domain final.

## 3. Account Gate

- [ ] Password Owner diganti.
- [ ] Password Admin diganti.
- [ ] Password Kasir diganti.
- [ ] Password Kitchen/Barista/Koki diganti.
- [ ] Password member seed tidak dipakai untuk customer real.
- [ ] Role akses dicek ulang.

## 4. Device Gate

- [ ] Tablet kasir bisa buka `/pos`.
- [ ] Laptop/admin bisa buka `/os`.
- [ ] Kitchen display bisa buka modul Kitchen.
- [ ] Customer display bisa buka `/display/customer-queue`.
- [ ] HP customer bisa scan QR meja.
- [ ] Printer thermal bisa test print dari Windows.
- [ ] Printer thermal bisa test print dari Pengaturan.

## 5. Operational Gate

- [ ] Kasir bisa buka shift.
- [ ] Kasir bisa transaksi dine-in.
- [ ] Kasir bisa transaksi takeaway.
- [ ] QR meja bisa membuat order.
- [ ] Kasir bisa accept QR order.
- [ ] Kitchen menerima ticket.
- [ ] Kitchen bisa update status.
- [ ] Struk tercetak.
- [ ] Closing shift berjalan.
- [ ] Finance summary tampil.
- [ ] Audit log mencatat aksi.

## 6. Go / No-Go

GO jika:

- Semua technical gate hijau.
- Printer berjalan atau owner menyetujui manual receipt sementara.
- QR customer bisa dibuka dari HP.
- Kasir memahami accept/paid/reject.
- Kitchen menerima order valid.
- Closing shift berhasil.

NO-GO jika:

- Database tidak reachable.
- POS tidak bisa payment.
- QR salah meja.
- Kitchen ticket tidak terbentuk.
- Struk wajib tapi printer tidak bisa dipakai.
- Kasir bisa membuka Settings POS.
- Audit log gagal mencatat aksi kritis.

