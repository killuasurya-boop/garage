#!/usr/bin/env bash
# =============================================================================
# Pasang pemantau VPS (scripts/vps-monitor.sh) dari laptop: salin skrip ke VPS +
# cron tiap 5 menit. Aman diulang (baris cron diganti, tidak digandakan).
#   bash scripts/install-vps-monitor.sh            # pasang / perbarui
#   bash scripts/install-vps-monitor.sh --remove   # lepas
# Butuh izin Owner (mengubah crontab VPS). Endpoint /api/jobs/system-alert harus
# sudah ter-deploy; tanpa itu monitor tetap mencatat log tapi tidak bisa memberi tahu.
# =============================================================================
set -euo pipefail
VPS="${VPS_USER:-root}@${VPS_HOST:-201.18.211.55}"
SSH_KEY="${GARAGE_DEPLOY_KEY:-$HOME/.ssh/garage_deploy}"
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes "$VPS")
cd "$(git rev-parse --show-toplevel)"

if [ "${1:-}" = "--remove" ]; then
  "${SSH[@]}" '(crontab -l 2>/dev/null | grep -v garage-monitor) | crontab -; echo "Pemantau dilepas."'
  exit 0
fi
tr -d '\r' < scripts/vps-monitor.sh | "${SSH[@]}" 'mkdir -p /root/garage/scripts && cat > /root/garage/scripts/vps-monitor.sh && chmod 755 /root/garage/scripts/vps-monitor.sh'
"${SSH[@]}" '(crontab -l 2>/dev/null | grep -v garage-monitor; echo "*/5 * * * * bash /root/garage/scripts/vps-monitor.sh >> /var/log/garage-monitor.log 2>&1 # garage-monitor") | crontab -
  bash /root/garage/scripts/vps-monitor.sh --dry-run | tail -8
  echo "Terpasang: cron tiap 5 menit, log /var/log/garage-monitor.log"'
