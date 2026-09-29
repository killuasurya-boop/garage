# Daftarkan backup harian Garage OS di Windows Task Scheduler.
#
# - Jalan tiap hari jam 23:45 (setelah tutup toko, sebelum finalisasi payroll 23:59).
# - "StartWhenAvailable": bila PC mati jam 23:45, backup jalan begitu PC menyala lagi.
# - Menjalankan: node --env-file=.env.local scripts/backup.mjs
#   (salin .pglite-data + verifikasi + salinan offsite bila GARAGE_BACKUP_OFFSITE_DIR diisi).
# - Log: backups\backup-task.log
#
# Pakai (PowerShell biasa, tidak perlu admin untuk task milik user sendiri):
#   powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
# Hapus task:
#   Unregister-ScheduledTask -TaskName "Garage OS Backup Harian" -Confirm:$false
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$log = Join-Path $root "backups\backup-task.log"
New-Item -ItemType Directory -Force (Join-Path $root "backups") | Out-Null

$command = "Set-Location -LiteralPath '$root'; & '$node' --env-file=.env.local scripts/backup.mjs *>> '$log'"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$command`"" `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At "23:45"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName "Garage OS Backup Harian" -Action $action -Trigger $trigger `
  -Settings $settings -Description "Backup harian DB Garage OS (PGlite) + verifikasi." -Force | Out-Null

Write-Output "Task 'Garage OS Backup Harian' terdaftar: tiap hari 23:45 (jalan saat PC menyala bila terlewat)."
Write-Output "Log: $log"
