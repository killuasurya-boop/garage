# Staging Garage OS (R1)

Tempat mencoba versi baru **sebelum** masuk produksi. Izin Owner 28 Okt 2026: di VPS yang sama,
database terpisah, data disamarkan.

| | Produksi | Staging |
|---|---|---|
| Alamat | https://garagecoffee.id | https://staging.garagecoffee.id (password akses tambahan) |
| Folder VPS | `/root/garage` | `/root/garage-staging` |
| Database | `garage` (container `garage-db-1`) | `garage_staging` (service `staging-db`, container `garage-staging-staging-db-1`) |
| Image | `garage-app:latest` | `garage-app:staging` |
| Data | asli | salinan produksi yang **disamarkan** |
| Pesan keluar (WhatsApp, sosmed, push, ChatGPT) | aktif sesuai pengaturan | **mati** |
| Batas sumber daya | — | app 640 MB / 0,5 CPU · db 384 MB / 0,5 CPU |

## Yang disamarkan (`scripts/staging-anonymize.sql`)
- Pelanggan, member, tamu event, kandidat rekrutmen: nama, telepon, email, alamat (deterministik: nomor
  sama → samaran sama, jadi relasi order ↔ pelanggan tetap).
- Data pribadi staf: NIK, foto KTP, alamat, rekening, kontak darurat. Email login staf **tidak** diubah supaya
  Owner/staf bisa login staging dengan akun biasa.
- Dihapus: sesi login, token OAuth, API key agent, langganan push (HP staf tidak menerima notifikasi staging),
  kunci VAPID, antrean WhatsApp & posting sosmed, koneksi Google Drive/sosmed.
- Skrip menolak berjalan bila nama database tidak mengandung `staging`.

## Persiapan sekali (Owner)
1. **DNS** (hPanel Hostinger → Domain → garagecoffee.id → DNS): tambah `A` record
   `staging` → `201.18.211.55`.
2. Deploy produksi versi yang memuat PR R1 (Caddy mendapat folder `caddy-sites`).
3. Dari laptop (Git Bash, folder repo, Docker Desktop menyala):
   ```bash
   bash scripts/deploy-staging.sh --setup --refresh-data
   ```
4. Password akses staging ada di VPS: `cat /root/garage-staging/STAGING_ACCESS.txt` (user `staging`).

## Pakai sehari-hari
- Coba branch/PR di staging: `git checkout <branch>` lalu `bash scripts/deploy-staging.sh`.
- Data staging diperbarui dari produksi: tambah `--refresh-data`.
- Setelah oke di staging → merge PR → `bash scripts/deploy-manual.sh` (produksi).

## Mematikan staging
```bash
ssh root@201.18.211.55 "cd /root/garage-staging && docker compose -f docker-compose.staging.yml --env-file .env.staging down"
```
Lalu hapus `/root/garage/caddy-sites/staging.caddy` dan muat ulang Caddy:
`cd /root/garage && docker compose --env-file .env.production exec caddy caddy reload --config /etc/caddy/Caddyfile`.

## Insiden 28 Okt 2026 — nama service bentrok (WAJIB dibaca sebelum mengubah compose staging)
Versi pertama staging memberi nama service `app`/`db` dan ikut jaringan produksi `garage_default`. Docker lalu
menjawab nama `app` dengan DUA container (produksi + staging), sehingga Caddy produksi meneruskan sebagian
request ke staging → user produksi acak mendapat "Silakan login ke Garage OS" / "Invalid origin". Data produksi
tidak ada yang hilang atau masuk staging (dicek: staging hanya menerima percobaan login gagal).

Aturan:
- Service staging selalu berawalan `staging-` (`staging-db`, `staging-migrate`, `staging-app`); jangan pakai
  nama yang dipakai produksi (`app`, `db`, `caddy`, `migrate`).
- Hanya `staging-app` yang ikut `garage_default`, dengan alias `garage-staging-app`.
- `scripts/staging-network-guard.sh` dijalankan setiap deploy/refresh staging: bila `app`/`db` di
  `garage_default` dijawab lebih dari 1 container, staging langsung dimatikan. Cek manual:
  `ssh root@201.18.211.55 bash /root/garage-staging/scripts/staging-network-guard.sh`.
