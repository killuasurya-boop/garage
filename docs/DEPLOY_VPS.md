# Deploy Garage OS ke VPS (Hostinger KVM / Postgres)

Panduan ringkas dari nol sampai live. Semua via Docker — tidak ada PGlite di
production (driver otomatis `postgres`).

> Deploy rutin = push ke `main` (`.github/workflows/deploy.yml`). Bila GitHub Actions
> tidak jalan, Owner bisa deploy dari laptop dengan langkah yang sama:
> `bash scripts/deploy-manual.sh` — lihat `docs/DEPLOY_MANUAL.md`.

## 0. Spesifikasi VPS
- Ubuntu 24.04 LTS, **2 vCPU / 4 GB RAM** (KVM 2 cukup; 8 GB lebih lega untuk build)
- Disk 50–80 GB SSD/NVMe
- Region **Jakarta / Singapore** (latensi rendah ke warung)
- Domain (mis. `app.namawarung.com`) → buat **A record** ke IP VPS

## 1. Siapkan VPS
```bash
# Login SSH ke VPS, lalu pasang Docker
curl -fsSL https://get.docker.com | sh
# (opsional) jalankan docker tanpa sudo
sudo usermod -aG docker $USER && newgrp docker
```

## 2. Ambil kode
```bash
git clone <repo-url> garage && cd garage
git checkout main   # atau branch rilis
```

## 3. Konfigurasi environment
```bash
cp .env.production.example .env.production
openssl rand -base64 32     # tempel hasilnya ke BETTER_AUTH_SECRET
nano .env.production        # isi domain, password DB, secret, base URL
```
Wajib diisi: `GARAGE_DOMAIN`, `POSTGRES_PASSWORD` (+ samakan di `DATABASE_URL`),
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`/`GARAGE_PUBLIC_BASE_URL`.

## 4. Build & jalankan
> Pakai `--env-file .env.production` supaya interpolasi `${...}` di compose
> terbaca (compose default hanya baca file bernama `.env`).
```bash
docker compose --env-file .env.production up -d --build
```
Urutan otomatis: `db` sehat → `migrate` apply semua `drizzle/*.sql` lalu exit →
`app` start → `caddy` terbitkan HTTPS.

## 5. Seed data awal (sekali saja)
```bash
docker compose --env-file .env.production run --rm migrate \
  node_modules/.bin/tsx src/db/seed.ts
```
Login awal sesuai seed (mis. `admin@garage.local`). **Ganti password admin
segera setelah live.**

## 6. Verifikasi
- Buka `https://app.namawarung.com` → login berhasil
- `docker compose --env-file .env.production logs -f app` → tidak ada error
- `docker compose --env-file .env.production ps` → semua `running`/`healthy`

### Warehouse go-live (setelah update WMS)
```bash
# Migrasi baru otomatis lewat service migrate saat up -d --build.
# Verifikasi API dari mesin dev (ganti URL production):
UAT_BASE_URL=https://app.namawarung.com npm run wms:uat
```
- `/warehouse/settings` → **Integrasi POS** → nyalakan **Auto consume**
- `/warehouse/recipe` → **Tarik dari Produk OS** (coverage ≥ 95%)
- Checklist: `docs/CHECKLIST/WAREHOUSE_OPENING.md`

## Operasional harian

**Update versi baru:**
```bash
git pull
docker compose --env-file .env.production up -d --build
# migrasi baru ikut otomatis lewat service `migrate`
```

**Backup database (otomatis):**
- Service `backup` (docker-compose) menjalankan `scripts/pg-backup.sh`:
  1× sehari setelah **04:00 WIB** → `./backups/garage-daily-*.sql.gz`,
  disimpan **14 hari** (atur `BACKUP_HOUR` / `BACKUP_KEEP_DAYS` di `.env.production`).
- Setiap deploy (GitHub Actions & `deploy.sh`) membuat
  `./backups/garage-pre-deploy-*.sql.gz` **sebelum migrasi**; deploy berhenti bila
  backup gagal. 10 backup pre-deploy/manual terakhir disimpan.
- Tiap file diuji (gzip utuh + penanda selesai `pg_dump`) sebelum dianggap jadi.
- Cek: `ls -lh /root/garage/backups` dan `docker compose --env-file .env.production logs --tail 20 backup`.
- Backup manual kapan saja:
  `docker compose --env-file .env.production run --rm backup once manual`
- **Salin ke luar VPS** secara berkala (laptop/Google Drive), mis. dari PC:
  `scp root@<ip-vps>:/root/garage/backups/garage-daily-*.sql.gz .`
  — backup yang hanya ada di VPS ikut hilang bila VPS rusak.

**Restore** (hentikan app dulu agar tidak ada transaksi baru):
```bash
docker compose --env-file .env.production stop app
gunzip -c backups/garage-daily-YYYY-MM-DD_HHMMSS.sql.gz | \
  docker compose --env-file .env.production exec -T db \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose --env-file .env.production up -d app
```
File dibuat dengan `--clean --if-exists`, jadi bisa langsung di-restore ke
database yang sudah berisi (tabel lama diganti isi backup).

**Uji restore buku kas (T25, P6)** — tanpa menyentuh DB produksi. Pulihkan backup ke
database uji terpisah di container `db`, lalu bandingkan sidik buku kas:
```bash
C="docker compose --env-file .env.production exec -T db"
F=backups/garage-pre-deploy-YYYY-MM-DD_HHMMSS.sql.gz
# 1. Sidik DB produksi pada saat backup dibuat (atau ambil dari panel Owner sebelum backup)
$C sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' < scripts/cash-ledger-fingerprint.sql > /tmp/fp-prod.txt
# 2. Pulihkan ke DB uji
$C sh -c 'dropdb -U "$POSTGRES_USER" --if-exists garage_restore_test && createdb -U "$POSTGRES_USER" garage_restore_test'
gunzip -c "$F" | $C sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d garage_restore_test' > /dev/null
# 3. Sidik DB uji → harus identik dengan langkah 1
$C sh -c 'psql -U "$POSTGRES_USER" -d garage_restore_test -At' < scripts/cash-ledger-fingerprint.sql > /tmp/fp-restore.txt
diff /tmp/fp-prod.txt /tmp/fp-restore.txt && echo "T25 OK: saldo, referensi dan riwayat utuh"
$C sh -c 'dropdb -U "$POSTGRES_USER" garage_restore_test'
```
Langkah 1 harus dijalankan tanpa transaksi kas baru sejak backup (mis. langsung sesudah
`backup once manual`). Panel Owner `/control/cash-closing` → "Saldo pembuka disahkan Owner"
menampilkan sidik yang sama (jumlah baris · seq · md5).

## Cron wajib di VPS (padanan `vercel.json` + Task Scheduler PC lokal)

`vercel.json` hanya berlaku di Vercel. Di VPS, pasang di `crontab -e` host
(zona waktu server = Asia/Jakarta, atau sesuaikan jam UTC). `$S` = nilai
`CRON_SECRET` dari `.env.production`, `$D` = `https://<domain>`.

| Jadwal (WIB) | Job | Perintah |
|---|---|---|
| 23:59 tiap hari | Finalisasi payroll/fee pool (WAJIB) | `curl -fsS -X POST -H "x-cron-secret: $S" -H "content-type: application/json" -d "{\"date\":\"$(date +%F)\"}" $D/api/payroll/cron/finalize` |
| 00:30 tiap hari | Susulan finalisasi kemarin (bila 23:59 terlewat) | `curl -fsS -X POST -H "x-cron-secret: $S" -H "content-type: application/json" -d "{}" $D/api/payroll/cron/finalize` |
| — | Backup DB | otomatis oleh service `backup` (tidak perlu crontab) |
| */5 menit | Antrean WhatsApp (bila dipakai) | `curl -fsS -H "authorization: Bearer $S" $D/api/jobs/whatsapp-messaging` |
| 03:00 tgl 1 | Bersihkan chat internal lama | `curl -fsS -H "authorization: Bearer $S" "$D/api/admin/purge/cron?retentionDays=90"` |

Job AI (`/api/ai/jobs/*`) & publikasi sosial opsional — aktifkan hanya bila
provider sudah dikonfigurasi. **Purge tidak pernah menghapus order/pembayaran**
(sejak QA-audit 2026-09-28 hanya chat internal; persetujuan hanya bila retensi ≥ 365 hari).

Build image: `Dockerfile` men-set `GARAGE_STANDALONE=true` (wajib — tanpa itu
`.next/standalone` tidak terbentuk dan stage runner gagal).

## Printer thermal saat app di VPS (PENTING)

App di VPS (Linux) **tidak bisa** menyentuh printer fisik di warung. Karena itu
cetak struk memakai pola **agen cetak lokal**:

1. Browser kasir membentuk konten struk (lib `src/lib/thermal-receipt.ts`).
2. Browser POST ke **agen cetak lokal** di `http://localhost:9100`
   (`scripts/thermal-print-server.js`) yang berjalan **di PC kasir** — mesin yang
   sama yang colok printer RPP02N via USB.
3. Agen mengirim byte mentah (ESC/POS) ke printer lewat Windows spooler (RAW).

> Catatan browser: halaman HTTPS dari VPS boleh memanggil `http://localhost`
> (dianggap secure), tapi `http://192.168.x.x` diblokir. Jadi agen **wajib** di
> PC yang sama dengan browser kasir.

### Jalankan agen di PC kasir (Windows)
```bash
npm run print:server
# atau set nama printer:  DEFAULT_PRINTER="RPP02N_Thermal" npm run print:server
# printer jaringan (bukan USB):  PRINT_METHOD=network PRINTER_HOST=192.168.100.100 npm run print:server
```

### Auto-start saat PC kasir menyala
Buat Task Scheduler (Windows) → trigger "At log on" → action jalankan:
`node D:\path\ke\garage\scripts\thermal-print-server.js`. Dengan begitu kasir
tak perlu menjalankan agen manual.

### Bila agen pakai port lain
Set env build-time `NEXT_PUBLIC_PRINT_AGENT_URL` (default `http://localhost:9100`).

> Fallback dev: bila agen tidak jalan, `printThermal()` otomatis coba route
> server `/api/print/thermal` (berguna saat dev di mana server == PC warung).

## Catatan
- **Upload gambar menu** tersimpan di volume `garage-uploads` (persisten antar
  redeploy). Backup volume ini bila perlu.
- **Postgres tidak expose ke publik** — hanya diakses internal oleh app/migrate.
- Jika internet warung putus, POS ikut terhenti (konsekuensi model full-VPS).
  Mitigasi: UPS + tethering HP sebagai cadangan koneksi.
