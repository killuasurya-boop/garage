# Deploy Garage OS ke VPS (Hostinger KVM / Postgres)

Panduan ringkas dari nol sampai live. Semua via Docker — tidak ada PGlite di
production (driver otomatis `postgres`).

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

## Operasional harian

**Update versi baru:**
```bash
git pull
docker compose --env-file .env.production up -d --build
# migrasi baru ikut otomatis lewat service `migrate`
```

**Backup database (cron harian disarankan):**
```bash
docker compose --env-file .env.production exec db \
  pg_dump -U garage garage | gzip > backup-$(date +%F).sql.gz
```

**Restore:**
```bash
gunzip -c backup-YYYY-MM-DD.sql.gz | \
  docker compose --env-file .env.production exec -T db psql -U garage garage
```

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
