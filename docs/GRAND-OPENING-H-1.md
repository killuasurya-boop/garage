# Runbook H-1 Grand Opening — Garage OS

Dijalankan **sehari sebelum buka** (atau malam H-1 setelah gladi terakhir), oleh Owner/Manajer. Syarat: `docs/GLADI-RESIK-LOG.md` tidak punya temuan P0/P1 terbuka.

## 1. Rapikan shift & sesi yang masih terbuka

- Login sebagai Owner/Manajer, lalu tutup semua shift kas yang masih terbuka lewat menu Shift.
  - Temuan gladi G-09: ada 2 shift terbuka di DB asli (`CS-OUTLET-A-237551`, `CS-OUTLET-A-641009`).
- Pastikan tidak ada order/bill yang masih harus ditagih ke pelanggan sungguhan.

## 2. Matikan server & backup

- Tutup jendela server Garage (port 3001). Pastikan tidak ada yang sedang transaksi.
- Pastikan port kosong (tidak ada output):
  ```
  Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3000,3001
  ```
- Backup otomatis dibuat oleh skrip di langkah 3. Tambahan yang disarankan: salin folder `.pglite-data` ke flashdisk/Drive.

## 3. Reset transaksi uji (master disimpan)

1. Lihat dulu apa yang akan dihapus (**dry-run**, tidak mengubah apa pun):
   ```
   npm run db:reset-opening
   ```
2. Periksa daftar **DIHAPUS** (order, tiket, kas, audit, payroll harian, dll.) dan **DISIMPAN** (akun, menu, resep, member, pengaturan).
3. Terapkan:
   ```
   npm run db:reset-opening -- --apply --yes
   ```
   - Backup otomatis dibuat di `backups/pre-grand-opening-<tanggal>` sebelum penghapusan.
   - Poin member **dipertahankan**. Bila poin berasal dari uji coba dan harus nol, tambahkan `--reset-member-points`.

## 4. Migrasi & nyalakan server

```
npm run db:migrate:runner
```

Lalu nyalakan server seperti biasa (`JALANKAN-GARAGE-PRODUKSI.bat`).

## 5. Stock opname pembukaan

- Semua stok bahan & gudang sekarang **0** (sengaja).
- Lakukan stock opname pembukaan: hitung fisik → input di Inventory/Warehouse → approve.
- Cek menu yang bahan kuncinya kosong tidak lagi "HABIS".

## 6. Cek akun & workstation (Manajemen User)

| Perangkat | Role | Workstation |
|---|---|---|
| PC kasir | Kasir | **Tidak ditugaskan produksi** |
| Tablet Bar | Kasir | Produksi BAR |
| Tablet Dapur | Kasir | Produksi DAPUR |
| HP helper | Kasir | Helper BAR / Helper DAPUR |
| HP waiter | Waiter | – |

- Akun helper bisa dibuat dengan:
  ```
  $env:HELPER_PASSWORD="…"; npx tsx src/scripts/create-helper-accounts.ts
  ```
- Hapus/nonaktifkan akun uji yang tidak dipakai. Akun `gladi.*` hanya ada di salinan gladi, tidak di DB asli.
- Semua waiter login di HP masing-masing (hanya waiter yang login yang bisa dipanggil helper).

## 7. Buka shift & uji 1 order

1. Kasir buka shift.
2. Buat 1 order uji dine-in (1 minuman + 1 makanan) atas nama "UJI".
3. Bar/Dapur MULAI → QC · READY. Helper ACC → panggil waiter. Waiter Diantar.
4. **Void** order uji itu dengan PIN manajer, lalu cek:
   - tiket hilang dari Production dan muncul pita "Dibatalkan";
   - stok kembali;
   - kas kembali.
5. Tutup meja: Tamu pergi → Bersihkan → Siap pakai.

## 8. Readiness Audit

- Buka `/control` → Readiness Audit.
- Targetkan status **GO**. Blocker keamanan yang tersisa dari audit terakhir (2FA Owner/Manajer, ganti password default, backup harian) dikerjakan sebelum buka.

---

## Versi VPS (garagecoffee.id, Docker) — fresh go-live

Jalankan di VPS dari folder `/root/garage`. `C` = `docker compose --env-file .env.production`.
Skrip memakai container `migrate` (kode & `tsx` sudah ada di image).

```bash
C="docker compose --env-file .env.production"
T="$C run --rm migrate node_modules/.bin/tsx"

# 1. Hentikan transaksi: matikan aplikasi (DB tetap jalan)
$C stop app

# 2. Backup dulu (WAJIB) → ./backups/garage-pre-reset-*.sql.gz
$C run --rm backup once pre-reset

# 3. Lihat rencana (dry-run, tidak mengubah apa pun)
$T src/db/reset-grand-opening.ts

# 4. Terapkan reset + verifikasi otomatis "FRESH ✓" (semua transaksi & saldo 0)
$T src/db/reset-grand-opening.ts --apply --yes --backup-done
#    tambah --reset-member-points bila poin/kunjungan member berasal dari uji coba

# 5. Samakan 11 akun operasional (dry-run dulu, lalu --apply).
#    Akun di luar daftar hanya dihapus bila --remove-others.
$T src/scripts/garage-setup-accounts.ts
$T src/scripts/garage-setup-accounts.ts --apply --remove-others
#    → CATAT password sementara yang tercetak (sekali saja); wajib ganti saat login pertama.

# 6. Nyalakan aplikasi & cek bukti fresh (boleh diulang kapan saja, baca saja)
$C up -d app
$T src/db/reset-grand-opening.ts --status
```

11 akun operasional (pemetaan ke 4 role Garage OS):

| Akun | Jabatan | Role | Workstation |
|---|---|---|---|
| owner@garage.id | Owner | Owner | – |
| manajer@garage.id | Manajer | Manajer | – |
| barista1@ / barista2@garage.id | Barista (POS + BAR) | Kasir | Produksi BAR |
| waiter1@ / waiter2@ / waiter3@garage.id | Waiter | Waiter | – |
| koki@garage.id | Koki | Kasir | Produksi DAPUR |
| asisten.koki@garage.id | Asisten Koki | Kasir | Produksi DAPUR |
| helper.bar@garage.id | Helper Bar | Kasir | Helper BAR |
| helper.dapur@garage.id | Helper Dapur | Kasir | Helper DAPUR |

Owner/Manajer yang sudah ada **tidak diubah password-nya**. Nama tampilan bisa
diganti ke nama asli staf di Manajemen User setelahnya.

Uji alur bisnis (opsional, di server uji — **bukan** produksi):
`SMOKE_BASE=http://127.0.0.1:3002 SMOKE_PASSWORD=… node scripts/smoke-golive.mjs`
lalu reset lagi (langkah 2–4).
