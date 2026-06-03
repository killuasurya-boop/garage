# Garage OS — Deployment Checklist

> Go / No-Go untuk production deploy. Setiap item harus ✅ sebelum launch.

---

## Pre-Deploy

### Infrastructure
- [ ] Server target (VPS / Vercel / lainnya) ready dengan Node 20+
- [ ] Postgres production ready (Neon, Supabase, atau self-hosted)
- [ ] `DATABASE_URL` valid + connection test sukses
- [ ] Domain + DNS ke server target
- [ ] SSL/TLS cert (Let's Encrypt atau Cloudflare)
- [ ] Backup storage ready (S3 / lokal disk)

### Code & Build
- [ ] Branch `garage/perf-hardening-mvp` di-review + merged ke main (atau staging)
- [ ] `npm run lint` → 0 error, 0 warning
- [ ] `npm run build` → Compiled successfully, 169/169 halaman
- [ ] TypeScript pass (`tsc --noEmit` optional check)
- [ ] Tidak ada kredensial hardcoded di code (cek `git grep -i "password\|secret\|key" -- src/`)

### Database
- [ ] Schema migrated (`npm run db:migrate` — Postgres aman)
- [ ] Seed initial owner + outlet (`npm run db:seed`)
- [ ] Backup script tested (`scripts/backup.mjs` + restore drill)

### Env
- [ ] `.env.production` setup dengan:
  - `DATABASE_URL` (Postgres production)
  - `GARAGE_DB_DRIVER=postgres`
  - `BETTER_AUTH_SECRET` ≥ 32 char random
  - `BETTER_AUTH_URL` = origin production
  - `DATABASE_SSL=true` (kalau Neon)
- [ ] `.env.example` updated dengan semua var

### Security
- [ ] Owner password DEFAULT (`garage12345`) di-rotate ke kuat
- [ ] 2FA aktif untuk semua role Owner/Admin
- [ ] Policy `securityRequire2faForOwner` = true
- [ ] Rate-limit Better Auth verified (sign-in 10/menit, reset 5/menit)
- [ ] Audit log tabel reachable + ada index `createdAt`

---

## Smoke Test (Manual setelah deploy)

### Login flows
- [ ] `/login` — Owner login normal
- [ ] `/login` — wrong password → tetap di /login dengan error
- [ ] `/login` — 11x wrong password dalam 60s → rate-limit kick in (429)
- [ ] `/login/2fa` — challenge muncul kalau 2FA aktif
- [ ] `/pos-login` — kasir login
- [ ] `/member-login` — member login

### Alur transaksi (B.1 dari CHECKLIST)
- [ ] Buka shift kas
- [ ] POS — buat order dgn varian → 201
- [ ] Order muncul di KDS (Kitchen role)
- [ ] Kitchen `ready` → muncul di Waiter
- [ ] Waiter `delivered` → audit log "Kitchen ticket marked delivered"
- [ ] Order tampil di `/sales-history`
- [ ] Tutup shift normal → cash session closed

### Alur split payment (Fase 2)
- [ ] POS — buat order, pilih Split → Cash + QRIS sum = total
- [ ] 201 sukses, finance catat 2 row payment
- [ ] expectedCash hanya naik untuk cash split

### Alur member (B.2)
- [ ] Member register via /member-login
- [ ] POS — order dgn memberPhone → CRM update, point earn

### Alur approval (B.2.3)
- [ ] Tutup shift dgn selisih > Rp50.000 → approval otomatis dibuat
- [ ] Approve via Approvals board → status = approved
- [ ] Audit log "Approvals decided"

### `/control`
- [ ] Akses sebagai Owner → tampil
- [ ] Akses sebagai Kasir → redirect ke /os
- [ ] Kalau Owner belum 2FA setup + policy ON → redirect ke /control/2fa

### Display & QRIS
- [ ] `/display/customer-queue` — antrian tampil
- [ ] `/display/payment?amount=30000` — layar QRIS sinematik tampil
- [ ] POS QrisPaymentPanel — tombol "Layar Customer" buka window

### Responsive
- [ ] Mobile 390×844 — POS, dashboard, kitchen 0 overflow
- [ ] Desktop 1366×900 — semua modul 0 horizontal scroll
- [ ] Tablet POS 1024×768 — cart selalu terlihat

---

## Go-Live

- [ ] DNS pointing to production server
- [ ] Health check `/api/health` returns 200 (kalau ada)
- [ ] Backup pertama dilakukan + restore drill sukses
- [ ] Owner dapat akses + 2FA setup
- [ ] Staff dapat akses + ganti password default
- [ ] Outlet manager test 1 alur kasir penuh

---

## Post-Deploy Monitor (24 jam pertama)

- [ ] No console errors di browser (production build)
- [ ] No 500 errors di `/api/audit` lookup
- [ ] DB connection stable (no Aborted/connection refused)
- [ ] Backup script jalan otomatis (cron 02:00 daily)
- [ ] User feedback collected via /api/admin/feedback

---

## Rollback Plan

Kalau ada blocker post-deploy:
1. Revert ke commit pre-deploy: `git revert <commit>` lalu re-deploy
2. Atau switch DNS ke versi sebelumnya (kalau blue-green)
3. Restore DB dari backup terakhir
4. Komunikasi ke user via banner di app atau channel internal

---

## Sign-Off

| Role | Nama | Tanggal | Status |
|---|---|---|---|
| Tech Lead | | | ☐ |
| Owner / Sponsor | | | ☐ |
| Operations Lead | | | ☐ |

> Setelah semua sign-off + smoke test pass → **GO LIVE** 🚀
