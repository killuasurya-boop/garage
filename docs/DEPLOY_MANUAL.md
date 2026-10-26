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

# 1) Cek dulu — server TIDAK diubah
bash scripts/deploy-manual.sh --dry-run

# 2) Deploy sungguhan (akan diminta mengetik DEPLOY)
bash scripts/deploy-manual.sh
```

Hasil yang diharapkan di akhir: `✓ Sehat (HTTP 200). Deploy <commit> SELESAI.`

### Bila gagal
| Pesan | Arti / tindakan |
|---|---|
| `Commit lokal … ≠ origin/main` | Jalankan `git checkout main && git pull`, ulangi. |
| `Ada perubahan lokal yang belum di-commit` | `git stash`, ulangi. |
| `SSH … gagal` | Kunci salah / belum ada di `authorized_keys` VPS / IP VPS berubah. |
| `Deploy lain sedang jalan` | Pastikan tidak ada deploy lain (GitHub Actions / laptop lain). Bila yakin, hapus folder `/root/garage/.deploy-lock` di VPS. |
| Berhenti di **backup** | Deploy otomatis berhenti **sebelum** migrasi — app lama tetap jalan. Cek ruang disk VPS. |
| `Kesehatan gagal — rollback` | App sudah dikembalikan ke versi sebelumnya. Migrasi yang sudah jalan **tidak** dibatalkan (semua migrasi Garage additive). Kirim file log di `deploy-logs/` ke agent. |

### Rollback manual (bila perlu)
Di VPS:
```bash
cd /root/garage
docker tag garage-app:previous garage-app:latest
docker compose --env-file .env.production up -d --no-build app
```

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
