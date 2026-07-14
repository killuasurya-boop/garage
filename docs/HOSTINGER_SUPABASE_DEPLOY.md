# Deploy Garage OS: Hostinger Web App + Supabase Postgres

Dokumen singkat & pragmatis. Ikuti urutannya.

## Kenapa Supabase?
- Garage OS = PostgreSQL (Drizzle ORM, `uuid`, `jsonb`, `gen_random_uuid`).
- Hostinger Web App tidak menyediakan Postgres — kalau tidak dihubungkan ke DB
  eksternal, app fallback ke PGlite dan **data hilang tiap redeploy**.
- Supabase = Postgres managed gratis. Nol perubahan kode.

## Langkah

### 1. Ambil Connection String Supabase
Supabase Dashboard → **Settings → Database → Connection string → URI**

Ada dua bentuk yang penting:

| Kegunaan | Port | Kapan dipakai |
|---|---|---|
| **Direct** | 5432 | Migrasi one-off (jalankan `scripts/supabase-migrate.sh`) |
| **Pooler (PgBouncer)** | 6543 | Runtime aplikasi Hostinger Web App |

Format Direct:
```
postgresql://postgres.<ref>:<PW>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Format Pooler:
```
postgresql://postgres.<ref>:<PW>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
```

### 2a. (Opsional) Dry-run — sanity check migrasi tanpa sentuh Supabase
```bash
npx tsx scripts/migrate-dryrun.mts
```
Apply 94 file ke PGlite temp fresh. Kalau ada file rusak, ketahuan sekarang
(bukan di Supabase). Ekspektasi: `94/94 sukses, 131 tabel, 0 error`.

### 2b. Jalankan Migrasi ke Supabase (dari laptop, sekali di awal)
```bash
DATABASE_URL='postgresql://postgres.<ref>:<PW>@...pooler.supabase.com:5432/postgres' \
  ./scripts/supabase-migrate.sh
```
Runner idempoten — aman dijalankan berulang. Sukses = 94 file `drizzle/*.sql`
terapply, tercatat di tabel `drizzle.__drizzle_migrations`.

### 2c. Verifikasi Migrasi
```bash
DATABASE_URL='postgresql://...:5432/postgres' \
  npx tsx scripts/supabase-verify.mts
```
Cek koneksi + 131 tabel + 15 tabel kunci + entry migrasi. Read-only, aman diulang.

### 2d. Seed Minimal (owner + outlet + cash session dev)
```bash
DATABASE_URL='postgresql://...:5432/postgres' \
OWNER_EMAIL='owner@garagecoffee.id' \
OWNER_NAME='Owner Garage' \
OWNER_PASSWORD='<PILIH_PASSWORD_KUAT>' \
  npx tsx scripts/supabase-seed-minimal.mts
```
Idempoten (`ON CONFLICT`) — aman diulang. Setelah ini owner bisa login di
`https://www.garagecoffee.id` pakai email+password yang di-set.

### 3. Set Env di hPanel Hostinger Web App
Panel Hostinger → Web App → **Environment Variables**. Isi minimal:

```
DATABASE_URL       = <string Pooler port 6543 dengan ?pgbouncer=true>
GARAGE_DB_DRIVER   = postgres
DATABASE_SSL       = true
BETTER_AUTH_SECRET = <random 32+ karakter, generate: openssl rand -hex 32>
BETTER_AUTH_URL    = https://www.garagecoffee.id
GARAGE_TRUSTED_ORIGINS = https://www.garagecoffee.id,https://garagecoffee.id
GARAGE_PUBLIC_BASE_URL = https://www.garagecoffee.id
NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL = https://www.garagecoffee.id
```

Setelah simpan env, klik **Redeploy** di Hostinger.

### 4. Verifikasi
```bash
curl -s https://www.garagecoffee.id/api/health | jq .data.database
```

Harus terlihat:
```json
{ "configured": true, "status": "reachable ...", "driver": "postgres" }
```

Kalau masih `"driver": "pglite"` → env belum ter-load, ulangi redeploy.

## Rollback / Ganti DB
- Env di Hostinger bisa diubah kapan saja — tidak mengubah kode.
- Backup Supabase otomatis di dashboard (Point-in-Time Recovery kalau paket
  mendukungnya, atau `pg_dump` manual dari **Database → Backups**).

## Catatan Penting
- **Fresh start.** Data lama dari VPS Docker (156.67.214.203) sudah hilang
  (VPS tidak diperpanjang). Skema baru dibangun dari nol via migrasi.
- **Kredensial jangan masuk git.** `.env` gitignored. `.mcp.json` juga.
- **Pooler `?pgbouncer=true`** wajib buat runtime app (mencegah masalah
  prepared statement dengan PgBouncer).
