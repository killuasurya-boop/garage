# Setup Neon Postgres untuk Garage OS Production

> Step-by-step migrasi dari PGlite dev ke Neon Postgres production.
> Estimasi: 20–30 menit.

---

## 1. Buat Neon Project

1. Daftar di [neon.tech](https://neon.tech) (gratis: 0.5GB, cukup untuk MVP)
2. **Create Project** → pilih region terdekat (Singapore untuk Indonesia)
3. Database name: `garage-prod`
4. Copy **connection string** (sslmode=require otomatis)

Format:
```
postgresql://<user>:<password>@<host>.neon.tech/garage-prod?sslmode=require
```

## 2. Setup `.env.production`

Buat file `.env.production` di root project (TIDAK di-commit, sudah di `.gitignore`):

```bash
# Database
DATABASE_URL=postgresql://USER:PASS@HOST.neon.tech/garage-prod?sslmode=require
GARAGE_DB_DRIVER=postgres
DATABASE_SSL=true

# Auth (generate dgn: openssl rand -base64 32)
BETTER_AUTH_SECRET=GANTI_DENGAN_RANDOM_32_CHAR_MINIMUM
BETTER_AUTH_URL=https://app.garage.local

# App
NODE_ENV=production
```

Generate secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. Migrasi Schema ke Neon

```bash
# Pakai env production
export $(cat .env.production | xargs)
# Atau di Windows:
# Get-Content .env.production | ForEach-Object { $k,$v=$_.Split('=',2); Set-Item "env:$k" $v }

# drizzle-kit aman untuk Postgres
npm run db:migrate
```

**Expected output**: 56 migrasi dari 0000–0056 ter-apply (atau "already applied" kalau ulang).

## 4. Seed Initial Data

```bash
npm run db:seed
```

**Expected output**:
- `Garage seed completed (mode: PRODUCTION/struktural)`
- 15 staff users (owner, admin, manager, ...)
- 1 outlet default
- Menu items + inventory baseline

## 5. Verifikasi Koneksi

```bash
# Quick connection test
node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.connect().then(() => c.query('SELECT count(*) FROM staff_profiles'))
  .then(r => { console.log('staff count:', r.rows[0].count); c.end(); })
  .catch(e => console.error('FAIL:', e.message));
"
```

**Expected**: `staff count: 15` (atau lebih kalau seed berulang).

## 6. Build & Run Production

```bash
# Build (TIDAK butuh DB live thanks ke force-dynamic semua page akses session)
npm run build

# Start
npm run start   # port 3001
```

Buka `http://localhost:3001/login` → login `owner@garage.local` / `garage12345`.

## 7. Migrasi Data dari PGlite (Opsional)

Kalau Anda punya data nyata di PGlite dev yang ingin dipindah:

```bash
# 1. Dump PGlite ke SQL (perlu running dgn PGLITE_DATA_DIR set)
GARAGE_DB_DRIVER=pglite \
  node --env-file=.env.local scripts/backup.mjs
# Hasil: backups/garage-YYYYMMDD-HHMMSS.sql

# 2. Restore ke Neon
psql "$DATABASE_URL" < backups/garage-YYYYMMDD-HHMMSS.sql
```

Verifikasi count tabel sama: `SELECT count(*) FROM orders` di kedua DB.

## 8. Backup Otomatis (Cron)

Tambah ke crontab server:
```bash
# Setiap hari 02:00 backup ke S3 atau lokal
0 2 * * * cd /path/to/garage && node --env-file=.env.production scripts/backup.mjs
```

## 9. Disable Default Owner Password

**WAJIB sebelum production live**:

1. Login sebagai `owner@garage.local` / `garage12345`
2. `/account/password?required=1` — ganti ke password kuat
3. `/control/2fa` — aktifkan 2FA TOTP

## 10. Health Check

```bash
curl https://app.garage.local/api/admin/health
# Expected: 200 OK + JSON health status
```

---

## Troubleshooting

### `password authentication failed`
- Cek connection string user/password
- Pastikan tidak ada special char yang perlu URL-encoded

### `SSL required`
- Tambah `?sslmode=require` ke `DATABASE_URL`
- Set `DATABASE_SSL=true`

### `relation "xxx" does not exist`
- Migrasi belum jalan. Ulang `npm run db:migrate`.

### `Too many connections`
- Neon free tier: 100 connection. Kalau hit limit, scale plan atau pakai connection pooler.

### Build `RuntimeError: Aborted()`
- Hanya terjadi kalau pakai PGlite + drizzle-kit. Production Postgres aman.

---

Setelah semua step ✅ → lanjut ke `docs/DEPLOYMENT_CHECKLIST.md` smoke test section.
