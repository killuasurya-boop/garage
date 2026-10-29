#!/usr/bin/env bash
# =============================================================================
# Smoke test produksi SETELAH deploy (hanya membaca; tanpa login, tanpa data).
# Memastikan halaman utama hidup DAN endpoint rahasia tetap menolak tanpa sesi.
#   bash scripts/smoke-prod.sh [https://garagecoffee.id]
# Keluar 1 bila ada yang gagal (deploy-manual.sh lalu rollback otomatis).
# =============================================================================
set -uo pipefail
BASE="${1:-${SMOKE_BASE:-https://garagecoffee.id}}"
fails=0
expect() { # expect <method> <path> <kode yang diterima, dipisah |> <keterangan>
  local code
  code="$(curl -s -o /dev/null -m 20 -X "$1" -w '%{http_code}' "$BASE$2" || echo 000)"
  if [[ "|$3|" == *"|$code|"* ]]; then printf '  ✓ %-6s %-42s %s (%s)\n' "$1" "$2" "$code" "$4"
  else printf '  ✗ %-6s %-42s %s, harusnya %s (%s)\n' "$1" "$2" "$code" "$3" "$4"; fails=$((fails + 1)); fi
}
echo "Smoke test $BASE"
expect GET  /api/health                         200     "aplikasi & database hidup"
expect GET  /                                   200     "halaman depan"
expect GET  /login                              200     "halaman login staf"
expect GET  /order                              200     "menu digital pelanggan"
expect GET  /api/reports/owner-official         401     "laporan Owner tanpa sesi ditolak"
expect GET  /api/control/cash-oversight         401     "pengawasan kas tanpa sesi ditolak"
expect GET  /api/admin/users                    401     "kelola staf tanpa sesi ditolak"
expect GET  /api/finance/cash-sessions/daily    401     "data kas tanpa sesi ditolak"
expect POST /api/jobs/system-alert              401     "endpoint monitor tanpa rahasia ditolak"
expect POST /api/mcp/chatgpt                    "401|404" "MCP ChatGPT tanpa token ditolak"
# Header keamanan (audit #12): CSP (report-only) & HSTS harus ada di halaman utama.
headers="$(curl -sI -m 20 "$BASE/" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
header_check() { # $1 = pola grep (huruf kecil), $2 = label
  if grep -qE "$1" <<<"$headers"; then printf '  ✓ header %s\n' "$2"; else printf '  ✗ header %s tidak ada\n' "$2"; fails=$((fails + 1)); fi
}
header_check '^content-security-policy-report-only:' "content-security-policy-report-only"
header_check '^strict-transport-security:.*includesubdomains' "strict-transport-security (includeSubDomains)"
header_check '^x-frame-options:' "x-frame-options"
if [ "$fails" -gt 0 ]; then echo "SMOKE GAGAL: $fails pemeriksaan"; exit 1; fi
echo "SMOKE OK"
