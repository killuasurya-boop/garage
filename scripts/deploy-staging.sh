#!/usr/bin/env bash
# =============================================================================
# R1 — Kirim versi kode SAAT INI (branch apa pun, mis. PR yang mau dicoba) ke STAGING
# di VPS, dari laptop Owner. Produksi tidak disentuh: image ber-tag :staging, folder
# /root/garage-staging, database staging sendiri.
#
#   bash scripts/deploy-staging.sh --setup          # sekali: .env.staging + akses + Caddy
#   bash scripts/deploy-staging.sh --refresh-data   # build+kirim lalu isi data samaran baru
#   bash scripts/deploy-staging.sh                  # build+kirim versi ini saja
# Panduan: docs/STAGING.md
# =============================================================================
set -euo pipefail

VPS_HOST="${VPS_HOST:-201.18.211.55}"
VPS_USER="${VPS_USER:-root}"
STAGING_DIR="${STAGING_DIR:-/root/garage-staging}"
VPS_HOST_KEY="${VPS_HOST_KEY:-201.18.211.55 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOO6lqbnNI86okZIyf1XgoF5Rr+D8JWg4RkMurApKZwj}"
SSH_KEY="${GARAGE_DEPLOY_KEY:-$HOME/.ssh/garage_deploy}"

SETUP=0
REFRESH=0
for arg in "$@"; do
  case "$arg" in
    --setup) SETUP=1 ;;
    --refresh-data) REFRESH=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Argumen tidak dikenal: $arg"; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
for bin in git docker ssh scp gzip; do command -v "$bin" >/dev/null || { echo "Program '$bin' tidak ada."; exit 1; }; done
docker info >/dev/null 2>&1 || { echo "Docker belum jalan."; exit 1; }
[ -f "$SSH_KEY" ] || { echo "Kunci SSH tidak ditemukan: $SSH_KEY"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Ada perubahan belum di-commit — staging hanya menerima commit."; exit 1; }

KNOWN_HOSTS="$(mktemp)"
trap 'rm -f "$KNOWN_HOSTS"' EXIT
echo "$VPS_HOST_KEY" > "$KNOWN_HOSTS"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes -o ServerAliveInterval=30)
remote() { ssh "${SSH_OPTS[@]}" "$VPS_USER@$VPS_HOST" "$@"; }

SHA="$(git rev-parse --short HEAD)"
echo ">> staging ← $(git rev-parse --abbrev-ref HEAD) @ $SHA: $(git log -1 --format=%s)"

remote "mkdir -p $STAGING_DIR/scripts"
scp "${SSH_OPTS[@]}" docker-compose.staging.yml "$VPS_USER@$VPS_HOST:$STAGING_DIR/"
for f in staging-setup.sh staging-refresh.sh staging-anonymize.sql; do
  # Buang CR (checkout Windows) — dijalankan bash/psql Linux.
  tr -d '\r' < "scripts/$f" | remote "cat > $STAGING_DIR/scripts/$f"
done

if [ "$SETUP" = 1 ]; then
  echo ">> setup staging (sekali)"
  remote "bash $STAGING_DIR/scripts/staging-setup.sh"
fi
remote "test -f $STAGING_DIR/.env.staging" || { echo "Belum ada .env.staging — jalankan dengan --setup dulu."; exit 1; }

ARCH="$(remote uname -m)"
PLATFORM=linux/amd64; [ "$ARCH" = "aarch64" ] && PLATFORM=linux/arm64
echo ">> build image staging ($PLATFORM)"
docker buildx build --platform "$PLATFORM" --target runner   --load -t garage-app:staging     .
docker buildx build --platform "$PLATFORM" --target migrator --load -t garage-migrate:staging .
echo ">> kirim image ke VPS"
docker save garage-app:staging garage-migrate:staging | gzip | remote 'gunzip | docker load'

COMPOSE="docker compose -f $STAGING_DIR/docker-compose.staging.yml --env-file $STAGING_DIR/.env.staging"
if [ "$REFRESH" = 1 ]; then
  echo ">> isi ulang data staging (salinan produksi disamarkan)"
  remote "bash $STAGING_DIR/scripts/staging-refresh.sh"
else
  remote "set -e; cd $STAGING_DIR; $COMPOSE up -d db; $COMPOSE run --rm migrate; $COMPOSE up -d --no-build app"
fi

echo ">> cek kesehatan staging (dari dalam container)"
for _ in $(seq 1 20); do
  if remote "cd $STAGING_DIR && $COMPOSE exec -T app node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\" </dev/null" 2>/dev/null; then
    echo "Staging sehat · $SHA · https://staging.garagecoffee.id (password akses: $STAGING_DIR/STAGING_ACCESS.txt di VPS)"
    exit 0
  fi
  sleep 6
done
echo "Staging belum sehat — cek: ssh root@$VPS_HOST 'cd $STAGING_DIR && $COMPOSE logs --tail 80 app'"
exit 1
