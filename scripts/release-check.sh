#!/usr/bin/env bash
# =============================================================================
# Pemeriksaan rilis — WAJIB lulus sebelum deploy produksi (deploy-manual.sh menolak
# commit yang belum lulus). Menguji main HASIL GABUNGAN semua PR, bukan per PR:
# insiden 29 Okt 2026 = tiap PR lulus sendiri, gabungannya tidak (katalog API).
#
#   bash scripts/release-check.sh          # semua pemeriksaan (±10 menit)
#   bash scripts/release-check.sh --quick  # tanpa vitest, build & E2E (cek cepat)
#   bash scripts/release-check.sh --skip-e2e  # darurat: tanpa E2E (tercatat di stamp)
#
# Lulus → .git/garage-release-check berisi SHA commit yang diperiksa.
# =============================================================================
set -uo pipefail

QUICK=0
SKIP_E2E=0
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --skip-e2e) SKIP_E2E=1 ;; # darurat saja: tercatat di stamp
  esac
done
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

step "Lock file cocok dengan npm di image Docker"
# Insiden 29 Okt 2026: lock dari npm 11 laptop membuang entri esbuild bersarang → `npm ci` (npm 10 di
# node:22-bookworm-slim) gagal saat build deploy. Uji dengan npm versi image di folder sementara.
IMAGE_NPM="${IMAGE_NPM:-10}"
lockdir="$(mktemp -d)"
cp package.json package-lock.json "$lockdir/"
if lock_out="$(cd "$lockdir" && npx -y "npm@$IMAGE_NPM" ci --dry-run --ignore-scripts 2>&1)"; then
  good "npm@$IMAGE_NPM ci menerima package-lock.json"
elif echo "$lock_out" | grep -qiE "ENOTFOUND|ECONNREFUSED|ETIMEDOUT"; then
  good "cek lock dilewati (offline) — ulangi saat online"
else
  bad "package-lock.json ditolak npm@$IMAGE_NPM ci — perbaiki: npx npm@$IMAGE_NPM install --package-lock-only"
  echo "$lock_out" | grep -E "npm error" | head -5
fi
rm -rf "$lockdir"

step "Keamanan dependensi produksi"
# Audit #16: tidak boleh ada kerentanan high/critical di dependensi yang ikut ke produksi.
if audit_out="$(npm audit --omit=dev --audit-level=high 2>&1)"; then
  good "npm audit (produksi): tidak ada high/critical"
elif echo "$audit_out" | grep -qiE "ENOTFOUND|ECONNREFUSED|network|audit endpoint"; then
  good "npm audit dilewati (offline) — ulangi saat online"
else
  bad "npm audit: ada kerentanan high/critical di dependensi produksi"; echo "$audit_out" | tail -8
fi

step "Typecheck & lint"
# Tipe rute sisa build branch lain di .next bisa memberi kegagalan palsu.
rm -rf .next/types .next/dev/types
npx tsc --noEmit -p . >/tmp/rc-tsc.log 2>&1 && good "tsc" || { bad "tsc gagal (lihat /tmp/rc-tsc.log)"; tail -5 /tmp/rc-tsc.log; }
npm run lint >/tmp/rc-lint.log 2>&1 && good "lint 0 error" || { bad "lint error (lihat /tmp/rc-lint.log)"; grep -E " error " /tmp/rc-lint.log | head -5; }

if [ "$QUICK" = 0 ]; then
  step "Semua tes (vitest)"
  if npx vitest run >/tmp/rc-vitest.log 2>&1; then good "$(grep -E 'Tests ' /tmp/rc-vitest.log | tail -1 | sed 's/^ *//')"
  else bad "tes gagal (lihat /tmp/rc-vitest.log)"; grep -E "FAIL|×" /tmp/rc-vitest.log | head -10; fi
  step "Build produksi"
  npm run build >/tmp/rc-build.log 2>&1 && good "next build" || { bad "build gagal (lihat /tmp/rc-build.log)"; tail -15 /tmp/rc-build.log; }
  step "E2E 5 alur kritis (Playwright, DB sementara)"
  if [ "$SKIP_E2E" = 1 ]; then
    good "E2E DILEWATI (--skip-e2e) — jalankan npm run test:e2e sebelum deploy berikutnya"
  elif npx playwright test >/tmp/rc-e2e.log 2>&1; then
    good "E2E $(grep -E '[0-9]+ passed' /tmp/rc-e2e.log | tail -1 | sed 's/^ *//')"
  else
    bad "E2E gagal (lihat /tmp/rc-e2e.log; jejak & screenshot di .e2e-data/results)"; grep -E "✘|failed|Error:" /tmp/rc-e2e.log | grep -v WebServer | head -8
  fi
fi

echo
if [ "$fail" -gt 0 ]; then
  printf '\033[1;31mRILIS DITOLAK: %d gagal, %d lulus.\033[0m\n' "$fail" "$pass"
  exit 1
fi
if [ "$QUICK" = 1 ]; then echo "Cek cepat lulus ($pass). Untuk deploy jalankan tanpa --quick."; exit 0; fi
echo "$SHA $(date -Iseconds)$([ "$SKIP_E2E" = 1 ] && echo ' skip-e2e')" > "$STAMP"
printf '\033[1;32mRILIS SIAP: %d pemeriksaan lulus untuk %s.\033[0m Lanjut: bash scripts/deploy-manual.sh\n' "$pass" "${SHA:0:7}"
