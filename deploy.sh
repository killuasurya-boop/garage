#!/usr/bin/env bash
# =============================================================================
# Garage OS — deploy 1-perintah untuk VPS (Hostinger KVM / Docker).
# Jalankan dari dalam folder repo di VPS:
#   ./deploy.sh            -> pull + build + up + migrate (update biasa)
#   ./deploy.sh --seed     -> sekaligus seed data awal (HANYA deploy pertama)
#
# Aman dijalankan berulang (idempotent). Migrasi DB jalan otomatis lewat
# service `migrate` di docker-compose sebelum app start.
# =============================================================================
set -euo pipefail

ENV_FILE=".env.production"
COMPOSE="docker compose --env-file ${ENV_FILE}"

cd "$(dirname "$0")"

# --- 0. Pra-syarat -----------------------------------------------------------
command -v docker >/dev/null 2>&1 || {
  echo "ERROR: docker belum terpasang. Pasang dulu:  curl -fsSL https://get.docker.com | sh"
  exit 1
}

if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: ${ENV_FILE} belum ada."
  echo "  cp .env.production.example ${ENV_FILE}  lalu isi domain, POSTGRES_PASSWORD, BETTER_AUTH_SECRET."
  echo "  Generate secret:  openssl rand -base64 32"
  exit 1
fi

# --- 1. Ambil versi terbaru --------------------------------------------------
echo ">> git pull..."
git pull --ff-only

# --- 2. Build & jalankan (db -> migrate -> app -> caddy) ----------------------
echo ">> build & up (migrasi DB jalan otomatis)..."
${COMPOSE} up -d --build

# --- 3. Seed awal (opsional, hanya deploy pertama) ---------------------------
if [ "${1:-}" = "--seed" ]; then
  echo ">> seed data awal (struktural; demo TIDAK di-seed di production)..."
  ${COMPOSE} run --rm migrate node_modules/.bin/tsx src/db/seed.ts
fi

# --- 4. Status ---------------------------------------------------------------
echo ">> status container:"
${COMPOSE} ps

echo ""
echo "Selesai. Cek log app bila perlu:  ${COMPOSE} logs -f app"
echo "Buka https://<GARAGE_DOMAIN-mu>  lalu login & GANTI password admin."
