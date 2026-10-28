#!/usr/bin/env bash
# =============================================================================
# Pemeriksaan rilis — WAJIB lulus sebelum deploy produksi (deploy-manual.sh menolak
# commit yang belum lulus). Menguji main HASIL GABUNGAN semua PR, bukan per PR:
# insiden 29 Okt 2026 = tiap PR lulus sendiri, gabungannya tidak (katalog API).
#
#   bash scripts/release-check.sh          # semua pemeriksaan (±10 menit)
#   bash scripts/release-check.sh --quick  # tanpa vitest & build (cek cepat)
#
# Lulus → .git/garage-release-check berisi SHA commit yang diperiksa.
# =============================================================================
set -uo pipefail

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1
cd "$(git rev-parse --show-toplevel)" || exit 1
STAMP="$(git rev-parse --git-path garage-release-check)"
rm -f "$STAMP"

pass=0
fail=0
step() { printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
good() { printf '  \033[1;32m✓\033[0m %s\n' "$*"; pass=$((pass + 1)); }
bad() { printf '  \033[1;31m✗ %s\033[0m\n' "$*"; fail=$((fail + 1)); }

step "Kode yang diperiksa = origin/main, tanpa perubahan lokal"
git fetch -q origin main
SHA="$(git rev-parse HEAD)"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] && good "branch main" || bad "bukan di branch main"
[ "$SHA" = "$(git rev-parse origin/main)" ] && good "HEAD = origin/main (${SHA:0:7})" || bad "HEAD ≠ origin/main — git pull dulu"
[ -z "$(git status --porcelain --untracked-files=no)" ] && good "tidak ada perubahan belum di-commit" || bad "ada perubahan belum di-commit"

step "Berkas turunan sinkron"
npx tsx scripts/generate-api-catalog.ts >/dev/null 2>&1
if git diff --quiet -- src/lib/api-route-catalog.generated.ts; then good "katalog API (ChatGPT) sinkron dengan src/app/api"
else bad "katalog API tidak sinkron — jalankan: npx tsx scripts/generate-api-catalog.ts lalu commit"; git checkout -- src/lib/api-route-catalog.generated.ts; fi

step "Pengaman infrastruktur"
if grep -qE '^  (app|db|migrate|caddy|backup):' docker-compose.staging.yml; then bad "docker-compose.staging.yml memakai nama service produksi (insiden 28 Okt)"
else good "nama service staging tidak bentrok dengan produksi"; fi
bad_sh=""
for f in scripts/*.sh; do bash -n "$f" 2>/dev/null || bad_sh="$bad_sh $f"; done
[ -z "$bad_sh" ] && good "sintaks semua skrip bash" || bad "sintaks rusak:$bad_sh"
if git diff --name-only "$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)"..HEAD -- drizzle | grep -q '\.sql$'; then
  good "ada migrasi baru (backup otomatis sebelum migrate di deploy)"
fi

step "Typecheck & lint"
npx tsc --noEmit -p . >/tmp/rc-tsc.log 2>&1 && good "tsc" || { bad "tsc gagal (lihat /tmp/rc-tsc.log)"; tail -5 /tmp/rc-tsc.log; }
npm run lint >/tmp/rc-lint.log 2>&1 && good "lint 0 error" || { bad "lint error (lihat /tmp/rc-lint.log)"; grep -E " error " /tmp/rc-lint.log | head -5; }

if [ "$QUICK" = 0 ]; then
  step "Semua tes (vitest)"
  if npx vitest run >/tmp/rc-vitest.log 2>&1; then good "$(grep -E 'Tests ' /tmp/rc-vitest.log | tail -1 | sed 's/^ *//')"
  else bad "tes gagal (lihat /tmp/rc-vitest.log)"; grep -E "FAIL|×" /tmp/rc-vitest.log | head -10; fi
  step "Build produksi"
  npm run build >/tmp/rc-build.log 2>&1 && good "next build" || { bad "build gagal (lihat /tmp/rc-build.log)"; tail -15 /tmp/rc-build.log; }
fi

echo
if [ "$fail" -gt 0 ]; then
  printf '\033[1;31mRILIS DITOLAK: %d gagal, %d lulus.\033[0m\n' "$fail" "$pass"
  exit 1
fi
if [ "$QUICK" = 1 ]; then echo "Cek cepat lulus ($pass). Untuk deploy jalankan tanpa --quick."; exit 0; fi
echo "$SHA $(date -Iseconds)" > "$STAMP"
printf '\033[1;32mRILIS SIAP: %d pemeriksaan lulus untuk %s.\033[0m Lanjut: bash scripts/deploy-manual.sh\n' "$pass" "${SHA:0:7}"
