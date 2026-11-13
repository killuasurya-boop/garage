# =============================================================================
# deploy-laptop.ps1 — deploy Garage OS ke VPS produksi dari laptop Windows.
#
# Cadangan saat GitHub Actions ("Deploy VPS") tidak bisa jalan. Alurnya meniru
# workflow itu 1:1, hanya laptop yang jadi tempat build (bukan GitHub):
#   build 2 image -> kirim ke VPS -> backup DB -> migrasi -> restart -> cek sehat.
#
# Prasyarat:
#   - Docker Desktop berjalan.
#   - Dijalankan dari dalam folder repo (ada Dockerfile & docker-compose.yml).
#   - `ssh root@201.18.211.55` sudah bisa dari laptop ini (kunci sudah terpasang).
#   - .env.production SUDAH ADA di VPS (tidak disentuh, tidak dikirim dari sini).
#
# Pakai:
#   powershell -ExecutionPolicy Bypass -File .\deploy-laptop.ps1
#
# CATATAN: jangan pakai update-vps.sh (IP-nya server lama 156.67.214.203).
# Produksi = 201.18.211.55, seperti di .github/workflows/deploy.yml.
# =============================================================================
$ErrorActionPreference = "Stop"
$VPS    = "root@201.18.211.55"
$APPDIR = "/root/garage"
$HEALTH = "https://garagecoffee.id/api/health"

Write-Host ">> Ambil kode terbaru (main)..." -ForegroundColor Cyan
git checkout main
git pull --ff-only origin main

Write-Host ">> Build image di laptop..." -ForegroundColor Cyan
docker build --target runner   -t garage-app:latest     .
docker build --target migrator -t garage-migrate:latest .

Write-Host ">> Simpan image ke file..." -ForegroundColor Cyan
docker save -o garage-images.tar garage-app:latest garage-migrate:latest

Write-Host ">> Kirim file ke VPS (bisa beberapa menit)..." -ForegroundColor Cyan
ssh $VPS "mkdir -p $APPDIR/scripts $APPDIR/backups"
scp docker-compose.yml Caddyfile "${VPS}:$APPDIR/"
scp scripts/pg-backup.sh "${VPS}:$APPDIR/scripts/"
scp garage-images.tar "${VPS}:$APPDIR/"

Write-Host ">> Simpan versi lama (rollback), muat image baru, migrasi, restart..." -ForegroundColor Cyan
ssh $VPS "docker tag garage-app:latest garage-app:previous 2>/dev/null; docker tag garage-migrate:latest garage-migrate:previous 2>/dev/null; docker load -i $APPDIR/garage-images.tar && cd $APPDIR && docker compose --env-file .env.production up -d --no-build db && docker compose --env-file .env.production run --rm backup once pre-deploy && docker compose --env-file .env.production run --rm migrate && docker compose --env-file .env.production up -d --no-build app caddy backup && docker compose --env-file .env.production restart backup && docker image prune -f"

Write-Host ">> Cek kesehatan..." -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  $code = (& curl.exe -s -o NUL -w "%{http_code}" $HEALTH)
  if ($code -eq "200") { $ok = $true; break }
  Start-Sleep -Seconds 6
}
Remove-Item garage-images.tar -ErrorAction SilentlyContinue
if ($ok) {
  Write-Host "SEHAT (HTTP 200). Deploy selesai." -ForegroundColor Green
} else {
  Write-Host "GAGAL health check. Rollback ke versi sebelumnya..." -ForegroundColor Red
  ssh $VPS "cd $APPDIR && docker tag garage-app:previous garage-app:latest && docker compose --env-file .env.production up -d --no-build app"
  exit 1
}
