# Finalisasi fee pool + payroll harian — dipanggil Windows Task Scheduler jam 23:59.
#
# Desain: memanggil endpoint HTTP (bukan akses DB langsung) supaya SERVER yang
# eksekusi. Ini penting karena DB pakai PGlite (satu penulis) — akses paralel dari
# proses lain bisa merusak .pglite-data. Membaca CRON_SECRET dari .env.local.
#
# Prasyarat: server Garage jalan di port 3001 saat jam 23:59.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"

$line = Get-Content $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -match '^CRON_SECRET=' } | Select-Object -First 1
$secret = if ($line) { ($line -replace '^CRON_SECRET=', '').Trim() } else { $null }
if (-not $secret) { Write-Output "CRON_SECRET tidak ditemukan di .env.local"; exit 1 }

# Tanggal WIB (UTC+7). Jalan tepat waktu (jam 23.xx) -> finalisasi hari yang
# sedang berakhir. Jalan terlambat (PC baru menyala setelah tengah malam,
# StartWhenAvailable) -> finalisasi KEMARIN, bukan hari baru yang baru mulai.
$wib = (Get-Date).ToUniversalTime().AddHours(7)
$target = if ($wib.Hour -ge 23) { $wib } else { $wib.AddDays(-1) }
$date = $target.ToString("yyyy-MM-dd")
$body = @{ date = $date } | ConvertTo-Json

# Log persisten (output Task Scheduler tidak tersimpan di mana pun).
$logDir = Join-Path $root "backups"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "payroll-finalize.log"

try {
  $res = Invoke-RestMethod -Uri "http://localhost:3001/api/payroll/cron/finalize" `
    -Method Post -Headers @{ "x-cron-secret" = $secret } `
    -ContentType "application/json" -Body $body -TimeoutSec 60
  $msg = "[" + (Get-Date -Format s) + "] finalize OK date=$date " + ($res | ConvertTo-Json -Compress)
  Write-Output $msg
  Add-Content -Path $log -Value $msg
} catch {
  $msg = "[" + (Get-Date -Format s) + "] finalize FAILED date=${date}: " + $_.Exception.Message
  Write-Output $msg
  Add-Content -Path $log -Value $msg
  exit 1
}
