#!/usr/bin/env bash
# =============================================================================
# Buat KUNCI ENKRIPSI BACKUP milik Owner — sekali saja (audit 29 Okt 2026 #11).
#
#   bash scripts/setup-backup-key.sh /e/GarageKunci      # folder flashdisk / tempat aman
#
# - Kata sandi diketik Owner di layar ini (tidak tampil, tidak disimpan di mana pun).
# - Kunci PUBLIK → %USERPROFILE%\.garage-ops\backup-public.asc (dipakai jadwal harian untuk MENGUNCI).
# - Kunci PRIVAT (tetap terkunci kata sandi) → folder yang Owner pilih (flashdisk / password manager).
#   JANGAN simpan kunci privat di OneDrive. Tanpa kunci privat + kata sandi, backup tidak bisa dibuka.
# - Uji mandiri: file contoh dikunci lalu dibuka lagi dengan kata sandi tadi.
# =============================================================================
set -euo pipefail

PRIV_DIR="${1:-}"
[ -n "$PRIV_DIR" ] || { echo "Pakai: bash scripts/setup-backup-key.sh <folder kunci privat, mis. /e/GarageKunci>"; exit 2; }
OPS_DIR="${GARAGE_OPS_DIR:-$HOME/.garage-ops}"
PUB="$OPS_DIR/backup-public.asc"
mkdir -p "$OPS_DIR" "$PRIV_DIR"
case "$(cd "$PRIV_DIR" && pwd)" in
  *OneDrive*|*onedrive*) echo "Kunci privat TIDAK boleh di folder OneDrive. Pilih flashdisk/folder lain."; exit 2 ;;
esac
if [ -f "$PUB" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "Kunci publik sudah ada: $PUB (fingerprint $(cat "$OPS_DIR/backup-fingerprint" 2>/dev/null))."
  echo "Membuat kunci baru membuat backup lama hanya bisa dibuka dengan kunci lama. Ulangi dengan FORCE=1 bila yakin."
  exit 1
fi

read -rsp "Kata sandi kunci backup (min. 12 karakter): " PASS1; echo
read -rsp "Ulangi kata sandi: " PASS2; echo
[ "$PASS1" = "$PASS2" ] || { echo "Kata sandi tidak sama."; exit 1; }
[ "${#PASS1}" -ge 12 ] || { echo "Kata sandi minimal 12 karakter."; exit 1; }

HOMEDIR="$(mktemp -d)"
trap 'rm -rf "$HOMEDIR"' EXIT
G=(gpg --homedir "$HOMEDIR" --batch --pinentry-mode loopback --passphrase-fd 0)

"${G[@]}" --quick-gen-key "Garage OS Backup <backup@garagecoffee.id>" rsa4096 cert,sign 10y <<<"$PASS1" 2>/dev/null
FPR="$(gpg --homedir "$HOMEDIR" --list-keys --with-colons | awk -F: '/^fpr/ {print $10; exit}')"
"${G[@]}" --quick-add-key "$FPR" rsa4096 encr 10y <<<"$PASS1" 2>/dev/null
# Tulis dulu ke folder sementara; baru dipindah ke tempat akhir setelah uji mandiri lulus.
gpg --homedir "$HOMEDIR" --armor --export "$FPR" > "$HOMEDIR/public.asc"
"${G[@]}" --armor --export-secret-keys "$FPR" > "$HOMEDIR/private.asc" <<<"$PASS1"

# Uji mandiri: kunci dengan kunci publik saja, buka di keyring KOSONG lain dengan kunci privat + kata sandi.
SAMPLE="$HOMEDIR/uji.txt"
echo "uji backup Garage $(date -Iseconds)" > "$SAMPLE"
gpg --homedir "$HOMEDIR" --batch --yes --quiet --trust-model always --recipient-file "$HOMEDIR/public.asc" \
  --output "$SAMPLE.gpg" --encrypt "$SAMPLE"
CHECK="$HOMEDIR/check"; mkdir -p "$CHECK"; chmod 700 "$CHECK"
C=(gpg --homedir "$CHECK" --batch --quiet --pinentry-mode loopback --passphrase-fd 0)
"${C[@]}" --import "$HOMEDIR/private.asc" <<<"$PASS1" 2>/dev/null
"${C[@]}" --output "$SAMPLE.out" --decrypt "$SAMPLE.gpg" <<<"$PASS1" 2>/dev/null
cmp -s "$SAMPLE" "$SAMPLE.out" || { echo "GAGAL uji kunci/buka — tidak ada file yang disimpan."; exit 1; }
unset PASS1 PASS2
gpgconf --homedir "$CHECK" --kill gpg-agent 2>/dev/null || true
gpgconf --homedir "$HOMEDIR" --kill gpg-agent 2>/dev/null || true

PRIV="$PRIV_DIR/garage-backup-PRIVATE-$FPR.asc"
mv "$HOMEDIR/private.asc" "$PRIV"
mv "$HOMEDIR/public.asc" "$PUB"
echo "$FPR" > "$OPS_DIR/backup-fingerprint"

echo "Kunci backup siap."
echo "  Fingerprint : $FPR"
echo "  Publik      : $PUB  (dipakai jadwal harian)"
echo "  PRIVAT      : $PRIV"
echo "Simpan file PRIVAT + kata sandi di tempat aman (flashdisk/password manager). Hilang = backup tidak bisa dibuka."
