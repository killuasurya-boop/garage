#!/usr/bin/env bash
# =============================================================================
# Jalankan seluruh migrasi drizzle ke Supabase (production).
#
# Pakai:
#   DATABASE_URL='postgresql://postgres.<ref>:<PW>@...pooler.supabase.com:5432/postgres' \
#     ./scripts/supabase-migrate.sh
#
# Catatan:
# - Gunakan port 5432 (Direct) untuk migrasi, bukan 6543 (pooler).
# - Runner idempoten (src/db/migrate.ts) — aman dijalankan berulang.
# - Runner mencatat tiap file di tabel drizzle.__drizzle_migrations.
# =============================================================================
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL kosong. Tempel connection string Supabase DIRECT (port 5432)."
  echo "   Contoh: DATABASE_URL='postgresql://postgres.<ref>:<pw>@...supabase.com:5432/postgres' ./scripts/supabase-migrate.sh"
  exit 1
fi

# Deteksi ringan biar tidak salah tembak.
if [[ ! "$DATABASE_URL" =~ supabase\.com ]]; then
  echo "⚠️  DATABASE_URL bukan supabase.com. Yakin lanjut? (Ctrl+C untuk batal)"
  sleep 3
fi

echo "▶ Jalankan migrasi (GARAGE_DB_DRIVER=postgres, sslmode required)"
export GARAGE_DB_DRIVER=postgres
export DATABASE_SSL=true

npx tsx src/db/migrate.ts
echo "✅ Migrasi selesai. Cek tabel di Supabase Dashboard → Table Editor."
