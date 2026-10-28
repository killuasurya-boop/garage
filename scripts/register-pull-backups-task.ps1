# Daftarkan "tarik backup ke luar VPS" harian di Windows Task Scheduler (laptop/PC Owner).
#
# - Jalan tiap hari 06:00 (setelah backup harian VPS 04:00 WIB); bila PC mati, jalan begitu menyala.
# - Menjalankan Git Bash: scripts/pull-backups.sh → folder tujuan (disarankan folder OneDrive
#   yang tersinkron, supaya backup ikut ke cloud).
# - Log: <folder tujuan>\pull-backups.log
#
# Pakai (PowerShell biasa, tanpa admin):
#   powershell -ExecutionPolicy Bypass -File scripts\register-pull-backups-task.ps1 -Dest "$env:USERPROFILE\OneDrive\Garage Backup"
# Hapus:
#   Unregister-ScheduledTask -TaskName "Garage OS Tarik Backup VPS" -Confirm:$false
param(
  [Parameter(Mandatory = $true)][string]$Dest,
  [string]$At = "06:00"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$bash = @("$env:ProgramFiles\Git\bin\bash.exe", "${env:ProgramFiles(x86)}\Git\bin\bash.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bash) { throw "Git Bash tidak ditemukan (pasang Git for Windows)." }
New-Item -ItemType Directory -Force $Dest | Out-Null
$log = Join-Path $Dest "pull-backups.log"
$destUnix = ($Dest -replace '\', '/')
$command = "cd '$($root -replace '\','/')' && BACKUP_DEST='$destUnix' bash scripts/pull-backups.sh >> '$($log -replace '\','/')' 2>&1"
$action = New-ScheduledTaskAction -Execute $bash -Argument "-lc `"$command`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Garage OS Tarik Backup VPS" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Tarik backup database Garage OS dari VPS ke $Dest (backup di luar VPS)." -Force | Out-Null
Write-Output "Terdaftar: tiap hari $At → $Dest (log: $log)"
