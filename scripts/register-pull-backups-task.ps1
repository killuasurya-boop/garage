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
# Skrip disalin ke folder tetap: task tidak boleh bergantung pada folder repo yang bisa dipindah/dihapus.
$opsDir = Join-Path $env:USERPROFILE ".garage-ops"
New-Item -ItemType Directory -Force $opsDir | Out-Null
$script = Join-Path $opsDir "pull-backups.sh"
[IO.File]::WriteAllText($script, ((Get-Content -Raw (Join-Path $root "scripts\pull-backups.sh")) -replace "`r`n", "`n"))
# Jalur Windows → jalur Git Bash (garis miring maju); .Replace() = teks biasa, bukan regex.
$destUnix = $Dest.Replace([char]92, [char]47)
$scriptUnix = $script.Replace([char]92, [char]47)
$logUnix = $log.Replace([char]92, [char]47)
$command = "BACKUP_DEST='$destUnix' bash '$scriptUnix' >> '$logUnix' 2>&1"
$action = New-ScheduledTaskAction -Execute $bash -Argument "-lc `"$command`"" -WorkingDirectory $opsDir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Garage OS Tarik Backup VPS" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Tarik backup database Garage OS dari VPS ke $Dest (backup di luar VPS)." -Force | Out-Null
Write-Output "Terdaftar: tiap hari $At ke $Dest (skrip: $script, log: $log)"
