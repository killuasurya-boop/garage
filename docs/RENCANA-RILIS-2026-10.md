# Rencana rilis bertahap dari laptop (mulai 29 Okt 2026)

Semua deploy dari **laptop Owner** (Git Bash + Docker Desktop), bukan dari VPS (RAM 4 GB, pernah OOM) dan bukan
GitHub Actions (billing mati). Satu tahap = satu deploy. Tahap berikutnya hanya setelah tahap sebelumnya sehat
minimal satu hari operasional.

## Alur tetap setiap tahap (laptop)

```bash
cd garage
git checkout main && git pull

# 1. Pemeriksaan rilis main gabungan (±10 menit) — harus "RILIS SIAP"
bash scripts/release-check.sh

# 2. Cek rencana tanpa mengubah server
bash scripts/deploy-manual.sh --dry-run

# 3. Deploy (backup DB otomatis → migrasi → jalan → health → smoke test; gagal = rollback otomatis)
bash scripts/deploy-manual.sh
```

Sebelum langkah 3:
- Tidak ada shift terbuka (Kontrol Kas) dan outlet sepi/tutup. Aplikasi restart ±30–60 detik.
- Docker Desktop menyala; laptop tidak tidur selama deploy (±15 menit).

Sesudah deploy: hasil akhir harus `SMOKE OK` + `Deploy <commit> SELESAI`, lalu jalankan **cek manual** tahap itu.
Gagal di tengah → app otomatis kembali ke versi sebelumnya; kirim file `deploy-logs/deploy-*.log` ke agent.

## Tahap 1 — Fitur yang sudah di main + pengaman rilis
Isi: #121 (ChatGPT ubah data, Penjualan Langsung bergambar, hapus aman), #128/#129 (Owner 360, PDF resmi, buku kas),
#130 (katalog API), PR pengaman rilis (release-check, smoke test, endpoint peringatan server). **Tanpa migrasi DB.**

Cek manual (±10 menit, Owner):
1. Login Owner → **Kontrol Kas**: panel *Owner 360* tampil; unduh *PDF Closing harian* dan *Excel Buku kas*.
2. **Kelola Staff → Tambah Staff**: dialog bisa digulir, Simpan berhasil.
3. **POS → Penjualan Langsung**: foto produk, tab Favorit, *Uang pas* → bayar → *Jual lagi*.
4. **ChatGPT**: minta ubah nama satu menu → muncul konfirmasi; minta void order → diminta **kode 2FA**.
5. Kasir login seperti biasa, satu transaksi uji lalu batalkan sesuai prosedur.

## Tahap 2 — Pemantau server (tanpa deploy aplikasi)
Syarat: Tahap 1 sehat (endpoint `/api/jobs/system-alert` sudah ada).
```bash
bash scripts/install-vps-monitor.sh      # cron 5 menit di VPS
```
Cek: dalam 5 menit `/var/log/garage-monitor.log` berisi 7 pemeriksaan `ok`. Lepas: `--remove`.

## Tahap 3 — Uji pulih backup (tanpa deploy)
Saat outlet tutup:
```bash
tr -d '\r' < scripts/restore-drill.sh | ssh -i ~/.ssh/garage_deploy root@201.18.211.55 'bash -s'
```
Hasil harus `RESTORE DRILL: LULUS`. Container uji dihapus otomatis; DB produksi hanya dibaca.

## Tahap 3b — Backup di luar VPS (laptop / OneDrive)
Risiko terbesar: backup hanya di VPS yang sama. Setelah deploy yang memuat pemeriksaan `offsite`:
```powershell
powershell -ExecutionPolicy Bypass -File scriptsegister-pull-backups-task.ps1 -Dest "$env:USERPROFILEOneDriveGarage Backup"
```
Cek: besok pagi folder berisi `garage-daily-*.sql.gz` dan pemantau mencatat `offsite=ok`. File berisi data pelanggan &
karyawan — folder pribadi Owner saja.

## Tahap 4 — Staging aktif
Syarat: DNS `A staging → 201.18.211.55` (hPanel). Lalu `bash scripts/deploy-staging.sh --setup --refresh-data`.
Mulai tahap ini, setiap PR dicoba di staging sebelum Tahap deploy produksi.

## Tahap 5 dst — Pekerjaan baru (U1 design system, dll.)
Dipecah kecil; setiap pecahan: PR → staging → release-check → deploy → cek manual.

## Aturan
- Deploy, merge, dan perubahan konfigurasi produksi hanya atas perintah Owner.
- `--skip-release-check` hanya untuk perbaikan darurat, dicatat di log progres.
- Rollback manual: `docs/DEPLOY_MANUAL.md` bagian *Rollback manual*.
