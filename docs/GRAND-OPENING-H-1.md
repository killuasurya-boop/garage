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
