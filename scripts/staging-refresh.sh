#!/usr/bin/env bash
# =============================================================================
# R1 — Isi ulang data staging dari produksi, lalu SAMARKAN (dijalankan di VPS oleh
# scripts/deploy-staging.sh --refresh-data).
#   1. pg_dump database produksi (hanya baca).
#   2. Database staging dikosongkan lalu diisi dump itu.
#   3. scripts/staging-anonymize.sql: data pribadi disamarkan, token/sesi/antrean keluar
#      dihapus. Skrip itu menolak berjalan bila nama database bukan staging.
# App staging dihentikan selama proses supaya tidak ada tulisan setengah jalan.
# =============================================================================
set -euo pipefail

PROD_DIR="${PROD_DIR:-/root/garage}"
STAGING_DIR="${STAGING_DIR:-/root/garage-staging}"
cd "$STAGING_DIR"
[ -f .env.staging ] || { echo "ERROR: .env.staging belum ada — jalankan setup dulu."; exit 1; }

PROD=(docker compose -f "$PROD_DIR/docker-compose.yml" --env-file "$PROD_DIR/.env.production")
STG=(docker compose -f "$STAGING_DIR/docker-compose.staging.yml" --env-file "$STAGING_DIR/.env.staging")
# Baca nilai tanpa export: variabel shell akan menimpa --env-file saat compose membaca config.
envval() { grep -E "^$2=" "$1" | tail -1 | cut -d= -f2-; }
PROD_USER="$(envval "$PROD_DIR/.env.production" POSTGRES_USER)"
PROD_DB="$(envval "$PROD_DIR/.env.production" POSTGRES_DB)"
POSTGRES_USER="$(envval .env.staging POSTGRES_USER)"
POSTGRES_DB="$(envval .env.staging POSTGRES_DB)"
case "$POSTGRES_DB" in *staging*) ;; *) echo "ERROR: POSTGRES_DB staging harus mengandung 'staging'."; exit 1 ;; esac

echo ">> hentikan app staging"
"${STG[@]}" stop app >/dev/null 2>&1 || true
"${STG[@]}" up -d db
for _ in $(seq 1 30); do "${STG[@]}" exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 && break; sleep 2; done

echo ">> kosongkan database staging"
"${STG[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" </dev/null \
  -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null

echo ">> salin data produksi → staging (pg_dump, hanya baca)"
"${PROD[@]}" exec -T db pg_dump -U "$PROD_USER" -d "$PROD_DB" --no-owner --no-privileges </dev/null \
  | "${STG[@]}" exec -T db psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null

echo ">> samarkan data pribadi & hapus token"
"${STG[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < scripts/staging-anonymize.sql

echo ">> jalankan lagi app staging (migrasi versi staging dulu)"
"${STG[@]}" run --rm migrate
"${STG[@]}" up -d --no-build app
echo "Selesai: data staging = salinan produksi yang disamarkan ($(date -Iseconds))."
