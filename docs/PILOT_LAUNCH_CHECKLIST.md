# Garage OS — Pilot Launch Checklist

Step-by-step untuk launch 1 outlet pertama secara aman.

---

## Fase 0 — Pre-Flight (1-2 hari sebelum live)

### Secrets & environment

- [ ] `BETTER_AUTH_SECRET` — rotate ke value production (32+ char random)
  ```bash
  openssl rand -base64 32
  ```
- [ ] `GARAGE_SEED_PASSWORD` — ganti dari default `garage12345`
- [ ] `POS_TERMINAL_API_KEY_PEPPER` — set ke random 32-char
- [ ] `DATABASE_URL` — pointing ke Neon production (BUKAN dev)
- [ ] `BETTER_AUTH_URL` — set ke domain production (https://garage.yourdomain.com)
- [ ] `GARAGE_SESSION_EXPIRES_HOURS` — 24 default OK, ubah kalau perlu
- [ ] `GARAGE_PUBLIC_BASE_URL` — domain publik untuk invoice link
- [ ] `GARAGE_VAPID_PUBLIC` + `GARAGE_VAPID_PRIVATE` — kalau pakai Web Push:
  ```bash
  npx web-push generate-vapid-keys
  ```

### Database

- [ ] Run migration production: `npm run db:migrate`
- [ ] Run seed (sekali aja): `npm run db:seed`
- [ ] Verify owner login bisa: `owner@garage.local` / `<seed password>`
- [ ] **GANTI password owner via UI** setelah login pertama
- [ ] Setup backup cron: lihat `scripts/backup.mjs`
  ```bash
  # Crontab Linux/Mac (backup tiap jam 2 pagi)
  0 2 * * * cd /path/to/garage && node --env-file=.env.local scripts/backup.mjs >> /var/log/garage-backup.log 2>&1
  ```

### Monitoring

- [ ] Setup error tracking endpoint: `/api/admin/errors`
- [ ] Test trigger error manually & verify masuk DB:
  ```bash
  curl -X POST http://localhost:3001/api/admin/errors \
    -H "content-type: application/json" \
    -d '{"message":"smoke test error","url":"/test"}'
  ```
- [ ] Setup health check ping (UptimeRobot atau Better Stack) ke `/api/admin/health`
- [ ] (Opsional) Pasang Sentry — ganti `recordError` call ke `Sentry.captureException`

### Configuration

- [ ] Set tax & service di `/control/settings` → Tax & Service (PB1 10%, Service 5% default)
- [ ] Set business identity di `/control/settings` → General (nama, tagline, timezone)
- [ ] Set receipt branding di `/control/settings` → Receipt & Invoice (header, footer, NPWP)
- [ ] Set security policy: `/control/settings` → Security
  - [ ] `securityIdleLogoutMinutes`: 15-30 menit (POS tablet)
  - [ ] `securityFailedLoginLockoutCount`: 5
  - [ ] `securityRequire2faForOwner`: true (HIGHLY recommended)

### Staff setup

- [ ] Owner enable 2FA di `/control/2fa` (scan QR + simpan backup codes)
- [ ] Tambah staff via `/control/users`:
  - Manager Operasional (1)
  - Kasir (2-3, sesuai shift)
  - Barista/Koki (sesuai outlet)
  - Gudang (1)
- [ ] Tiap staff login pertama → ganti password sendiri
- [ ] (Opsional) Owner/Admin: enable 2FA juga

---

## Fase 1 — Data Setup

### Menu

- [ ] Bikin CSV template:
  ```csv
  name,category,section,variant_label,price,base_cost,prep,status,tags
  Es Kopi Susu,Coffee,Coffee,Cold,22000,8000,2 min,active,signature
  Es Kopi Susu,Coffee,Coffee,Hot,22000,8000,2 min,active,signature
  Nasi Goreng,Makanan,Food,Sedang,32000,15000,8 min,active,
  Nasi Goreng,Makanan,Food,Pedas,32000,15000,8 min,active,
  ```
- [ ] Dry-run import dulu:
  ```bash
  curl -b cookies.txt -X POST http://localhost:3001/api/admin/import/menu \
    -H "content-type: application/json" \
    -d "{\"csv\":\"$(cat menu.csv | jq -Rs .)\",\"dryRun\":true}"
  ```
- [ ] Live import setelah dry-run OK (set `dryRun: false`)
- [ ] Verify menu muncul di POS

### Inventory

- [ ] Setup inventory items per kategori (drink, food, packaging)
- [ ] Set min stock + lowStockThreshold di `/control/settings` → Notifikasi
- [ ] Initial stock opname (manual): masukkan onHand starting

### Outlet

- [ ] Pastikan outlet ada di DB (`outlets` table). Default: OUTLET-A
- [ ] Tambah outlet kedua kalau multi-outlet via DB direct atau bikin endpoint
- [ ] Set outlet-specific override di `/control/settings` (picker outlet di header)

---

## Fase 2 — Hardware Setup

### Tablet POS

- [ ] Android 10+ atau iPad
- [ ] Browser Chrome/Edge terbaru (untuk PWA + Service Worker)
- [ ] Pin tab POS sebagai app
- [ ] Disable auto-lock minimal 15 menit
- [ ] (Opsional) Set kiosk mode

### Thermal printer

- [ ] Pilih model ESC/POS compatible: Epson TM-T82, Rongta RPP02N, dll
- [ ] Install driver Windows (kalau via spool)
- [ ] Test print via `/api/print/thermal`:
  ```bash
  curl -X POST http://localhost:3001/api/print/thermal \
    -H "content-type: application/json" \
    -d '{"receipt":{"orderNo":"TEST","subtotal":50000,"total":50000,"items":[]},"target":"preview","printerName":"YOUR_PRINTER_NAME"}'
  ```
- [ ] Set `defaultPrinterName` di `/control/settings` → Printer & Hardware

### Cash drawer

- [ ] Drawer RJ-11/RJ-12 colok ke printer
- [ ] Test kick: bayar order pakai cash → drawer otomatis buka
- [ ] Setting `cashDrawerOnPayment` = true di settings

### Network

- [ ] WiFi router stabil
- [ ] **Backup hotspot tethering** kalau internet putus
- [ ] Test latency ke server (target <500ms)

---

## Fase 3 — Training (sebelum opening day)

### Owner / Manager (2 jam)

- Tour semua modul `/control/*`
- Demo bikin staff, suspend, reset password
- Demo ubah tax, receipt template
- Demo lihat audit log, force logout
- Demo open/close cash session dengan discrepancy
- Praktek emergency logout

### Kasir (1 jam)

- Login flow + 2FA challenge
- Open cash session pagi
- Bikin order: pilih menu, variant, customer (member), bayar (cash/QRIS)
- Void order (request approval)
- Apply voucher
- Close cash + handover

### Barista / Koki (30 menit)

- Login + lihat KDS
- Accept ticket → Ready → Delivered
- Mark item out-of-stock
- Add internal notes ke ticket

### Gudang (30 menit)

- Login + lihat inventory
- Stock movement (in/out)
- Approve transfer request
- Stock opname

---

## Fase 4 — Soft Launch (Hari 1-2)

- [ ] Buka outlet **jam terbatas** (cth: 10:00-14:00 aja)
- [ ] Owner present di outlet, monitor langsung
- [ ] Catat tiap issue real-time
- [ ] Setiap staff submit feedback via `/api/admin/feedback`:
  - Kategori: bug / suggestion / praise / question
  - Priority: critical / high / medium / low

### Metrics yang harus dimonitor

- [ ] Error rate di `/control/health` & audit log
- [ ] Print success rate (target: 99%+)
- [ ] Cash discrepancy per shift (target: < threshold)
- [ ] Order accuracy (struk vs actual delivered)
- [ ] Staff complaint count

---

## Fase 5 — Full Launch (Hari 3+)

- [ ] Buka full hours
- [ ] Daily retrospective sore: review feedback list
- [ ] Triage feedback critical → fix dalam 24 jam
- [ ] Weekly: review error events, cleanup resolved, plan improvement

---

## Emergency Playbook

### Internet putus

1. Tethering hotspot HP (backup)
2. Kalau lebih dari 30 menit: manual receipt (kertas) + input ke sistem setelah online
3. Sync semua transaksi → verify konsisten

### Database down

1. Cek `/api/admin/health` — connection status
2. Cek Neon dashboard (atau provider DB)
3. Restore dari backup terakhir:
   ```bash
   pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner backup-YYYYMMDD.dump
   ```

### Akun bocor / suspicious activity

1. Owner login → `/control/security` → **Emergency Logout All**
2. Audit `/control/security` tab Audit Trail untuk forensik
3. Reset password user yang bocor → force re-2FA setup

### Printer mati

1. Cek koneksi + power
2. Set `autoPrintReceipt` = false sementara di settings
3. Manual cetak: download invoice PDF dari `/invoice/[token]`

---

## Post-Pilot Review (setelah 1 minggu)

- [ ] Total feedback collected: X items
- [ ] Bugs fixed: Y items
- [ ] Critical issues: Z items
- [ ] Order processed: total
- [ ] Cash discrepancy total: Rp X
- [ ] Staff satisfaction (1-5 score)
- [ ] **Go/No-go decision**: lanjut full launch atau iterate lagi?

---

## Rotasi rutin (bulanan)

- [ ] Rotate `BETTER_AUTH_SECRET` (force semua sesi logout)
- [ ] Verify backup restorability (test restore ke staging DB)
- [ ] Review staff list — suspend yang resign, audit yang inactive
- [ ] Clean error events resolved
- [ ] Database maintenance: vacuum, reindex
