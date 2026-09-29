# Migrasi DB Produksi: PGlite Lokal → PostgreSQL/Neon

Tujuan: hilangkan risiko korup PGlite lokal (single-file, single-writer) dengan memakai Postgres terkelola (Neon) + backup otomatis. Kode **sudah mendukung** ini — hanya perlu konfigurasi env + jalankan migrasi/seed.

## Kenapa
- PGlite `.pglite-data` rentan korup bila proses dimatikan saat menulis (riwayat `.pglite-data.corrupt-*` berulang). Lihat [[pglite-recovery]] di memory.
- Neon = Postgres terkelola, backup/branching otomatis, aman untuk operasional multi-perangkat (kasir + waiter + KDS di LAN/WiFi).

## Cara kerja pemilihan driver (sudah ada di kode)
`src/db/index.ts` → `preferPglite()`:
- `GARAGE_DB_DRIVER=postgres` → paksa Postgres.
- Ada `DATABASE_URL` + `NODE_ENV=production` → Postgres otomatis.
- SSL untuk `neon.tech`/`sslmode=require` sudah ditangani (`postgresSsl`).

## Langkah migrasi
1. **Buat project Neon** → salin connection string (mode pooled untuk runtime, direct untuk migrasi).
2. **Set env** (`.env.local` dev / env produksi):
   ```
   DATABASE_URL=postgresql://<user>:<pass>@<host>.neon.tech/<db>?sslmode=require
   GARAGE_DB_DRIVER=postgres
   ```
3. **Terapkan schema** ke Neon:
   ```bash
   npm run db:migrate:runner
   ```
   (runner idempoten, `src/db/migrate.ts` — jalan untuk Postgres maupun PGlite.)
4. **Seed baseline** (staf/menu/member/demo — upsert, tidak wipe):
   ```bash
   npm run db:seed
   ```
5. **Verifikasi**:
   ```bash
   npm run build
   npm run smoke            # E2E alur QR/order
   npm run readiness:audit  # target ke server yang pakai Neon
   npm run security:audit
   ```
   Pastikan "Health DB: Database reachable" PASS dan smoke lulus penuh (member tidak di-skip).

## Migrasi data lama (opsional)
Jika perlu memindahkan data operasional dari PGlite ke Neon: ekspor tabel dari PGlite → import ke Neon (pg_dump/pg_restore setara), atau anggap Neon sebagai fresh start dengan seed baseline bila data lama hanya demo. Simpan `.pglite-data` lama sebagai arsip.

## Backup terjadwal
- Neon: aktifkan retention/branching bawaan.
- Tambahan: `npm run backup` (`scripts/backup.mjs`, pakai `--env-file=.env.local`) dijadwalkan (cron/Task Scheduler) untuk dump berkala.

## Rollback
Kosongkan `GARAGE_DB_DRIVER` & `DATABASE_URL` → otomatis kembali ke PGlite lokal (`.pglite-data`).
