#!/usr/bin/env bash
# =============================================================================
# Deploy Garage OS ke VPS dari laptop/PC Owner — TANPA GitHub Actions.
#
# Menjalankan langkah yang PERSIS sama dengan .github/workflows/deploy.yml:
#   1. build image app + migrate di laptop (bukan di VPS 1 vCPU)
#   2. tandai versi lama di VPS sebagai :previous (untuk rollback)
#   3. kirim image + docker-compose.yml + Caddyfile + pg-backup.sh lewat SSH
#   4. di VPS: db up → BACKUP dulu (gagal = berhenti) → migrate → app/caddy/backup up
#   5. cek kesehatan https://<domain>/api/health; gagal → rollback ke :previous
#
# Pengaman:
#   - hanya men-deploy commit yang SAMA PERSIS dengan origin/main (kode yang
#     sudah di-merge Owner), working tree harus bersih;
#   - minta ketik DEPLOY sebelum menyentuh server (lewati dengan --yes);
#   - kunci di VPS: dua deploy tidak bisa jalan bersamaan;
#   - --dry-run = cek semua prasyarat + tampilkan rencana, server TIDAK diubah.
#
# Pemakaian (Git Bash / WSL / Linux / macOS, dari folder repo):
#   bash scripts/deploy-manual.sh --dry-run
#   bash scripts/deploy-manual.sh
# Panduan lengkap: docs/DEPLOY_MANUAL.md
# =============================================================================
set -euo pipefail

VPS_HOST="${VPS_HOST:-201.18.211.55}"
VPS_USER="${VPS_USER:-root}"
APP_DIR="${APP_DIR:-/root/garage}"
VPS_HOST_KEY="${VPS_HOST_KEY:-201.18.211.55 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOO6lqbnNI86okZIyf1XgoF5Rr+D8JWg4RkMurApKZwj}"
HEALTH_URL="${HEALTH_URL:-https://garagecoffee.id/api/health}"
SSH_KEY="${GARAGE_DEPLOY_KEY:-$HOME/.ssh/garage_deploy}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

DRY_RUN=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Argumen tidak dikenal: $arg (pakai --dry-run / --yes / --help)"; exit 2 ;;
  esac
done

step() { printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || die "Jalankan dari dalam folder repo garage."

LOG_DIR="deploy-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "Log: $LOG_FILE"

# ─── 1. Prasyarat lokal ───────────────────────────────────────────────────────
step "Cek prasyarat di laptop"
for bin in git docker ssh scp gzip curl; do
  command -v "$bin" >/dev/null 2>&1 || die "Program '$bin' tidak ada. Lihat docs/DEPLOY_MANUAL.md bagian Persiapan."
done
docker info >/dev/null 2>&1 || die "Docker belum jalan. Buka Docker Desktop dulu."
docker buildx version >/dev/null 2>&1 || die "docker buildx tidak tersedia (perbarui Docker Desktop)."
[ -f "$SSH_KEY" ] || die "Kunci SSH tidak ditemukan: $SSH_KEY (atur GARAGE_DEPLOY_KEY=path/kunci)."
ok "git, docker, ssh, kunci SSH siap"

# ─── 2. Kode = origin/main yang sudah di-merge ────────────────────────────────
step "Pastikan yang di-deploy = origin/$DEPLOY_BRANCH"
git fetch --quiet origin "$DEPLOY_BRANCH"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "Ada perubahan lokal yang belum di-commit. Bersihkan dulu (git stash)."
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$DEPLOY_BRANCH")"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  die "Commit lokal ($LOCAL_SHA) ≠ origin/$DEPLOY_BRANCH ($REMOTE_SHA). Jalankan: git checkout $DEPLOY_BRANCH && git pull"
fi
ok "Commit ${LOCAL_SHA:0:7}: $(git log -1 --format=%s)"

# ─── 3. Koneksi VPS ───────────────────────────────────────────────────────────
step "Cek koneksi SSH ke VPS"
KNOWN_HOSTS="$(mktemp)"
trap 'rm -f "$KNOWN_HOSTS"' EXIT
echo "$VPS_HOST_KEY" > "$KNOWN_HOSTS"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes -o ServerAliveInterval=30)
remote() { ssh "${SSH_OPTS[@]}" "$VPS_USER@$VPS_HOST" "$@"; }
ARCH="$(remote uname -m)" || die "SSH ke $VPS_USER@$VPS_HOST gagal (kunci salah / host berubah / jaringan)."
case "$ARCH" in
  x86_64) PLATFORM=linux/amd64 ;;
  aarch64|arm64) PLATFORM=linux/arm64 ;;
  *) die "Arsitektur VPS tidak dikenal: $ARCH" ;;
esac
remote "test -f $APP_DIR/.env.production" || die "$APP_DIR/.env.production tidak ada di VPS — deploy dibatalkan."
ok "VPS $VPS_HOST ($ARCH) terjangkau, .env.production ada"

# ─── Rencana ──────────────────────────────────────────────────────────────────
cat <<PLAN

Rencana deploy:
  commit     : ${LOCAL_SHA:0:7} — $(git log -1 --format=%s)
  build      : garage-app + garage-migrate untuk $PLATFORM (di laptop)
  VPS        : $VPS_USER@$VPS_HOST:$APP_DIR
  urutan     : simpan :previous → kirim image → db up → BACKUP → migrate → app/caddy/backup up
  cek sehat  : $HEALTH_URL (gagal → rollback otomatis ke :previous)
  dampak     : app restart ±30–60 detik (POS putus sebentar). Lakukan saat outlet sepi/tutup.
PLAN

if [ "$DRY_RUN" = 1 ]; then
  echo; ok "DRY RUN selesai — semua prasyarat lolos. Server TIDAK diubah."
  exit 0
fi

if [ "$ASSUME_YES" != 1 ]; then
  printf '\nKetik DEPLOY untuk lanjut (lainnya = batal): '
  read -r answer
  [ "$answer" = "DEPLOY" ] || die "Dibatalkan. Server tidak diubah."
fi

# ─── 4. Build di laptop ───────────────────────────────────────────────────────
step "Build image ($PLATFORM) — bisa 5–15 menit"
docker buildx build --platform "$PLATFORM" --target runner   --load -t "garage-app:$LOCAL_SHA"     -t garage-app:latest     .
docker buildx build --platform "$PLATFORM" --target migrator --load -t "garage-migrate:$LOCAL_SHA" -t garage-migrate:latest .
ok "Image siap"

# ─── 5. Kunci deploy di VPS (satu deploy pada satu waktu) ─────────────────────
step "Ambil kunci deploy di VPS"
remote "mkdir $APP_DIR/.deploy-lock" 2>/dev/null \
  || die "Deploy lain sedang jalan (ada $APP_DIR/.deploy-lock). Bila yakin tidak ada, hapus folder itu di VPS lalu ulangi."
trap 'remote "rmdir $APP_DIR/.deploy-lock" >/dev/null 2>&1 || true; rm -f "$KNOWN_HOSTS"' EXIT
ok "Kunci diambil"

# ─── 6. Kirim ─────────────────────────────────────────────────────────────────
step "Kirim image & berkas ke VPS"
remote 'docker tag garage-app:latest garage-app:previous 2>/dev/null || true; docker tag garage-migrate:latest garage-migrate:previous 2>/dev/null || true'
docker save garage-app:latest garage-migrate:latest | gzip | remote 'gunzip | docker load'
remote "mkdir -p $APP_DIR/scripts $APP_DIR/backups"
remote "mkdir -p $APP_DIR/caddy-sites"
scp "${SSH_OPTS[@]}" docker-compose.yml Caddyfile "$VPS_USER@$VPS_HOST:$APP_DIR/"
# Buang CR: checkout Windows (core.autocrlf) memberi CRLF, dan bash Linux di
# container backup gagal di `set -euo pipefail\r` → deploy berhenti di backup.
tr -d '\r' < scripts/pg-backup.sh | remote "cat > $APP_DIR/scripts/pg-backup.sh"
ok "Terkirim"

# ─── 7. Backup → migrate → jalankan ───────────────────────────────────────────
step "Backup database, migrasi, lalu jalankan aplikasi"
remote "
  set -e
  cd $APP_DIR
  docker compose --env-file .env.production up -d --no-build db
  # Backup sebelum migrasi — deploy berhenti bila backup gagal.
  docker compose --env-file .env.production run --rm backup once pre-deploy
  docker compose --env-file .env.production run --rm migrate
  docker compose --env-file .env.production up -d --no-build app caddy backup
  docker compose --env-file .env.production restart backup
  docker image prune -f >/dev/null
"
ok "Aplikasi dijalankan ulang"

# ─── 8. Cek kesehatan / rollback ──────────────────────────────────────────────
step "Cek kesehatan $HEALTH_URL"
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
  if [ "$code" = "200" ]; then
    ok "Sehat (HTTP 200). Deploy ${LOCAL_SHA:0:7} SELESAI."
    exit 0
  fi
  sleep 6
done
echo "Kesehatan gagal — rollback ke versi sebelumnya"
remote "cd $APP_DIR && docker tag garage-app:previous garage-app:latest && docker compose --env-file .env.production up -d --no-build app"
die "Deploy gagal & app dikembalikan ke versi sebelumnya. Migrasi yang sudah jalan TIDAK dibatalkan (additive). Kirim $LOG_FILE ke agent."
