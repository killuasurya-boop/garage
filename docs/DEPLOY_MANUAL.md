# Deploy manual dari laptop (tanpa GitHub Actions)

Dipakai bila GitHub Actions tidak jalan (kuota/billing habis, GitHub down) atau
Owner ingin men-deploy sendiri. Skrip `scripts/deploy-manual.sh` menjalankan
langkah yang **sama persis** dengan `.github/workflows/deploy.yml`:

1. build image app & migrate **di laptop** (VPS cuma 1 vCPU — jangan build di sana);
2. versi yang sedang jalan di VPS ditandai `:previous` (untuk rollback);
3. image + `docker-compose.yml` + `Caddyfile` + `pg-backup.sh` dikirim lewat SSH;
4. di VPS: database nyala → **backup dulu** (gagal = deploy berhenti) → migrasi → app jalan;
5. cek `https://garagecoffee.id/api/health`; gagal → **rollback otomatis** ke versi sebelumnya.

Pengaman bawaan:
- hanya men-deploy commit yang **sama persis dengan `origin/main`** (kode yang sudah Owner merge);
- harus mengetik `DEPLOY` sebelum server disentuh;
- satu deploy pada satu waktu (kunci `/root/garage/.deploy-lock` di VPS);
- `--dry-run` mengecek semuanya tanpa mengubah server;
- log tiap deploy tersimpan di `deploy-logs/` (tidak ikut ke git).

> Deploy = app restart ±30–60 detik (POS putus sebentar). Lakukan saat outlet sepi/tutup.

---

## A. Persiapan (sekali saja)

### 1. Program di laptop/PC
| Program | Windows | macOS / Linux |
|---|---|---|
| Git + Git Bash | https://git-scm.com/download/win (Git Bash sudah berisi `ssh`, `scp`, `gzip`, `curl`) | sudah ada / `apt install git openssh-client curl` |
| Docker Desktop | https://www.docker.com/products/docker-desktop — aktifkan **WSL 2** saat instal | Docker Desktop (mac) / Docker Engine (Linux) |

Laptop sebaiknya RAM ≥ 8 GB (build Next.js berat) dan internet stabil
(image dikirim ±300–500 MB ke VPS).

### 2. Ambil kode
```bash
git clone https://github.com/killuasurya-boop/garage.git
cd garage
```

### 3. Kunci SSH deploy
Skrip mencari kunci di `~/.ssh/garage_deploy` (bisa diganti dengan
`GARAGE_DEPLOY_KEY=/path/kunci`).

- **Sudah punya** kunci privat yang dipakai GitHub Actions (secret `VPS_SSH_KEY`):
  simpan isinya ke `~/.ssh/garage_deploy`, lalu `chmod 600 ~/.ssh/garage_deploy`.
- **Belum punya** — buat kunci baru khusus laptop ini:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/garage_deploy -C "deploy-laptop-owner"
  ```
  Lalu tambahkan isi `~/.ssh/garage_deploy.pub` ke `/root/.ssh/authorized_keys` di VPS
  (lewat panel Hostinger → Terminal / SSH yang sudah Anda pakai). Ini dilakukan Owner sendiri.

Jangan pernah mengirim kunci privat lewat chat / WhatsApp / GitHub.

---

## B. Deploy

Buka **Git Bash** (Windows) atau Terminal (mac/Linux) di folder `garage`, Docker Desktop menyala.

```bash
git checkout main
git pull

# 1) Pemeriksaan rilis main GABUNGAN (tes, build, katalog API, nama staging) ±10 menit
bash scripts/release-check.sh

# 2) Cek dulu — server TIDAK diubah
bash scripts/deploy-manual.sh --dry-run

# 3) Deploy sungguhan (akan diminta mengetik DEPLOY)
bash scripts/deploy-manual.sh
```

Hasil yang diharapkan di akhir: `SMOKE OK` lalu `✓ Deploy <commit> SELESAI.` Setelah sehat, deploy menjalankan
`scripts/smoke-prod.sh` (halaman hidup + endpoint rahasia menolak tanpa sesi); gagal → rollback otomatis.
Smoke test bisa dijalankan kapan saja: `bash scripts/smoke-prod.sh`.

### Bila gagal
| Pesan | Arti / tindakan |
|---|---|
| `Commit ini belum lulus pemeriksaan rilis` | Jalankan `bash scripts/release-check.sh` (harus `RILIS SIAP`). Darurat saja: `--skip-release-check`. |
| `Commit lokal … ≠ origin/main` | Jalankan `git checkout main && git pull`, ulangi. |
| `Ada perubahan lokal yang belum di-commit` | `git stash`, ulangi. |
| `SSH … gagal` | Kunci salah / belum ada di `authorized_keys` VPS / IP VPS berubah. |
| `Deploy lain sedang jalan` | Pastikan tidak ada deploy lain (GitHub Actions / laptop lain). Bila yakin, hapus folder `/root/garage/.deploy-lock` di VPS. |
| Berhenti di **backup** | Deploy otomatis berhenti **sebelum** migrasi — app lama tetap jalan. Cek ruang disk VPS. |
| `Kesehatan atau smoke test gagal — rollback` | App sudah dikembalikan ke versi sebelumnya. Migrasi yang sudah jalan **tidak** dibatalkan (semua migrasi Garage additive). Kirim file log di `deploy-logs/` ke agent. |

### Rollback manual (bila perlu)
Di VPS:
```bash
cd /root/garage
docker tag garage-app:previous garage-app:latest
docker compose --env-file .env.production up -d --no-build app
```

### Pemantau server & uji pulih backup
- **Pemantau** (`scripts/vps-monitor.sh`, cron 5 menit): aplikasi, layanan, restart, disk ≥85 %, RAM <250 MB,
  backup >26 jam, nama staging. Masalah → notifikasi + push ke HP Owner (`/api/jobs/system-alert`, maks 1×/jam per
  pemeriksaan; pemulihan dilaporkan dengan lama gangguan). Pasang/lepas: `bash scripts/install-vps-monitor.sh [--remove]`
  (setelah endpoint ter-deploy). Log VPS: `/var/log/garage-monitor.log`.
- **Backup di luar VPS** (`scripts/pull-backups.sh`): tarik backup terbaru dari VPS ke laptop/PC (disarankan folder
  OneDrive tersinkron → ikut ke cloud), diverifikasi utuh, simpan 30 terakhir, lalu taruh penanda `.offsite-pulled` di VPS.
  Pemantau memberi peringatan bila penanda > 48 jam (tidak aktif sebelum penarikan pertama). Jadwal harian 06:00:
  `powershell -ExecutionPolicy Bypass -File scripts\register-pull-backups-task.ps1 -Dest "$env:USERPROFILE\OneDrive\Garage Backup"`.
- **Backup terenkripsi** (audit #11, Owner 29 Okt 2026): backup di laptop/OneDrive dikunci GPG; hanya Owner yang bisa membuka.
  1. Sekali, oleh Owner, di Git Bash: `bash scripts/setup-backup-key.sh /e/GarageKunci` (folder flashdisk/tempat aman,
     **bukan** OneDrive). Kata sandi (≥12 karakter) diketik Owner sendiri — tidak tampil, tidak disimpan. Hasil: kunci publik
     `~/.garage-ops/backup-public.asc` (dipakai jadwal) + file `garage-backup-PRIVATE-<fingerprint>.asc` (simpan 2 salinan,
     mis. flashdisk + password manager). Kunci privat atau kata sandi hilang = backup tidak bisa dibuka.
  2. Daftarkan ulang jadwal (perintah `register-pull-backups-task.ps1` di atas) supaya skrip terbaru tersalin ke `~/.garage-ops`.
     Tarikan berikutnya menyimpan hanya `*.sql.gz.gpg`, mengunci backup polos lama di folder tujuan lalu menghapus versi polosnya.
     Tanpa kunci publik skrip tetap menyalin polos dengan PERINGATAN di log (`REQUIRE_ENCRYPTION=1` = gagal).
  3. Uji buka (bulanan): `bash scripts/restore-from-encrypted.sh "<file>.sql.gz.gpg" /e/GarageKunci/garage-backup-PRIVATE-….asc --check`;
     `--drill` = pulihkan ke Postgres sementara di Docker laptop (jumlah baris + sidik buku kas); `--out <file>` = hasil dekripsi untuk
     pemulihan sungguhan (hapus sesudahnya). Kunci privat hanya diimpor ke keyring sementara yang dihapus otomatis.
- **Uji pulih backup** (`scripts/restore-drill.sh`): backup terbaru dipulihkan ke container sementara di jaringan
  sendiri, dibandingkan dengan produksi (jumlah baris + sidik buku kas), lalu dihapus. Produksi hanya dibaca.
  `tr -d '\r' < scripts/restore-drill.sh | ssh -i ~/.ssh/garage_deploy root@201.18.211.55 'bash -s'` — saat outlet tutup.

---

## C. Setelah deploy MCP ChatGPT (PR #82–#86)

Fitur ChatGPT **mati** sampai Owner mengaktifkannya di `/root/garage/.env.production`:
```
GARAGE_MCP_CHATGPT_ENABLED=true
```
lalu `docker compose --env-file .env.production up -d --no-build app`. Detail: `docs/AGENT-API.md` §6.

## D. Hemat menit GitHub Actions

Sejak PR ini, CI **tidak** berjalan untuk PR **draft**. Tandai PR "Ready for review" bila
ingin dites di GitHub, atau jalankan manual dari tab Actions → CI → Run workflow.
Push ke `main` tetap dites dan tetap memicu `deploy.yml` (bila Actions aktif).
