#!/usr/bin/env bash
# =============================================================================
# R1 — Siapkan staging SEKALI di VPS (dijalankan oleh scripts/deploy-staging.sh --setup).
#   1. /root/garage-staging/.env.staging dari .env.production produksi, dengan:
#      domain staging, DB staging sendiri (password baru), semua pengiriman keluar MATI
#      (WhatsApp, sosmed, ElevenLabs, MCP ChatGPT), kunci API AI & POS dihapus/diganti.
#      BETTER_AUTH_SECRET staging SENDIRI (audit #14: staging bobol ≠ sesi produksi bisa dipalsukan);
#      2FA & kunci OAuth salinan dikosongkan oleh staging-anonymize.sql. PIN absen tetap terbaca (PIN_PEPPER).
#   2. Password akses staging (basic auth, user "staging") → STAGING_ACCESS.txt (chmod 600).
#   3. /root/garage/caddy-sites/staging.caddy lalu reload Caddy (tanpa restart, tanpa downtime).
# Aman diulang: .env.staging & password yang sudah ada tidak ditimpa.
# =============================================================================
set -euo pipefail

PROD_DIR="${PROD_DIR:-/root/garage}"
STAGING_DIR="${STAGING_DIR:-/root/garage-staging}"
STAGING_DOMAIN="${STAGING_DOMAIN:-staging.garagecoffee.id}"

cd "$STAGING_DIR"
[ -f "$PROD_DIR/.env.production" ] || { echo "ERROR: $PROD_DIR/.env.production tidak ada."; exit 1; }
rnd() { head -c 32 /dev/urandom | base64 | tr -d '/+=\n' | cut -c1-32; }

if [ ! -f .env.staging ]; then
  db_pass="$(rnd)"
  {
    echo "# Dibuat scripts/staging-setup.sh $(date -Iseconds). STAGING — jangan dipakai produksi."
    # Salin semua kunci produksi KECUALI yang diganti/dihapus di bawah.
    grep -E '^[A-Z0-9_]+=' "$PROD_DIR/.env.production" | grep -vE '^(BETTER_AUTH_SECRET|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|DATABASE_URL|BETTER_AUTH_URL|GARAGE_DOMAIN|GARAGE_PUBLIC_BASE_URL|NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL|GARAGE_TRUSTED_ORIGINS|WHATSAPP_MESSAGING_LIVE_ENABLED|SOCIAL_PUBLISHING_LIVE_ENABLED|ELEVENLABS_TTS_ENABLED|ELEVENLABS_API_KEY|OPENAI_API_KEY|OPENAI_GARAGE_VECTOR_STORE_ID|GEMINI_API_KEY|GARAGE_MCP_CHATGPT_ENABLED|GARAGE_POS_API_KEY|CRON_SECRET|GARAGE_JOB_SECRET|GARAGE_SEED_DEMO|MARKETING_SENDER_PROVIDER|GARAGE_BACKUP_DIR)='
    echo "BETTER_AUTH_SECRET=$(rnd)$(rnd)"
    echo "POSTGRES_USER=garage_staging"
    echo "POSTGRES_PASSWORD=$db_pass"
    echo "POSTGRES_DB=garage_staging"
    echo "DATABASE_URL=postgresql://garage_staging:$db_pass@staging-db:5432/garage_staging"
    echo "BETTER_AUTH_URL=https://$STAGING_DOMAIN"
    echo "GARAGE_DOMAIN=$STAGING_DOMAIN"
    echo "GARAGE_PUBLIC_BASE_URL=https://$STAGING_DOMAIN"
    echo "NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL=https://$STAGING_DOMAIN"
    echo "GARAGE_TRUSTED_ORIGINS=https://$STAGING_DOMAIN"
    echo "WHATSAPP_MESSAGING_LIVE_ENABLED=false"
    echo "SOCIAL_PUBLISHING_LIVE_ENABLED=false"
    echo "ELEVENLABS_TTS_ENABLED=false"
    echo "GARAGE_MCP_CHATGPT_ENABLED=false"
    echo "MARKETING_SENDER_PROVIDER=none"
    echo "GARAGE_SEED_DEMO=false"
    echo "GARAGE_POS_API_KEY=$(rnd)"
    echo "CRON_SECRET=$(rnd)"
    echo "GARAGE_JOB_SECRET=$(rnd)"
    echo "GARAGE_STAGING=true"
  } > .env.staging
  chmod 600 .env.staging
  echo ">> .env.staging dibuat (pengiriman keluar mati, kunci AI/POS tidak disalin)."
else
  echo ">> .env.staging sudah ada — tidak diubah."
fi
# Audit #14: .env.staging lama yang masih memakai secret produksi → ganti dengan secret baru.
prod_secret="$(grep -E '^BETTER_AUTH_SECRET=' "$PROD_DIR/.env.production" | tail -1 | cut -d= -f2-)"
if grep -qxF "BETTER_AUTH_SECRET=$prod_secret" .env.staging; then
  sed -i "/^BETTER_AUTH_SECRET=/d" .env.staging
  echo "BETTER_AUTH_SECRET=$(rnd)$(rnd)" >> .env.staging
  echo ">> BETTER_AUTH_SECRET staging diganti (tidak lagi sama dengan produksi)."
fi
# Insiden 28 Okt: host DB staging dulu "db" (bentrok dengan DB produksi di garage_default).
sed -i "s#@db:5432/#@staging-db:5432/#" .env.staging

if [ ! -f STAGING_ACCESS.txt ]; then
  access_pass="$(rnd | cut -c1-20)"
  hash="$(docker run --rm caddy:2 caddy hash-password --plaintext "$access_pass")"
  mkdir -p "$PROD_DIR/caddy-sites"
  cat > "$PROD_DIR/caddy-sites/staging.caddy" <<CADDY
# Staging Garage OS (R1) — dibuat scripts/staging-setup.sh. Hapus file ini + reload Caddy untuk mematikan.
$STAGING_DOMAIN {
	encode gzip zstd
	header X-Robots-Tag "noindex, nofollow"
	header -Server
	basic_auth {
		staging $hash
	}
	reverse_proxy garage-staging-app:3000 {
		header_up X-Real-IP {remote_host}
	}
}
CADDY
  {
    echo "Akses staging: https://$STAGING_DOMAIN"
    echo "Login browser (basic auth): user staging / password $access_pass"
    echo "Setelah itu login Garage OS dengan email & password produksi — TANPA 2FA (rahasia 2FA tidak disalin ke staging)."
  } > STAGING_ACCESS.txt
  chmod 600 STAGING_ACCESS.txt
  echo ">> Password akses staging dibuat: $STAGING_DIR/STAGING_ACCESS.txt (hanya root)."
fi

# Muat ulang Caddy produksi (graceful). Butuh mount ./caddy-sites (docker-compose.yml produksi).
if docker compose -f "$PROD_DIR/docker-compose.yml" --env-file "$PROD_DIR/.env.production" exec -T caddy test -d /etc/caddy/sites </dev/null; then
  docker compose -f "$PROD_DIR/docker-compose.yml" --env-file "$PROD_DIR/.env.production" exec -T caddy \
    caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null
  echo ">> Caddy dimuat ulang."
else
  echo "PERINGATAN: Caddy produksi belum punya mount /etc/caddy/sites — deploy produksi versi terbaru dulu."
fi
