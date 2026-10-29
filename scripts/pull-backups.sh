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
# - Setiap file diuji (gzip utuh + penanda "dump complete") di folder sementara
#   LOKAL (bukan folder tujuan) sebelum dianggap jadi.
# - TERENKRIPSI (audit #11): bila kunci publik Owner ada (`~/.garage-ops/backup-public.asc`,
#   dibuat sekali dengan scripts/setup-backup-key.sh), folder tujuan hanya berisi `*.sql.gz.gpg`;
#   backup polos lama di folder tujuan ikut dikunci lalu dihapus. Membuka = kunci privat +
#   kata sandi Owner (scripts/restore-from-encrypted.sh). Tanpa kunci publik: tetap polos + peringatan.
#   REQUIRE_ENCRYPTION=1 → gagal bila kunci publik tidak ada.
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
PUBKEY="${BACKUP_PUBLIC_KEY:-${GARAGE_OPS_DIR:-$HOME/.garage-ops}/backup-public.asc}"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=20)

log() { echo "[pull-backups $(date '+%F %T')] $*"; }
mkdir -p "$DEST"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ENCRYPT=0
if [ -s "$PUBKEY" ]; then
  ENCRYPT=1
  export GNUPGHOME="$WORK/gnupg"
  mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
elif [ "${REQUIRE_ENCRYPTION:-0}" = 1 ]; then
  log "GAGAL: kunci publik backup tidak ada ($PUBKEY) — jalankan scripts/setup-backup-key.sh"; exit 1
else
  log "PERINGATAN: backup BELUM terenkripsi — buat kunci dengan scripts/setup-backup-key.sh"
fi

# Kunci file polos $1 → $2 (.gpg) dengan kunci publik saja; verifikasi paket lalu hapus versi polos.
encrypt_file() {
  local src="$1" out="$2"
  gpg --batch --yes --quiet --trust-model always --recipient-file "$PUBKEY" --output "$out.part" --encrypt "$src"
  # Paket harus berisi penerima kunci publik + data terenkripsi (tanpa kunci privat: --list-only).
  local packets
  packets="$(gpg --batch --list-only --list-packets "$out.part" 2>/dev/null || true)"
  if ! grep -q ":pubkey enc packet:" <<<"$packets" || ! grep -q ":encrypted data packet:" <<<"$packets"; then
    rm -f "$out.part"; log "GAGAL enkripsi $(basename "$src")"; return 1
  fi
  # Jam-ubah asli dipertahankan: retensi & "terbaru" diurutkan menurut waktu backup, bukan waktu enkripsi.
  touch -r "$src" "$out.part"
  mv "$out.part" "$out"
  rm -f "$src"
}

# Backup terbaru di VPS (harian + pre-deploy), terbaru dulu.
mapfile -t remote_files < <(ssh "${SSH_OPTS[@]}" "$VPS" "ls -1t $REMOTE_DIR/garage-*.sql.gz 2>/dev/null | head -$PULL_COUNT")
[ ${#remote_files[@]} -gt 0 ] || { log "GAGAL: tidak ada backup di $REMOTE_DIR"; exit 1; }

pulled=0
for remote in "${remote_files[@]}"; do
  name="$(basename "$remote")"
  if [ -f "$DEST/$name.gpg" ] || { [ "$ENCRYPT" = 0 ] && [ -f "$DEST/$name" ]; }; then continue; fi
  tmp="$WORK/$name"
  scp -q -p "${SSH_OPTS[@]}" "$VPS:$remote" "$tmp"
  if gzip -t "$tmp" && gzip -dc "$tmp" | tail -n 30 | grep -q "PostgreSQL database dump complete"; then
    if [ "$ENCRYPT" = 1 ]; then
      encrypt_file "$tmp" "$DEST/$name.gpg"
      rm -f "$DEST/$name"
      log "tersalin (terenkripsi): $name.gpg ($(du -h "$DEST/$name.gpg" | cut -f1))"
    else
      mv "$tmp" "$DEST/$name"
      log "tersalin: $name ($(du -h "$DEST/$name" | cut -f1))"
    fi
    pulled=$((pulled + 1))
  else
    rm -f "$tmp"
    log "GAGAL: $name tidak utuh — dilewati"
    exit 1
  fi
done

# Backup polos lama di folder tujuan → kunci, lalu hapus versi polos.
if [ "$ENCRYPT" = 1 ]; then
  for plain in "$DEST"/garage-*.sql.gz; do
    [ -f "$plain" ] || continue
    if [ -f "$plain.gpg" ]; then rm -f "$plain"; else encrypt_file "$plain" "$plain.gpg"; fi
    log "dikunci & versi polos dihapus: $(basename "$plain")"
  done
fi

# Daftar backup di folder tujuan (polos + terenkripsi), terbaru dulu. nullglob: pola kosong ≠ gagal.
list_backups() {
  local files
  shopt -s nullglob; files=("$DEST"/garage-*.sql.gz "$DEST"/garage-*.sql.gz.gpg); shopt -u nullglob
  [ ${#files[@]} -gt 0 ] && ls -1t "${files[@]}"
  return 0
}

# Simpan KEEP file terakhir.
list_backups | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; log "hapus lama: $(basename "$old")"; done

newest="$(list_backups | head -1)"
count="$(list_backups | wc -l)"
mode="$([ "$ENCRYPT" = 1 ] && echo enc || echo plain)"
ssh "${SSH_OPTS[@]}" "$VPS" "echo '$(basename "$newest") $(date -Iseconds) $(hostname) $mode' > $REMOTE_DIR/.offsite-pulled"
log "selesai: $pulled baru · terbaru $(basename "$newest") · folder $DEST ($count file, $mode)"
