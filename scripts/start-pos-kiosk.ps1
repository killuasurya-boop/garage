param(
  [string]$Url = "http://localhost:3001/pos?kiosk=1"
)

$ErrorActionPreference = "Stop"

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)

$edgeCandidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$browserPath = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$browserName = "Chrome"

if (-not $browserPath) {
  $browserPath = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  $browserName = "Edge"
}

if (-not $browserPath) {
  throw "Chrome or Edge was not found. Install Chrome or Edge to launch Garage POS kiosk."
}

$profileRoot = Join-Path $env:LOCALAPPDATA "GaragePosKiosk"
New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null

$arguments = @(
  "--kiosk",
  "--kiosk-printing",
  $Url,
  "--new-window",
  "--no-first-run",
  "--disable-session-crashed-bubble",
  "--disable-infobars",
  "--user-data-dir=`"$profileRoot`""
)

Write-Host "Opening Garage POS kiosk in ${browserName}: $Url"
Start-Process -FilePath $browserPath -ArgumentList $arguments
