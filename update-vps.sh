#!/usr/bin/env bash
# =============================================================================
# Update Garage OS ke VPS dari LAPTOP — 1 perintah, lewat SSH.
# Tanpa deploy key, tanpa browser. Pakai akses SSH yang sudah ada.
#
# Pakai:
#   ./update-vps.sh "pesan commit"     # commit perubahan (kalau ada) + deploy
#   ./update-vps.sh                    # kalau sudah commit manual, tinggal deploy
# =============================================================================
set -euo pipefail

VPS="root@156.67.214.203"
KEY="$HOME/.ssh/garage_vps"
DIR="/root/garage"
SSH="ssh -i $KEY -o ConnectTimeout=15 $VPS"

cd "$(dirname "$0")"

# 1. Commit (kalau ada perubahan) + push ke GitHub (backup/riwayat)
if [ -n "$(git status --porcelain)" ]; then
  echo ">> commit perubahan lokal..."
  git add -A
  git commit -m "${1:-update: $(date +%F_%H%M)}"
fi
echo ">> push ke GitHub..."
git push origin main

# 2. Kirim snapshot commit terbaru ke VPS (tanpa .git/node_modules/.env).
#    .env.production di VPS TIDAK tersentuh (bukan bagian commit).
echo ">> kirim kode ke VPS..."
git archive --format=tar HEAD | $SSH "tar -x -C $DIR"

# 3. Rebuild + migrasi DB otomatis (service migrate jalan sebelum app start)
echo ">> rebuild di VPS (migrasi DB otomatis)..."
$SSH "cd $DIR && docker compose --env-file .env.production up -d --build"

# 4. Status
echo ">> status container:"
$SSH "cd $DIR && docker compose --env-file .env.production ps"
echo ""
echo "Selesai. Cek: https://app.garagecoffee.id"
