# Operasional VPS Garage OS — garagecoffee.id

Status: **live** sejak 2026-09-29. Dokumen ini = panduan harian + daftar langkah sebelum grand opening.

## 1. Arsitektur singkat
- VPS Hostinger KVM 1 (`201.18.211.55`, Ubuntu 24.04, 1 vCPU / 3,8 GB + swap 2 GB).
- Docker Compose di `/root/garage`: `db` (PostgreSQL 16), `migrate` (sekali jalan), `app` (Next.js standalone), `caddy` (HTTPS otomatis, `www` → domain utama).
- DNS (hPanel Hostinger): `A @ → 201.18.211.55`, `CNAME www`. Domain resmi **garagecoffee.id** (bukan `app.`).
- Rahasia hanya di `/root/garage/.env.production` (izin 600). Jangan diganti: PIN absen, 2FA, dan data terenkripsi bergantung padanya. Dibuat lewat `scripts/make-env-production.mjs`.

## 2. Alur perubahan (deploy otomatis)
1. Kerjakan di branch, buat PR → `CI` berjalan (tsc, lint, 512 tes, ±7 menit).
2. Gabungkan PR ke `main` → workflow `Deploy VPS`: build image di GitHub, kirim lewat SSH, migrasi, jalankan ulang, cek `/api/health`.
3. Gagal sehat → rollback otomatis ke image `:previous`.
- Rahasia `VPS_SSH_KEY` ada di GitHub → Environments → `production` (dibatasi branch `main`).
- Repo privat paket gratis: proteksi branch/reviewer wajib **tidak ditegakkan**; disiplin PR + CI hijau.

## 3. Perintah rutin (di VPS: `ssh root@201.18.211.55`, lalu `cd /root/garage`)
```bash
docker compose --env-file .env.production ps                 # status
docker compose --env-file .env.production logs -f app        # log aplikasi
/root/garage-cron.sh backup                                  # backup manual sekarang
```
Rollback manual: `docker tag garage-app:previous garage-app:latest && docker compose --env-file .env.production up -d --no-build app`.

## 4. Backup
- Cron VPS: `pg_dump` tiap 6 jam ke `/root/garage/backups` (simpan 56 salinan ≈ 14 hari). Payroll: finalisasi 23:59 dan susulan 00:30 (`/var/log/garage-cron.log`).
- Uji pulih (sudah lulus): buat DB sementara, `gunzip -c backup.sql.gz | psql`, cek jumlah tabel, hapus DB sementara.
- **Belum otomatis ke Google Drive** — salin manual `scp root@201.18.211.55:/root/garage/backups/garage-*.sql.gz` ke folder Drive, atau pasang tugas terjadwal di laptop.

## 5. Sebelum grand opening (urut)
1. **Tes putaran lengkap di garagecoffee.id** (±30 mnt): login Owner (2FA)/Manajer/Kasir/Waiter; buka shift; order kasir + QR meja; dapur/bar; bayar tunai & QRIS; cetak struk; absen PIN+selfie+GPS; void & refund; cek kas dan laporan.
2. **Data operasional** (butuh dari Owner): resep makanan & cemilan (bahan + takaran/porsi) — tanpa ini HPP makanan 0 dan stok tak terpotong; stok opname awal bahan bar; nama outlet (default "Outlet A"); tanggal grand opening (`finance_settings.businessStartDate`, lalu `rebuildFinanceSnapshots()`).
3. **Toko:** agen cetak `npm run print:server` di tiap PC kasir (auto-start), internet cadangan (tethering), cetak QR meja ke `garagecoffee.id`.
4. **Pengaman (opsional):** backup otomatis ke Drive; tutup login SSH password setelah pakai kunci; pantauan uptime.
5. **Setelah buka:** aktifkan mode offline kasir; cek laporan harian & backup rutin.

## 6. Yang perlu diingat
- Sumber data utama = **VPS**. DB PGlite di laptop sudah usang — jangan impor/TRUNCATE dari laptop ke VPS.
- Auto-habis menu sengaja **mati**; kasir menandai HABIS manual ("Atur Stok Habis").
- Pajak, service, promo QR = 0% (harga produk bulat).
