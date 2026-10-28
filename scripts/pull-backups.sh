#!/usr/bin/env bash
# =============================================================================
# Backup ke LUAR VPS (29 Okt 2026): tarik backup database terbaru dari VPS ke
# laptop/PC Owner. Arahkan BACKUP_DEST ke folder OneDrive/Google Drive yang
# tersinkron → backup otomatis ikut ke cloud tanpa layanan baru.
#
#   bash scripts/pull-backups.sh                       # ke ~/GarageBackups
#   BACKUP_DEST="$HOME/OneDrive/Garage Backup" bash scripts/pull-backups.sh
#
# - Hanya MEMBACA dari VPS (scp), lalu menaruh penanda `.offsite-pulled` di VPS
#   supaya pemantau server tahu kapan terakhir backup keluar (peringatan > 48 jam).
# - Setiap file diuji (gzip utuh + penanda "dump complete") sebelum dianggap jadi.
# - Simpan 30 file terakhir; file lama di folder tujuan dihapus.
# - File berisi data pelanggan & karyawan: simpan di folder pribadi Owner saja.
# =============================================================================
set -euo pipefail

VPS="${VPS_USER:-root}@${VPS_HOST:-201.18.211.55}"
SSH_KEY="${GARAGE_DEPLOY_KEY:-$HOME/.ssh/garage_deploy}"
REMOTE_DIR="${REMOTE_DIR:-/root/garage/backups}"
DEST="${BACKUP_DEST:-$HOME/GarageBackups}"
KEEP="${BACKUP_KEEP:-30}"
PULL_COUNT="${PULL_COUNT:-3}"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=20)

log() { echo "[pull-backups $(date '+%F %T')] $*"; }
mkdir -p "$DEST"

# Backup terbaru di VPS (harian + pre-deploy), terbaru dulu.
mapfile -t remote_files < <(ssh "${SSH_OPTS[@]}" "$VPS" "ls -1t $REMOTE_DIR/garage-*.sql.gz 2>/dev/null | head -$PULL_COUNT")
[ ${#remote_files[@]} -gt 0 ] || { log "GAGAL: tidak ada backup di $REMOTE_DIR"; exit 1; }

pulled=0
for remote in "${remote_files[@]}"; do
  name="$(basename "$remote")"
  if [ -f "$DEST/$name" ]; then continue; fi
  tmp="$DEST/$name.part"
  scp -q -p "${SSH_OPTS[@]}" "$VPS:$remote" "$tmp"
  if gzip -t "$tmp" && gzip -dc "$tmp" | tail -n 30 | grep -q "PostgreSQL database dump complete"; then
    mv "$tmp" "$DEST/$name"
    pulled=$((pulled + 1))
    log "tersalin: $name ($(du -h "$DEST/$name" | cut -f1))"
  else
    rm -f "$tmp"
    log "GAGAL: $name tidak utuh — dilewati"
    exit 1
  fi
done

# Simpan KEEP file terakhir.
ls -1t "$DEST"/garage-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; log "hapus lama: $(basename "$old")"; done

newest="$(ls -1t "$DEST"/garage-*.sql.gz | head -1)"
ssh "${SSH_OPTS[@]}" "$VPS" "echo '$(basename "$newest") $(date -Iseconds) $(hostname)' > $REMOTE_DIR/.offsite-pulled"
log "selesai: $pulled baru · terbaru $(basename "$newest") · folder $DEST ($(ls -1 "$DEST"/garage-*.sql.gz | wc -l) file)"
