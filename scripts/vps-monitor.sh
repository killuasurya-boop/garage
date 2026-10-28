#!/usr/bin/env bash
# =============================================================================
# Pemantau VPS Garage OS — dijalankan cron tiap 5 menit di VPS (pasang dengan
# scripts/install-vps-monitor.sh). Hanya MEMBACA keadaan server; tidak mengubah apa pun.
#
# Pemeriksaan: aplikasi sehat, layanan db/caddy/backup jalan, restart berulang,
# disk ≥ 85 %, RAM tersedia < 250 MB, backup terbaru > 26 jam, backup belum ditarik ke luar VPS
# > 48 jam (bila pull-backups.sh sudah dipakai), staging tidak
# memakai nama produksi (insiden 28 Okt 2026).
#
# Peringatan → POST /api/jobs/system-alert (notifikasi + push ke HP Owner).
# Hanya perubahan keadaan yang dikirim (mulai gagal / pulih); pengingat paling
# sering 1×/jam dibatasi di server. Bila aplikasi sendiri mati, kejadian
# disimpan dan dikirim begitu aplikasi kembali ("bermasalah ±X menit").
#
#   bash vps-monitor.sh            # sekali jalan (cron)
#   bash vps-monitor.sh --dry-run  # tampilkan hasil, tanpa kirim/simpan
# =============================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/root/garage}"
STAGING_DIR="${STAGING_DIR:-/root/garage-staging}"
STATE_DIR="${STATE_DIR:-/var/lib/garage-monitor}"
DOMAIN_URL="${DOMAIN_URL:-https://garagecoffee.id}"
DISK_LIMIT="${DISK_LIMIT:-85}"
MEM_MIN_MB="${MEM_MIN_MB:-250}"
BACKUP_MAX_HOURS="${BACKUP_MAX_HOURS:-26}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

mkdir -p "$STATE_DIR"
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "[garage-monitor $(date '+%F %T')] $*"; }
envval() { grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2-; }

declare -A RESULT MESSAGE

# ── Pemeriksaan ───────────────────────────────────────────────────────────────
check_app() {
  local code
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$DOMAIN_URL/api/health" || echo 000)"
  if [ "$code" = "200" ]; then RESULT[app]=ok; MESSAGE[app]="Aplikasi sehat"; else RESULT[app]=fail; MESSAGE[app]="Health check HTTP $code"; fi
}

check_containers() {
  local missing=()
  for name in garage-app-1 garage-db-1 garage-caddy-1 garage-backup-1; do
    [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" = "true" ] || missing+=("$name")
  done
  if [ ${#missing[@]} -eq 0 ]; then RESULT[containers]=ok; MESSAGE[containers]="Semua layanan jalan"; else RESULT[containers]=fail; MESSAGE[containers]="Tidak jalan: ${missing[*]}"; fi
}

check_restarts() {
  local count prev
  count="$(docker inspect -f '{{.RestartCount}}' garage-app-1 2>/dev/null || echo 0)"
  prev="$(cat "$STATE_DIR/app-restarts" 2>/dev/null || echo "$count")"
  [ "$DRY_RUN" = 1 ] || echo "$count" > "$STATE_DIR/app-restarts"
  if [ "$count" -gt "$prev" ] 2>/dev/null; then RESULT[restarts]=fail; MESSAGE[restarts]="Aplikasi restart sendiri $((count - prev))× dalam 5 menit terakhir (cek log: docker logs garage-app-1)"; else RESULT[restarts]=ok; MESSAGE[restarts]="Tidak ada restart"; fi
}

check_disk() {
  local used
  used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
  if [ "${used:-0}" -lt "$DISK_LIMIT" ]; then RESULT[disk]=ok; MESSAGE[disk]="Disk terpakai ${used}%"; else RESULT[disk]=fail; MESSAGE[disk]="Disk terpakai ${used}% (batas ${DISK_LIMIT}%) — hapus image/backup lama"; fi
}

check_memory() {
  local avail
  avail="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
  if [ "${avail:-0}" -ge "$MEM_MIN_MB" ]; then RESULT[memory]=ok; MESSAGE[memory]="RAM tersedia ${avail} MB"; else RESULT[memory]=fail; MESSAGE[memory]="RAM tersedia tinggal ${avail} MB (batas ${MEM_MIN_MB} MB)"; fi
}

check_backup() {
  local newest age_h
  newest="$(ls -1t "$APP_DIR"/backups/garage-*.sql.gz 2>/dev/null | head -1)"
  if [ -z "$newest" ]; then RESULT[backup]=fail; MESSAGE[backup]="Tidak ada file backup di $APP_DIR/backups"; return; fi
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$newest") ) / 3600 ))
  if [ "$age_h" -le "$BACKUP_MAX_HOURS" ]; then RESULT[backup]=ok; MESSAGE[backup]="Backup terbaru ${age_h} jam lalu"; else RESULT[backup]=fail; MESSAGE[backup]="Backup terbaru ${age_h} jam lalu ($(basename "$newest")) — backup harian tidak jalan"; fi
}

check_offsite() {
  # Backup ke luar VPS (scripts/pull-backups.sh dari laptop menaruh penanda ini).
  local marker="$APP_DIR/backups/.offsite-pulled" age_h
  if [ ! -f "$marker" ]; then RESULT[offsite]=ok; MESSAGE[offsite]="Tarik backup ke luar VPS belum diaktifkan"; return; fi
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$marker") ) / 3600 ))
  if [ "$age_h" -le "${OFFSITE_MAX_HOURS:-48}" ]; then RESULT[offsite]=ok; MESSAGE[offsite]="Backup ditarik ke luar VPS ${age_h} jam lalu"
  else RESULT[offsite]=fail; MESSAGE[offsite]="Backup terakhir ditarik ke luar VPS ${age_h} jam lalu — nyalakan laptop/PC backup atau jalankan scripts/pull-backups.sh"; fi
}

check_staging_guard() {
  if [ ! -f "$STAGING_DIR/scripts/staging-network-guard.sh" ]; then RESULT[staging_guard]=ok; MESSAGE[staging_guard]="Staging tidak terpasang"; return; fi
  if out="$(bash "$STAGING_DIR/scripts/staging-network-guard.sh" 2>&1)"; then RESULT[staging_guard]=ok; MESSAGE[staging_guard]="Nama app/db hanya milik produksi"; else RESULT[staging_guard]=fail; MESSAGE[staging_guard]="$(echo "$out" | grep BAHAYA | head -1) — matikan staging"; fi
}

check_app; check_containers; check_restarts; check_disk; check_memory; check_backup; check_offsite; check_staging_guard

# ── Bandingkan dengan keadaan sebelumnya → kejadian ───────────────────────────
events=()
for key in "${!RESULT[@]}"; do
  since_file="$STATE_DIR/fail-$key"
  if [ "${RESULT[$key]}" = fail ]; then
    [ -f "$since_file" ] || { [ "$DRY_RUN" = 1 ] || now_iso > "$since_file"; }
    # Kirim setiap kali gagal; server membatasi 1 notifikasi per jam per pemeriksaan.
    events+=("{\"check\":\"$key\",\"state\":\"failing\",\"message\":$(printf '%s' "${MESSAGE[$key]}" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()[:240]))')}")
  elif [ -f "$since_file" ]; then
    since="$(cat "$since_file")"
    events+=("{\"check\":\"$key\",\"state\":\"recovered\",\"since\":\"$since\",\"message\":$(printf '%s' "${MESSAGE[$key]}" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()[:240]))')}")
    [ "$DRY_RUN" = 1 ] || echo "$since" > "$STATE_DIR/recovered-$key"
  fi
  log "$key=${RESULT[$key]} · ${MESSAGE[$key]}"
done

[ ${#events[@]} -eq 0 ] && exit 0
payload="{\"host\":\"$(hostname)\",\"events\":[$(IFS=,; echo "${events[*]}")]}"
if [ "$DRY_RUN" = 1 ]; then echo "$payload"; exit 0; fi

secret="$(envval "$APP_DIR/.env.production" GARAGE_JOB_SECRET)"
[ -n "$secret" ] || secret="$(envval "$APP_DIR/.env.production" CRON_SECRET)"
code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST "$DOMAIN_URL/api/jobs/system-alert" \
  -H "Authorization: Bearer $secret" -H 'content-type: application/json' --data "$payload" || echo 000)"
if [ "$code" = "200" ]; then
  # Pemulihan sudah terkirim → hapus penanda gagal.
  for key in "${!RESULT[@]}"; do
    [ "${RESULT[$key]}" = ok ] && rm -f "$STATE_DIR/fail-$key" "$STATE_DIR/recovered-$key"
  done
  log "terkirim (${#events[@]} kejadian)"
else
  # Aplikasi tidak bisa menerima (mis. sedang mati) — penanda tetap; dicoba lagi 5 menit kemudian.
  log "gagal kirim HTTP $code — dicoba lagi berikutnya"
fi
