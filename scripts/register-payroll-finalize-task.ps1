# Daftarkan ulang task finalisasi payroll harian (GaragePayrollFinalize).
#
# Perbaikan dari task lama (temuan QA-audit 2026-09-28):
# - Laptop kasir punya baterai: task lama "DisallowStartIfOnBatteries" -> tidak
#   jalan kalau charger dicabut jam 23:59. Sekarang tetap jalan di baterai.
# - Task lama tanpa "StartWhenAvailable" -> kalau PC mati/tidur jam 23:59,
#   finalisasi hari itu hilang. Sekarang jalan begitu PC menyala lagi
#   (skrip otomatis memfinalisasi KEMARIN bila dijalankan setelah tengah malam).
# - Batas waktu 10 menit (lama: 72 jam).
#
# Pakai (PowerShell biasa):
#   powershell -ExecutionPolicy Bypass -File scripts\register-payroll-finalize-task.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root "scripts\payroll-finalize.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At "23:59"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName "GaragePayrollFinalize" -Action $action -Trigger $trigger `
  -Settings $settings -Description "Finalisasi fee pool + payroll harian Garage OS (Payroll V2)." -Force | Out-Null

Write-Output "Task 'GaragePayrollFinalize' terdaftar ulang: tiap hari 23:59, jalan di baterai, susulan saat PC menyala."
Write-Output ("Log: " + (Join-Path $root "backups\payroll-finalize.log"))
