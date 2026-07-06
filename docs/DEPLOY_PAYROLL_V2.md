# Deploy Payroll V2 ke VPS Produksi

## Prasyarat

- VPS 156.67.214.203 (systemd + Node 20+)
- Branch `feat/payroll-v2-attendance-wallet` merged ke `main`
- Backup DB terakhir tersimpan

## Langkah Deploy

### 1. Backup DB Produksi

```bash
ssh -i ~/.ssh/garage_vps root@156.67.214.203
sudo -u postgres pg_dump garage > /backup/garage-pre-payroll-v2-$(date +%F).sql
```

### 2. Deploy Kode (flag masih OFF)

Dari lokal:
```bash
./update-vps.sh
```

Di VPS, pastikan `.env` di path `~/apps/garage-web/.env` **belum** ada `PAYROLL_V2_ENABLED=true`. Migrasi 0089 akan jalan otomatis via `db:migrate` (idempoten, non-destructive).

### 3. Verifikasi Data Lama Utuh

```bash
# Di VPS
curl -s http://127.0.0.1:3000/api/health | jq
# Buka https://app.garagecoffee.id di HP → login → POS → pastikan order jalan normal
```

### 4. Setup Systemd Timer Cron

Buat file `/etc/systemd/system/garage-payroll.service`:
```ini
[Unit]
Description=Garage Payroll V2 - Finalisasi Harian
After=network.target

[Service]
Type=oneshot
User=garage
WorkingDirectory=/home/garage/apps/garage-web
EnvironmentFile=/home/garage/apps/garage-web/.env
ExecStart=/usr/bin/npx tsx src/scripts/payroll-finalize-cli.ts
StandardOutput=journal
StandardError=journal
```

Buat file `/etc/systemd/system/garage-payroll.timer`:
```ini
[Unit]
Description=Trigger Garage Payroll finalisasi 23:59 WIB

[Timer]
OnCalendar=*-*-* 23:59:00
Persistent=true
Unit=garage-payroll.service

[Install]
WantedBy=timers.target
```

Aktifkan:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now garage-payroll.timer
sudo systemctl list-timers | grep payroll
```

### 5. Aktifkan Flag

Edit `.env`:
```
PAYROLL_V2_ENABLED="true"
```

Restart app:
```bash
sudo systemctl restart garage-web
```

### 6. Set Koordinat GPS + Upah

Owner buka `/owner/payroll/settings`:
- Tab **GPS Toko** → ganti lat/lng ke koordinat asli toko
- Tab **Upah** → set per staff aktif (fase awal set upah harian minimum dulu)

### 7. Monitor 24 Jam Pertama

```bash
# Hari H+1 pagi
journalctl -u garage-payroll.service --since yesterday --until today
```

Cek dashboard `/owner/payroll` — wallet gaji semua staff shift kemarin sudah terisi.

## Rollback (kalau ada masalah)

Cepat (tanpa data loss):
```bash
# 1. Nonaktifkan flag
sed -i 's/PAYROLL_V2_ENABLED="true"/PAYROLL_V2_ENABLED="false"/' .env
sudo systemctl restart garage-web
sudo systemctl stop garage-payroll.timer
```

Full rollback (butuh downtime):
```bash
# 2. Restore DB
sudo -u postgres psql -c "DROP DATABASE garage;"
sudo -u postgres psql -c "CREATE DATABASE garage;"
sudo -u postgres psql garage < /backup/garage-pre-payroll-v2-YYYY-MM-DD.sql
```

## Verifikasi Post-Deploy

- [ ] Systemd timer aktif: `systemctl status garage-payroll.timer`
- [ ] Cron sukses jalan malam pertama tanpa error di journalctl
- [ ] Dashboard owner menampilkan angka wallet
- [ ] Test staff absen dari HP → wallet gaji terisi hari berikutnya
- [ ] POS masih jalan normal (feature flag tidak break existing)
