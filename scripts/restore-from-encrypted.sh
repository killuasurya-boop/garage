#!/usr/bin/env bash
# =============================================================================
# Buka backup TERENKRIPSI (audit #11) — butuh kunci privat + kata sandi Owner.
#
#   bash scripts/restore-from-encrypted.sh <backup.sql.gz.gpg> <kunci-PRIVATE.asc> --check
#       → dekripsi di folder sementara, uji gzip + "dump complete", lalu hapus. (uji rutin)
#   bash scripts/restore-from-encrypted.sh <backup.sql.gz.gpg> <kunci-PRIVATE.asc> --drill
#       → seperti --check + pulihkan ke Postgres 16 SEMENTARA di Docker laptop (jaringan internal
#         sendiri), cetak jumlah baris tabel inti + sidik buku kas, lalu container dihapus.
#   bash scripts/restore-from-encrypted.sh <backup.sql.gz.gpg> <kunci-PRIVATE.asc> --out <file.sql.gz>
#       → simpan hasil dekripsi untuk pemulihan sungguhan (docs/DEPLOY_VPS.md). Hapus file itu sesudahnya:
#         isinya data pelanggan & karyawan tanpa kunci.
#
# Kata sandi diketik Owner (tidak tampil, tidak disimpan). Kunci privat hanya diimpor ke
# keyring sementara yang dihapus saat skrip selesai. Tidak pernah menyentuh produksi.
# =============================================================================
set -euo pipefail

FILE="${1:-}"; PRIV="${2:-}"; MODE="${3:---check}"; OUT="${4:-}"
usage() { sed -n '4,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[ -f "$FILE" ] && [ -f "$PRIV" ] || usage
case "$MODE" in --check|--drill) ;; --out) [ -n "$OUT" ] || usage ;; *) usage ;; esac

WORK="$(mktemp -d)"
DRILL="garage-restore-local"
cleanup() {
  docker rm -f "$DRILL" >/dev/null 2>&1 || true
  docker network rm "$DRILL-net" >/dev/null 2>&1 || true
  gpgconf --homedir "$WORK/gnupg" --kill gpg-agent 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT
export GNUPGHOME="$WORK/gnupg"
mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"

if [ -n "${GARAGE_BACKUP_PASSPHRASE_FILE:-}" ]; then
  # Hanya untuk uji otomatis dengan kunci UJI sekali pakai — jangan dipakai untuk kunci Owner.
  PASS="$(cat "$GARAGE_BACKUP_PASSPHRASE_FILE")"
else
  read -rsp "Kata sandi kunci backup: " PASS; echo
fi
G=(gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0)
"${G[@]}" --import "$PRIV" <<<"$PASS" 2>/dev/null || { echo "Kunci privat tidak bisa diimpor."; exit 1; }
PLAIN="$WORK/backup.sql.gz"
if ! "${G[@]}" --output "$PLAIN" --decrypt "$FILE" <<<"$PASS" 2>/dev/null; then
  unset PASS; echo "GAGAL membuka: kata sandi salah atau kunci tidak cocok dengan backup ini."; exit 1
fi
unset PASS

gzip -t "$PLAIN" || { echo "GAGAL: hasil dekripsi bukan gzip utuh."; exit 1; }
gzip -dc "$PLAIN" | tail -n 30 | grep -q "PostgreSQL database dump complete" || { echo "GAGAL: dump tidak lengkap."; exit 1; }
echo ">> terbuka & utuh: $(basename "$FILE") ($(du -h "$PLAIN" | cut -f1) terkompresi)"

case "$MODE" in
  --check) echo "LULUS: backup bisa dibuka dengan kunci + kata sandi Owner." ;;
  --out)
    mkdir -p "$(dirname "$OUT")"
    mv "$PLAIN" "$OUT"
    echo "Tersimpan: $OUT — berisi data pribadi TANPA kunci; hapus setelah pemulihan selesai." ;;
  --drill)
    command -v docker >/dev/null || { echo "Docker tidak ada — pakai --check atau --out."; exit 1; }
    docker network create --internal "$DRILL-net" >/dev/null
    docker run -d --name "$DRILL" --network "$DRILL-net" -e POSTGRES_USER=garage -e POSTGRES_PASSWORD=drill \
      -e POSTGRES_DB=garage postgres:16-bookworm >/dev/null
    for _ in $(seq 1 90); do
      docker logs "$DRILL" 2>&1 | grep -q "PostgreSQL init process complete" && docker exec "$DRILL" pg_isready -U garage -q && break
      sleep 1
    done
    gzip -dc "$PLAIN" | docker exec -i "$DRILL" psql -q -v ON_ERROR_STOP=1 -U garage -d garage >/dev/null
    echo ">> dipulihkan ke container sementara. Jumlah baris:"
    missing=""
    for t in orders payments cash_sessions cash_ledger_entries staff_profiles menu_items; do
      n="$(docker exec "$DRILL" psql -tA -U garage -d garage -c "select count(*) from $t" 2>/dev/null | tr -d '\r' || true)"
      [ -n "$n" ] || { n="TIDAK ADA"; missing="$missing $t"; }
      printf '   %-22s %s\n' "$t" "$n"
    done
    [ -z "$missing" ] || { echo "GAGAL: tabel inti tidak ada di backup:$missing"; exit 1; }
    root="$(cd "$(dirname "$0")/.." && pwd)"
    fp="$(docker exec -i "$DRILL" psql -tA -v ON_ERROR_STOP=1 -U garage -d garage < "$root/scripts/cash-ledger-fingerprint.sql" 2>/dev/null | tr -d '\r' || true)"
    [ -n "$fp" ] || { echo "GAGAL: sidik buku kas tidak bisa dihitung."; exit 1; }
    echo ">> sidik buku kas:"; sed 's/^/   /' <<<"$fp"
    echo "   (bandingkan dengan produksi bila perlu: scripts/restore-drill.sh di VPS mencetak sidik yang sama)"
    echo "LULUS: backup terenkripsi dapat dipulihkan penuh." ;;
esac
