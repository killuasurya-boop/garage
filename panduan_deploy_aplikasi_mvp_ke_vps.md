# Panduan Deploy Aplikasi MVP / Super App ke VPS

Dokumen ini adalah panduan praktis untuk menyiapkan, melakukan deploy, mengamankan, memonitor, dan melakukan rollback aplikasi MVP / super app di VPS.

> Target: aplikasi siap jalan di production dengan domain, HTTPS, reverse proxy, database, backup, logging, monitoring dasar, dan prosedur rollback.

---

## 1. Gambaran Arsitektur

Contoh arsitektur deployment:

```text
User
  ↓
Domain / DNS
  ↓
Nginx / Caddy Reverse Proxy
  ↓
Docker Container App
  ↓
Backend API
  ↓
Database / Redis / Storage
```

Komponen minimal:

- VPS Linux, disarankan Ubuntu LTS.
- Domain aktif.
- Nginx atau Caddy sebagai reverse proxy.
- SSL/HTTPS.
- Docker dan Docker Compose.
- Database, misalnya PostgreSQL atau MySQL.
- Redis jika perlu cache, queue, session, atau rate limit.
- Environment variable untuk konfigurasi rahasia.
- Backup database.
- Monitoring dan logging dasar.

---

## 2. Spesifikasi VPS Rekomendasi

### MVP kecil

- CPU: 2 vCPU
- RAM: 2–4 GB
- Storage: 40–80 GB SSD
- OS: Ubuntu LTS
- Cocok untuk: landing page, API ringan, dashboard admin, user awal.

### MVP menengah

- CPU: 4 vCPU
- RAM: 8 GB
- Storage: 100–160 GB SSD
- Cocok untuk: aplikasi transaksi, admin panel, beberapa service, traffic mulai stabil.

### Super app tahap awal

- CPU: 4–8 vCPU
- RAM: 8–16 GB
- Storage: 160 GB SSD+
- Disarankan pisahkan database ke managed database atau VPS database terpisah jika transaksi mulai banyak.

---

## 3. Checklist Sebelum Deploy

Pastikan hal berikut sudah siap:

- [ ] Repository Git sudah rapi.
- [ ] Branch production/main sudah stabil.
- [ ] File `.env.example` tersedia.
- [ ] Dokumentasi setup tersedia.
- [ ] Aplikasi bisa jalan lokal.
- [ ] Build berhasil tanpa error.
- [ ] Lint dan formatter sudah dijalankan.
- [ ] Database migration tersedia.
- [ ] API sudah dites.
- [ ] Admin panel tersedia jika aplikasi butuh operasional.
- [ ] Domain sudah dibeli.
- [ ] DNS sudah bisa diarahkan ke IP VPS.
- [ ] Payment gateway/webhook sudah punya mode production jika diperlukan.
- [ ] Privacy Policy dan Terms & Conditions tersedia jika aplikasi publik.
- [ ] Backup strategy sudah disiapkan.
- [ ] Rollback plan sudah disiapkan.

---

## 4. Struktur Folder di VPS

Gunakan struktur seperti ini:

```bash
/opt/apps/
└── nama-aplikasi/
    ├── app/
    ├── docker-compose.yml
    ├── .env
    ├── nginx/
    │   └── app.conf
    ├── backups/
    ├── logs/
    └── scripts/
        ├── deploy.sh
        ├── rollback.sh
        └── backup-db.sh
```

Contoh:

```bash
sudo mkdir -p /opt/apps/nama-aplikasi
sudo chown -R $USER:$USER /opt/apps/nama-aplikasi
cd /opt/apps/nama-aplikasi
```

---

## 5. Setup Awal VPS

### 5.1 Login ke VPS

```bash
ssh root@IP_VPS
```

### 5.2 Update server

```bash
apt update && apt upgrade -y
```

### 5.3 Buat user deploy

```bash
adduser deploy
usermod -aG sudo deploy
```

Login ulang sebagai user deploy:

```bash
ssh deploy@IP_VPS
```

### 5.4 Amankan SSH

Edit file SSH config:

```bash
sudo nano /etc/ssh/sshd_config
```

Rekomendasi konfigurasi:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Restart SSH:

```bash
sudo systemctl restart ssh
```

> Pastikan SSH key sudah bekerja sebelum menutup terminal lama.

---

## 6. Setup Firewall

Install UFW:

```bash
sudo apt install ufw -y
```

Izinkan port penting:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
sudo ufw status
```

---

## 7. Install Docker dan Docker Compose

```bash
sudo apt install ca-certificates curl gnupg -y
```

Tambahkan repository Docker:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

Tambahkan source list:

```bash
echo \
"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker:

```bash
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
```

Tambahkan user ke group Docker:

```bash
sudo usermod -aG docker $USER
```

Logout lalu login ulang, kemudian cek:

```bash
docker --version
docker compose version
```

---

## 8. Clone Repository

Masuk ke folder aplikasi:

```bash
sudo mkdir -p /opt/apps/nama-aplikasi
sudo chown -R $USER:$USER /opt/apps/nama-aplikasi
cd /opt/apps/nama-aplikasi
```

Clone repo:

```bash
git clone git@github.com:username/nama-repo.git app
cd app
```

Checkout branch production:

```bash
git checkout main
```

---

## 9. Setup Environment Variable

Buat file `.env`:

```bash
nano .env
```

Contoh isi `.env`:

```env
APP_ENV=production
APP_NAME=NamaAplikasi
APP_URL=https://domainanda.com

PORT=3000

DATABASE_URL=postgresql://app_user:passwordkuat@postgres:5432/app_db
REDIS_URL=redis://redis:6379

JWT_SECRET=ganti_dengan_secret_panjang
REFRESH_TOKEN_SECRET=ganti_dengan_secret_panjang_lain
SESSION_SECRET=ganti_dengan_secret_panjang

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=email@example.com
SMTP_PASS=password_email

PAYMENT_GATEWAY_SECRET=isi_secret_gateway
PAYMENT_WEBHOOK_SECRET=isi_secret_webhook

SENTRY_DSN=
```

Aturan penting:

- Jangan commit file `.env`.
- Gunakan secret panjang dan unik.
- Pisahkan `.env` production, staging, dan development.
- Batasi akses file `.env`.

```bash
chmod 600 .env
```

---

## 10. Contoh Dockerfile Backend Node.js

Contoh untuk aplikasi Node.js/NestJS/Express:

```dockerfile
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=base /app/dist ./dist
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

Sesuaikan dengan framework yang dipakai.

---

## 11. Contoh `docker-compose.yml`

Letakkan di root project atau folder deployment.

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: nama-aplikasi-app
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - postgres
      - redis
    networks:
      - app-network

  postgres:
    image: postgres:16-alpine
    container_name: nama-aplikasi-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: app_db
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: passwordkuat
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    container_name: nama-aplikasi-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
```

Jalankan:

```bash
docker compose up -d --build
```

Cek container:

```bash
docker ps
docker compose logs -f app
```

---

## 12. Database Migration

Jalankan migration setelah container aktif.

Contoh Prisma:

```bash
docker compose exec app npx prisma migrate deploy
```

Contoh Laravel:

```bash
docker compose exec app php artisan migrate --force
```

Contoh Django:

```bash
docker compose exec app python manage.py migrate
```

Contoh Sequelize:

```bash
docker compose exec app npx sequelize-cli db:migrate
```

---

## 13. Setup Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt install nginx -y
```

Buat konfigurasi:

```bash
sudo nano /etc/nginx/sites-available/nama-aplikasi
```

Isi konfigurasi:

```nginx
server {
    listen 80;
    server_name domainanda.com www.domainanda.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Aktifkan config:

```bash
sudo ln -s /etc/nginx/sites-available/nama-aplikasi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 14. Setup SSL HTTPS dengan Certbot

Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx -y
```

Generate SSL:

```bash
sudo certbot --nginx -d domainanda.com -d www.domainanda.com
```

Cek auto-renewal:

```bash
sudo certbot renew --dry-run
```

---

## 15. DNS Domain

Di dashboard domain, arahkan DNS:

```text
A Record
Name: @
Value: IP_VPS

A Record
Name: www
Value: IP_VPS
```

Tunggu propagasi DNS. Biasanya beberapa menit sampai beberapa jam.

Cek:

```bash
ping domainanda.com
```

---

## 16. Script Deploy

Buat file:

```bash
nano scripts/deploy.sh
```

Isi:

```bash
#!/bin/bash

set -e

APP_DIR="/opt/apps/nama-aplikasi/app"

echo "Masuk ke folder aplikasi..."
cd "$APP_DIR"

echo "Ambil update terbaru..."
git fetch origin
git pull origin main

echo "Build dan restart container..."
docker compose up -d --build

echo "Jalankan migration..."
# Pilih salah satu sesuai stack:
# docker compose exec app npx prisma migrate deploy
# docker compose exec app php artisan migrate --force
# docker compose exec app python manage.py migrate

echo "Bersihkan image tidak terpakai..."
docker image prune -f

echo "Deploy selesai."
```

Aktifkan permission:

```bash
chmod +x scripts/deploy.sh
```

Jalankan:

```bash
./scripts/deploy.sh
```

---

## 17. Script Rollback

Rollback sederhana menggunakan Git commit sebelumnya.

Buat file:

```bash
nano scripts/rollback.sh
```

Isi:

```bash
#!/bin/bash

set -e

APP_DIR="/opt/apps/nama-aplikasi/app"

if [ -z "$1" ]; then
  echo "Gunakan: ./scripts/rollback.sh <commit_hash>"
  exit 1
fi

COMMIT_HASH=$1

cd "$APP_DIR"

echo "Rollback ke commit: $COMMIT_HASH"
git fetch origin
git checkout "$COMMIT_HASH"

echo "Rebuild container..."
docker compose up -d --build

echo "Rollback selesai."
```

Aktifkan:

```bash
chmod +x scripts/rollback.sh
```

Jalankan:

```bash
./scripts/rollback.sh abc1234
```

Catatan:

- Rollback kode belum tentu rollback database.
- Untuk aplikasi transaksi, hati-hati dengan migration irreversible.
- Backup database sebelum deploy besar.

---

## 18. Backup Database PostgreSQL

Buat script:

```bash
nano scripts/backup-db.sh
```

Isi:

```bash
#!/bin/bash

set -e

BACKUP_DIR="/opt/apps/nama-aplikasi/backups"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILE="$BACKUP_DIR/db_backup_$DATE.sql"

mkdir -p "$BACKUP_DIR"

docker exec nama-aplikasi-postgres pg_dump -U app_user app_db > "$FILE"

gzip "$FILE"

echo "Backup selesai: $FILE.gz"
```

Aktifkan:

```bash
chmod +x scripts/backup-db.sh
```

Jalankan manual:

```bash
./scripts/backup-db.sh
```

---

## 19. Jadwal Backup Otomatis

Edit crontab:

```bash
crontab -e
```

Backup setiap hari jam 02:00:

```cron
0 2 * * * /opt/apps/nama-aplikasi/app/scripts/backup-db.sh >> /opt/apps/nama-aplikasi/logs/backup.log 2>&1
```

Hapus backup lebih dari 14 hari:

```cron
30 2 * * * find /opt/apps/nama-aplikasi/backups -type f -name "*.gz" -mtime +14 -delete
```

---

## 20. Restore Database PostgreSQL

Contoh restore:

```bash
gunzip db_backup_2026-01-01_02-00-00.sql.gz
cat db_backup_2026-01-01_02-00-00.sql | docker exec -i nama-aplikasi-postgres psql -U app_user -d app_db
```

Peringatan:

- Restore bisa menimpa data.
- Lakukan di staging terlebih dahulu.
- Pastikan aplikasi dimatikan jika restore production.

---

## 21. Logging

Lihat log aplikasi:

```bash
docker compose logs -f app
```

Lihat log Nginx:

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

Rekomendasi production:

- Gunakan structured logging JSON.
- Simpan request ID.
- Jangan log password, token, OTP, API key, atau data kartu.
- Gunakan error tracking seperti Sentry jika memungkinkan.

---

## 22. Monitoring Dasar

Install tools:

```bash
sudo apt install htop ncdu -y
```

Cek CPU/RAM:

```bash
htop
```

Cek storage:

```bash
df -h
```

Cek folder besar:

```bash
sudo ncdu /
```

Cek status service:

```bash
sudo systemctl status nginx
docker ps
```

Monitoring yang disarankan:

- Uptime monitoring: Uptime Kuma, Better Stack, atau layanan sejenis.
- Error tracking: Sentry.
- Server metrics: Netdata, Grafana/Prometheus, atau provider VPS monitoring.
- Alert: email, Telegram, Slack, Discord, atau WhatsApp gateway.

---

## 23. Health Check Endpoint

Aplikasi sebaiknya punya endpoint:

```text
GET /health
```

Contoh response:

```json
{
  "status": "ok",
  "uptime": 12345,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Untuk readiness yang lebih serius:

```text
GET /health
GET /ready
GET /metrics
```

`/ready` sebaiknya mengecek:

- Koneksi database.
- Koneksi Redis.
- Koneksi storage.
- Status queue jika ada.

---

## 24. Keamanan Production

Checklist keamanan:

- [ ] SSH root login dimatikan.
- [ ] SSH password login dimatikan.
- [ ] Firewall aktif.
- [ ] Hanya port 22, 80, 443 yang terbuka.
- [ ] HTTPS aktif.
- [ ] `.env` tidak masuk repo.
- [ ] Secret kuat dan unik.
- [ ] Database tidak expose ke publik.
- [ ] Redis tidak expose ke publik.
- [ ] Rate limiting aktif.
- [ ] Input validation aktif.
- [ ] CORS dibatasi.
- [ ] Security headers aktif.
- [ ] Audit log untuk aksi penting.
- [ ] Backup terenkripsi jika berisi data sensitif.
- [ ] Admin panel dilindungi RBAC.
- [ ] Endpoint internal tidak terbuka publik.
- [ ] Dependency rutin diperbarui.

---

## 25. Security Headers Nginx

Tambahkan di block `server` Nginx:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-XSS-Protection "1; mode=block" always;
```

Untuk aplikasi modern, Content Security Policy perlu disesuaikan dengan kebutuhan asset, API, dan third-party script.

---

## 26. Rate Limiting Nginx

Tambahkan di bagian `http` Nginx, biasanya di `/etc/nginx/nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

Lalu di server/location:

```nginx
location /api/ {
    limit_req zone=api_limit burst=20 nodelay;

    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 27. CI/CD Sederhana dengan GitHub Actions

Contoh `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/apps/nama-aplikasi/app
            git pull origin main
            docker compose up -d --build
            docker image prune -f
```

GitHub Secrets yang perlu dibuat:

```text
VPS_HOST
VPS_USER
VPS_SSH_KEY
```

Untuk production serius, tambahkan:

- Lint.
- Test.
- Build check.
- Migration step.
- Slack/Telegram notification.
- Manual approval sebelum deploy production.

---

## 28. Flow Deploy Production yang Disarankan

```text
Developer push code
  ↓
Pull Request
  ↓
Code review
  ↓
Lint + test + build
  ↓
Merge ke main
  ↓
Deploy ke staging
  ↓
QA/UAT
  ↓
Tag release
  ↓
Deploy production
  ↓
Monitoring
```

Untuk MVP cepat, minimal:

```text
Push main
  ↓
CI check
  ↓
Deploy VPS
  ↓
Cek health endpoint
  ↓
Cek log
```

---

## 29. Checklist Setelah Deploy

- [ ] Domain bisa dibuka.
- [ ] HTTPS aktif.
- [ ] Login/register berjalan.
- [ ] API utama berjalan.
- [ ] Database migration sukses.
- [ ] Admin panel bisa login.
- [ ] Upload file berjalan jika ada.
- [ ] Email/OTP/notifikasi berjalan jika ada.
- [ ] Payment callback/webhook berjalan jika ada.
- [ ] Error tracking menerima event.
- [ ] Backup database berhasil.
- [ ] Health check OK.
- [ ] Log tidak menunjukkan error fatal.
- [ ] Uptime monitoring aktif.
- [ ] Rollback sudah dites di staging.

---

## 30. Troubleshooting

### 30.1 Aplikasi tidak bisa dibuka

Cek container:

```bash
docker ps
docker compose logs -f app
```

Cek Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

Cek port:

```bash
sudo ss -tulpn
```

---

### 30.2 Domain belum mengarah ke VPS

Cek DNS:

```bash
ping domainanda.com
dig domainanda.com
```

Pastikan A Record mengarah ke IP VPS.

---

### 30.3 SSL gagal

Cek domain sudah mengarah ke VPS:

```bash
ping domainanda.com
```

Cek Nginx config:

```bash
sudo nginx -t
```

Coba generate ulang:

```bash
sudo certbot --nginx -d domainanda.com -d www.domainanda.com
```

---

### 30.4 Database tidak terkoneksi

Cek env:

```bash
cat .env
```

Cek container database:

```bash
docker ps
docker compose logs -f postgres
```

Masuk database:

```bash
docker compose exec postgres psql -U app_user -d app_db
```

---

### 30.5 Storage penuh

Cek storage:

```bash
df -h
```

Bersihkan Docker image tidak terpakai:

```bash
docker system prune -f
```

Cek folder besar:

```bash
sudo ncdu /
```

---

## 31. Catatan Khusus Super App MVP

Untuk super app, jangan semua layanan langsung dibuat sebagai microservices. Mulai dari:

- Modular monolith.
- Satu database utama dengan schema/domain yang rapi.
- Satu auth system.
- Satu admin panel.
- Satu payment/order core.
- Modul layanan dipisah secara kode, bukan langsung dipisah server.
- Pisahkan service hanya saat beban, tim, atau kompleksitas sudah menuntut.

Urutan prioritas:

1. Auth dan user profile.
2. Core home dan service hub.
3. Modul layanan utama MVP.
4. Order/payment flow.
5. Admin panel.
6. Notification.
7. Logging dan monitoring.
8. Backup dan rollback.
9. Analytics.
10. Customer support flow.

---

## 32. Definition of Done Deploy Siap Tempur

Aplikasi dianggap siap tempur jika:

- [ ] Bisa diakses via domain HTTPS.
- [ ] Container restart otomatis jika crash.
- [ ] Database aman dan tidak expose publik.
- [ ] Backup otomatis berjalan.
- [ ] Rollback bisa dilakukan.
- [ ] Error bisa dipantau.
- [ ] Log bisa dibaca.
- [ ] Admin bisa mengelola data utama.
- [ ] Payment/order/webhook aman jika ada transaksi.
- [ ] Ada health check.
- [ ] Ada staging sebelum production.
- [ ] Ada dokumentasi deploy.
- [ ] Ada kontak/support untuk user.
- [ ] Ada Terms & Conditions dan Privacy Policy untuk aplikasi publik.

---

## 33. Command Cepat

```bash
# Masuk server
ssh deploy@IP_VPS

# Masuk project
cd /opt/apps/nama-aplikasi/app

# Pull update
git pull origin main

# Deploy
docker compose up -d --build

# Lihat log app
docker compose logs -f app

# Cek container
docker ps

# Restart app
docker compose restart app

# Stop semua container
docker compose down

# Jalankan migration
docker compose exec app npm run migrate

# Cek Nginx
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Backup database
./scripts/backup-db.sh

# Cek disk
df -h
```

---

## 34. Template Informasi Server

Isi data berikut untuk dokumentasi internal tim.

```text
Nama aplikasi:
Domain:
IP VPS:
Provider VPS:
OS:
User deploy:
Repository:
Branch production:
Path app di VPS:
Database:
Redis:
Payment gateway:
Email provider:
Monitoring:
Error tracking:
Backup location:
PIC technical:
PIC product:
Tanggal deploy pertama:
```

---

## 35. Penutup

Deployment production bukan hanya menjalankan aplikasi di server. Deployment yang benar harus memperhatikan:

- Stabilitas.
- Keamanan.
- Backup.
- Monitoring.
- Rollback.
- Dokumentasi.
- Operasional admin.
- Kesiapan support user.

Untuk MVP, jangan terlalu kompleks di awal. Yang penting rapi, aman, bisa dipantau, dan bisa diperbaiki cepat saat ada masalah.
