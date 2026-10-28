#!/usr/bin/env bash
# =============================================================================
# Uji pulih backup (restore drill) — membuktikan backup BISA dipulihkan, tanpa
# menyentuh database produksi. Dijalankan di VPS (lewat laptop: lihat bawah).
#
#   1. Ambil backup terbaru di /root/garage/backups (atau BACKUP_FILE=…).
#   2. Pulihkan ke container Postgres SEMENTARA (`garage-restore-drill`) di jaringan
#      Docker-nya sendiri — TIDAK pernah ikut garage_default (insiden 28 Okt 2026).
#   3. Bandingkan: sidik buku kas (scripts/cash-ledger-fingerprint.sql) + jumlah
#      baris tabel inti, backup vs produksi. Produksi hanya DIBACA.
#   4. Hapus container & volume sementara (juga bila gagal).
#
# Sidik buku kas identik hanya bila tidak ada transaksi kas sejak backup dibuat —
# jalankan saat outlet tutup, sesudah `backup once manual`, atau baca selisihnya
# sebagai transaksi yang terjadi setelah backup.
#
# Dari laptop:  tr -d '\r' < scripts/restore-drill.sh | ssh root@VPS 'bash -s'
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/root/garage}"
NAME="garage-restore-drill"
NET="garage-restore-drill-net"
cd "$APP_DIR"
envval() { grep -E "^$1=" .env.production | tail -1 | cut -d= -f2-; }
PG_USER="$(envval POSTGRES_USER)"
PG_DB="$(envval POSTGRES_DB)"
FILE="${BACKUP_FILE:-$(ls -1t backups/garage-*.sql.gz | head -1)}"
[ -f "$FILE" ] || { echo "Backup tidak ditemukan."; exit 1; }

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo ">> backup: $(basename "$FILE") ($(du -h "$FILE" | cut -f1), $(( ( $(date +%s) - $(stat -c %Y "$FILE") ) / 60 )) menit lalu)"
gzip -t "$FILE" && echo "   gzip utuh"

docker network create --internal "$NET" >/dev/null
docker run -d --name "$NAME" --network "$NET" --memory 384m --cpus 0.5 \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB="$PG_DB" postgres:16-bookworm >/dev/null
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -q -U "$PG_USER" -d "$PG_DB" && break; sleep 2; done

start=$(date +%s)
gunzip -c "$FILE" | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" >/dev/null
echo ">> dipulihkan dalam $(( $(date +%s) - start )) detik ke container sementara"

PROD=(docker compose --env-file .env.production exec -T db psql -U "$PG_USER" -d "$PG_DB" -At)
DRILL=(docker exec -i "$NAME" psql -U "$PG_USER" -d "$PG_DB" -At)

COUNT_SQL="select 'orders', count(*) from orders union all select 'payments', count(*) from payments
 union all select 'cash_sessions', count(*) from cash_sessions union all select 'cash_ledger_entries', count(*) from cash_ledger_entries
 union all select 'staff_profiles', count(*) from staff_profiles union all select 'menu_items', count(*) from menu_items
 union all select 'audit_logs', count(*) from audit_logs union all select 'drizzle_migrations', count(*) from drizzle.__drizzle_migrations"

echo ">> jumlah baris (backup | produksi sekarang)"
paste -d'|' <(echo "$COUNT_SQL" | "${DRILL[@]}") <(echo "$COUNT_SQL" | "${PROD[@]}" | cut -d'|' -f2) | awk -F'|' '{printf "   %-22s %8s | %8s %s\n", $1, $2, $3, ($2==$3 ? "" : "(berubah sejak backup)")}'

"${DRILL[@]}" < scripts/cash-ledger-fingerprint.sql > /tmp/fp-drill.txt
"${PROD[@]}" < scripts/cash-ledger-fingerprint.sql > /tmp/fp-prod.txt
if diff -q /tmp/fp-drill.txt /tmp/fp-prod.txt >/dev/null; then
  echo ">> sidik buku kas IDENTIK: saldo, referensi & riwayat utuh"
  verdict="LULUS"
else
  echo ">> sidik buku kas berbeda — normal bila ada transaksi kas setelah backup:"
  diff /tmp/fp-drill.txt /tmp/fp-prod.txt | sed 's/^/   /' || true
  verdict="LULUS (backup dapat dipulihkan; buku kas bertambah sejak backup)"
fi
rm -f /tmp/fp-drill.txt /tmp/fp-prod.txt
echo "RESTORE DRILL: $verdict — $(basename "$FILE")"
