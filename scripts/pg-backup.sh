#!/usr/bin/env bash
# =============================================================================
# Backup PostgreSQL Garage OS (VPS / docker-compose service `backup`).
#
#   pg-backup.sh daemon          → jalan terus: 1× sehari setelah jam BACKUP_HOUR
#                                  WIB (default 04:00) + 1× saat pertama start
#                                  bila belum ada backup sama sekali.
#   pg-backup.sh once <label>    → satu backup sekarang (mis. "pre-deploy"),
#                                  dipanggil deploy.yml SEBELUM migrasi.
#
# Koneksi lewat env standar libpq: PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
# Hasil: $BACKUP_DIR/garage-<label>-<YYYY-MM-DD>_<HHMMSS>.sql.gz (plain SQL,
# --clean --if-exists → bisa langsung di-restore ke DB yang sudah ada).
# Setiap file diuji (gzip utuh + penanda "dump complete") sebelum dianggap jadi;
# file gagal tidak pernah menggantikan backup lama.
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_HOUR="${BACKUP_HOUR:-4}"            # jam WIB backup harian
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}" # simpan backup harian N hari
BACKUP_KEEP_OTHER="${BACKUP_KEEP_OTHER:-10}" # simpan N backup pre-deploy/manual terakhir

# Waktu WIB tanpa bergantung pada tzdata di image (UTC+7, tanpa DST).
wib() { date -u -d '+7 hours' "$@"; }
log() { echo "[pg-backup $(wib '+%F %T') WIB] $*"; }

wait_for_db() {
  local tries=0
  until pg_isready -q; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      log "Database tidak siap setelah 60 detik."
      return 1
    fi
    sleep 2
  done
}

backup() {
  local label="$1"
  mkdir -p "$BACKUP_DIR"
  wait_for_db
  local final="$BACKUP_DIR/garage-${label}-$(wib '+%F_%H%M%S').sql.gz"
  local tmp="$final.partial"
  log "Mulai backup ($label) → $(basename "$final")"
  if ! pg_dump --no-owner --no-privileges --clean --if-exists | gzip -6 > "$tmp"; then
    rm -f "$tmp"
    log "GAGAL: pg_dump error."
    return 1
  fi
  if ! gzip -t "$tmp" || ! gzip -dc "$tmp" | tail -n 30 | grep -q "PostgreSQL database dump complete"; then
    rm -f "$tmp"
    log "GAGAL: file backup tidak utuh."
    return 1
  fi
  mv "$tmp" "$final"
  log "Selesai: $(basename "$final") ($(du -h "$final" | cut -f1))"
  prune
}

prune() {
  # Harian: hapus yang lebih tua dari BACKUP_KEEP_DAYS hari.
  find "$BACKUP_DIR" -maxdepth 1 -name 'garage-daily-????-??-??_??????.sql.gz' -mtime +"$BACKUP_KEEP_DAYS" -print -delete \
    | sed 's/^/[pg-backup] hapus lama: /' || true
  # Lainnya (pre-deploy, manual): simpan BACKUP_KEEP_OTHER terbaru. HANYA file
  # buatan skrip ini (garage-<label>-YYYY-MM-DD_HHMMSS.sql.gz) — backup lain di
  # folder yang sama (mis. cron lama garage-YYYYMMDD-HHMMSS.*) tidak disentuh.
  ls -1t "$BACKUP_DIR"/garage-*.sql.gz 2>/dev/null \
    | grep -E '/garage-[a-z][a-z-]*-[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.sql\.gz$' \
    | grep -v '/garage-daily-' \
    | tail -n +"$((BACKUP_KEEP_OTHER + 1))" | while read -r old; do
      rm -f "$old" && echo "[pg-backup] hapus lama: $old"
    done || true
  # Sisa dump yang terputus (bukan yang sedang berjalan di proses lain).
  find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -mmin +180 -delete 2>/dev/null || true
}

daemon() {
  mkdir -p "$BACKUP_DIR"
  log "Daemon aktif: backup harian setelah jam ${BACKUP_HOUR}:00 WIB, simpan ${BACKUP_KEEP_DAYS} hari → $BACKUP_DIR"
  if ! ls "$BACKUP_DIR"/garage-daily-*.sql.gz >/dev/null 2>&1; then
    backup daily || log "Backup awal gagal, dicoba lagi 10 menit."
  fi
  while true; do
    local today hour
    today="$(wib '+%F')"
    hour="$((10#$(wib '+%H')))"
    if [ "$hour" -ge "$BACKUP_HOUR" ] && ! ls "$BACKUP_DIR"/garage-daily-"$today"_*.sql.gz >/dev/null 2>&1; then
      backup daily || log "Backup harian gagal, dicoba lagi 10 menit."
    fi
    sleep 600
  done
}

case "${1:-daemon}" in
  daemon) daemon ;;
  once) backup "${2:-manual}" ;;
  *)
    echo "Pakai: pg-backup.sh daemon | once <label>" >&2
    exit 2
    ;;
esac
