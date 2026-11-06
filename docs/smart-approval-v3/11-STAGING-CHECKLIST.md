# Smart Approval V3 — 11 Checklist uji staging (untuk Owner)

Branch: `ccr-29608758-dtli1n` (AYA V4, Smart Approval V3, Living Intelligence, Batch 7, perbaikan audit A–D).
Migrasi baru: **0177** (approvals V3), **0178** (kasus AYA), **0179** (persetujuan dokumen), **0180** (kedaluwarsa).
Produksi tidak disentuh. Staging = `https://staging.garagecoffee.id` (password akses: `cat /root/garage-staging/STAGING_ACCESS.txt`).

## A. Persiapan (di laptop Owner)

1. `git fetch origin && git checkout ccr-29608758-dtli1n && git pull`
2. `bash scripts/deploy-staging.sh --refresh-data`
   (data produksi disamarkan; migrasi 0177–0180 berjalan otomatis saat app start).
3. Di staging, 2FA, API key agent dan langganan push **dihapus** oleh penyamaran. Aktifkan ulang:
   - Login Owner (password biasa) → **Control → 2FA** → aktifkan dengan aplikasi authenticator.
   - Izinkan notifikasi browser/HP di staging (untuk uji push).
   - Siapkan 2 akun kasir dan 1 Manajer (akun staf biasa; password sama dengan produksi).

## B. Cek migrasi (opsional, di VPS)

```bash
cd /root/garage-staging
docker compose -f docker-compose.staging.yml exec staging-db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "\\d approvals"' | grep -E "outlet_id|amount_value|execution_status|expires_at"
docker compose -f docker-compose.staging.yml exec staging-db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select execution_status, count(*) from approvals group by 1"'
```
Harapan: 4 kolom ada; approval lama berstatus pelaksanaan `legacy`. Migrasi dijalankan service `staging-migrate`.

## C. Skenario uji

| # | Langkah | Hasil yang diharapkan | Hasil (✅/❌ + catatan) |
|---|---|---|---|
| 1 | Kasir (shift buka) minta diskon manual **Rp40.000** dan **Rp150.000** dari POS | Dua pengajuan muncul; Rp150.000 bertanda "Risiko tinggi · R3" | |
| 2 | Manajer di **Persetujuan** membuka diskon Rp40.000 → Setujui | Disetujui; kasir bisa memakainya di order (sekali pakai) | |
| 3 | Manajer membuka diskon Rp150.000 | Tidak ada tombol Setujui, tertulis "menunggu Owner (2FA)"; tombol **Tolak** tetap ada | |
| 4 | Owner di **Persetujuan** membuka diskon Rp150.000 | Tombol "Setujui di Decision Center (2FA)" | |
| 5 | Owner di **Control → Decision Center** → pilih diskon Rp150.000 → Setujui | Dialog meminta **kode 2FA**; tanpa kode tombol mati; dengan kode → Disetujui, "Berhasil dijalankan" | |
| 6 | Detail pengajuan di Decision Center | Ada "Kelengkapan bukti", fakta riwayat pemohon 30 hari, tombol **PDF** (terunduh, 2 halaman) | |
| 7 | Push ke HP Owner saat kasir mengajukan diskon ≥ Rp100.000 | Notifikasi "Persetujuan risiko tinggi" ≤ 1–2 menit, tanpa nama kasir | |
| 8 | Kasir ajukan **void** order kecil (< Rp500.000); Manajer setujui | Order batal, stok kembali (alur lama) | |
| 9 | Kasir ajukan **void** order ≥ Rp500.000; Manajer mencoba setujui | Ditolak "hanya Owner"; Owner menyetujui dari Decision Center + 2FA | |
| 10 | Manajer menutup shift **miliknya** dengan selisih besar → buka pengajuan "Selisih kas" | Manajer itu **tidak bisa** menyetujui ("Shift ini milik Anda"); Manajer lain/Owner bisa | |
| 11 | Diskon yang disetujui tapi tidak dipakai > 6 jam (opsional, bisa dicek esok hari) | Status **Kedaluwarsa**; tidak bisa dipakai di POS | |
| 12 | **Control → AI Governance** → pilih "Baca saja", lalu "Eksekusi terkendali" | Mode berubah; "Eksekusi terkendali" minta konfirmasi kedua; kartu **Kualitas keputusan** tampil | |
| 13 | Manajer membuka **Pengaturan → Security** → ubah "Jeda koneksi ChatGPT" | Ditolak ("hanya bisa diubah Owner"); setelan sesi/lockout tetap bisa | |
| 14 | Owner buat API key agent (Pengaturan → API key) lalu panggil `POST /api/agent/v1/tools/putuskan_approval` | `403 AGENT_CANNOT_DECIDE` | |
| 15 | **Control → Living Intelligence**, **AYA Solver**, **Decision Center** di HP (390 px) dan laptop | Terbuka tanpa error; tidak ada teks terpotong | |
| 16 | Unggah versi baru dokumen perusahaan (Control) | Versi "menunggu persetujuan"; muncul di Decision Center sebagai Dokumen/SOP; setelah disetujui menjadi versi berlaku | |
| 17 | Alur harian: buka shift, jual tunai & QRIS, Belum Bayar → Final Bayar, tutup shift + setoran | Sama seperti produksi sekarang | |

Contoh perintah uji 14 (ganti `<KEY>` dan `<ID>`):
```bash
curl -s -X POST https://staging.garagecoffee.id/api/agent/v1/tools/putuskan_approval \
  -u staging:<password-akses> -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \
  -d '{"id":"<ID>","keputusan":"approved"}'
```
(Bila basic-auth Caddy dan header Authorization bentrok, cukup tandai uji ini "dilewati" — sudah dicakup tes otomatis.)

## D. Bila ada yang gagal

Kirim ke Claude: nomor langkah, screenshot, jam kejadian (WIB), ID pengajuan (`APP-…`), dan teks pesan error.
Jangan perbaiki data langsung di database.

## E. Setelah staging lulus

1. Owner menyetujui merge PR ke `main` (Claude tidak me-merge tanpa persetujuan).
2. Di laptop: `bash scripts/release-check.sh` pada `main` hasil merge (wajib lulus).
3. Backup produksi terverifikasi, lalu `bash scripts/deploy-manual.sh` **di luar jam operasional**.
4. Setelah deploy: Owner aktifkan 2FA di produksi (bila belum) — tanpa 2FA, pengajuan R3 tidak bisa disetujui.
5. Beri tahu staf perubahan perilaku:
   - Manajer tidak bisa lagi menyetujui void/refund/selisih kas besar dan diskon ≥ Rp100.000 (tetap bisa menolak).
   - Diskon yang disetujui berlaku 6 jam.
   - Integrasi API key agent tidak bisa lagi memutus pengajuan.

## F. Rollback

- Staging: deploy ulang branch `main` (`git checkout main && bash scripts/deploy-staging.sh`). Migrasi 0177–0180 aditif
  (kolom/tabel baru, tidak ada data dihapus) — boleh dibiarkan.
- Produksi: `deploy-manual.sh` sudah melakukan rollback otomatis bila smoke test gagal; kolom baru aman dibiarkan.
