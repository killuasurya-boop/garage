# MVP Final Setup Master - GARAGE

Dokumen ini adalah checklist final untuk menyiapkan Garage Digital Ecosystem sampai siap pilot outlet dan menuju production.

## 1. Baseline Teknis

Wajib hijau sebelum pilot:

- `npm.cmd run lint`
- `npm.cmd run build`
- `GET /api/health` mengembalikan database reachable.
- Login Owner, Admin, Kasir, Kitchen/Barista, Waiter berjalan.
- Modul `/os?module=settings` bisa dibuka sesuai role.
- Halaman `/pos` bisa dibuka role yang punya akses POS.

Catatan:

- Jalankan command memakai `npm.cmd` di Windows jika PowerShell memblokir `npm.ps1`.

## 2. Finalisasi Pengaturan

Checklist fitur Pengaturan:

- POS Billing menampilkan preview total bill.
- Branding menampilkan preview struk.
- Notifikasi punya test sound QR order.
- Printer punya target printer dan test print.
- Loyalty menampilkan simulasi poin per tier.
- Simpan settings menampilkan konfirmasi untuk field berisiko tinggi.
- Update settings masuk audit log dengan metadata before/after.
- Settings POS di layar POS hanya muncul untuk Owner / CEO dan Admin.

Field risiko tinggi:

- Service Charge
- PB1 / Pajak Restoran
- Max Diskon Kasir
- Threshold Approval Expense
- Auto-Print Struk
- Poin Loyalty
- Max Discount Voucher

## 3. Pilot Checklist Outlet

### Owner / Admin

1. Login ke `/login`.
2. Buka `/os?module=dashboard`.
3. Cek dashboard owner.
4. Buka `/os?module=settings`.
5. Set brand, pajak, service charge, printer, dan loyalty.
6. Simpan dan cek audit log.
7. Buka `/pos`.
8. Pastikan Settings POS muncul untuk Owner/Admin.

### Kasir

1. Login ke `/pos-login`.
2. Buka shift.
3. Pastikan Settings POS tidak muncul untuk Kasir.
4. Buat transaksi dine-in.
5. Pilih meja.
6. Tambahkan item.
7. Lookup member atau gunakan guest.
8. Pilih metode bayar.
9. Selesaikan payment.
10. Cetak struk.
11. Cek history penjualan.
12. Close shift.

### QR Order

1. Cetak QR meja dari `/order/qr-print`.
2. Scan QR meja.
3. Customer buka `/order`.
4. Customer pilih menu.
5. Customer checkout.
6. Kasir accept QR order.
7. Order masuk Kitchen/KDS.
8. Kitchen update status sampai ready.
9. Meja dikembalikan ke status siap.

### Kitchen / Barista

1. Login sebagai kitchen/barista.
2. Buka modul Kitchen.
3. Pastikan order POS/QR muncul.
4. Ubah status order.
5. Cek performance/report kitchen.

### Finance

1. Buka modul Finance.
2. Cek cash session.
3. Cek payment breakdown.
4. Tambahkan expense.
5. Test threshold approval.
6. Export laporan jika diperlukan.
7. Cek supplier invoice jika dipakai.

### CRM / Member

1. Register member baru.
2. Login member.
3. Buat transaksi member.
4. Cek poin bertambah.
5. Test voucher/redeem.
6. Cek customer masuk CRM.

### Audit / Approval

1. Ubah settings.
2. Void transaksi test jika role mendukung.
3. Tambah expense di atas threshold.
4. Pastikan approval muncul.
5. Approve/reject approval.
6. Pastikan audit log mencatat aksi.

## 4. Production Readiness

### Environment

Wajib set:

- `DATABASE_URL`
- `DATABASE_SSL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GARAGE_TRUSTED_ORIGINS`
- `GARAGE_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL`
- `MEMBER_AUTH_SECRET`
- `GARAGE_POS_API_KEY`
- `GARAGE_JOB_SECRET` atau `CRON_SECRET`

Jika memakai AI:

- `OPENAI_API_KEY`
- `AI_CONFIG_ENCRYPTION_KEY`
- Provider key lain jika digunakan.

Jika memakai Google Drive:

- `GOOGLE_SERVICE_ACCOUNT_JSON` atau service account email/private key.
- `GOOGLE_DRIVE_REPORTS_FOLDER_ID`

### Database

1. Jalankan migrasi.
2. Jalankan seed awal.
3. Backup database sebelum pilot.
4. Simpan credential database di password manager.
5. Pastikan restore procedure sudah dicoba minimal sekali.

### Domain / LAN

1. Set `BETTER_AUTH_URL` sesuai domain/IP yang dipakai device.
2. Set trusted origins untuk localhost, 127.0.0.1, dan LAN/domain.
3. Pastikan QR order memakai public base URL yang bisa dibuka customer.
4. Test dari tablet kasir dan HP customer di jaringan yang sama.

### Printer

1. Install driver printer thermal di device kasir.
2. Test print dari Windows/Notepad.
3. Jalankan `npm.cmd run print:start` jika memakai print server lokal.
4. Isi nama printer di Pengaturan.
5. Klik Test Print dari Pengaturan.
6. Lakukan transaksi test dan cetak struk asli.

### Security

1. Ganti semua password seed sebelum production.
2. Gunakan secret minimal 32 karakter.
3. Batasi akses Owner/Admin.
4. Pastikan Kasir tidak melihat Settings POS.
5. Pastikan endpoint POS eksternal memakai `x-api-key`.
6. Pastikan cron endpoint memakai bearer secret.
7. Review audit log setelah simulasi pilot.

## 5. Go / No-Go Criteria

Pilot boleh jalan jika:

- Build production sukses.
- Lint tidak punya error baru dari perubahan MVP.
- Login semua role inti berhasil.
- POS transaksi berhasil sampai struk.
- QR order berhasil sampai kitchen.
- Closing shift berhasil.
- Finance summary terbaca.
- Settings tersimpan dan masuk audit.
- Printer test berhasil di device kasir.
- Database backup tersedia.

No-go jika:

- Database tidak reachable.
- POS tidak bisa payment.
- Struk tidak bisa dicetak dan outlet wajib print.
- QR customer tidak bisa dibuka dari HP customer.
- Kasir bisa mengubah Settings POS.
- Audit log tidak mencatat aksi kritis.

## 6. Urutan Setup Final

1. Fix baseline teknis.
2. Isi environment final.
3. Migrasi dan seed database.
4. Login Owner.
5. Konfigurasi Pengaturan.
6. Setup printer.
7. Test POS manual.
8. Test QR order.
9. Test Kitchen.
10. Test Finance closing.
11. Test CRM/member.
12. Test approval dan audit.
13. Backup database.
14. Jalankan pilot outlet.

## 7. Dokumen Operator Final

Gunakan dokumen berikut saat pilot dan go-live:

- `docs/SOP-FINAL-OPERASIONAL-GARAGE.md`
- `docs/GO-LIVE-FINAL-CHECKLIST.md`
- `docs/PILOT-ISSUE-LOG.md`
- `docs/FINAL-GO-LIVE-SIGNOFF.md`
- `docs/garage-qr-cashier-sop.md`
- `docs/garage-pilot-uat-rollout.md`

## 8. Status Gate Terakhir

Gate yang harus diulang tepat sebelum pilot:

```powershell
npm.cmd run db:migrate
npm.cmd run lint
npm.cmd run build
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"; npm.cmd run smoke
npm.cmd run readiness:audit
```

Target akhir:

- `db:migrate` sukses.
- `lint` sukses.
- `build` sukses.
- `smoke` sukses.
- `readiness:audit` menampilkan `READINESS STATUS: GO`.
