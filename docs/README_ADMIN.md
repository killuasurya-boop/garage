# Garage OS — Panduan Admin

Untuk Owner, Admin, dan Manager yang mengelola sistem (bukan kasir harian).

---

## Setup Outlet Pertama Kali

1. Login sebagai **Owner / CEO**
2. Buka `/control/branches` — Outlet default sudah ada dari seed
3. Edit nama outlet, jam operasi, lokasi (untuk geofence attendance)

## Setup Staff

1. `/control/users` — Tambah staff
2. Set role + outlet
3. Kirim kredensial awal (password default = `garage12345`)
4. **Wajib**: minta staff ganti password di first-login (panel `/account/password?required=1` otomatis muncul kalau `passwordResetRequired=true`)

## Setup 2FA (Wajib untuk Owner)

1. `/control/2fa` — Scan QR di app authenticator (Google Authenticator / Authy)
2. Confirm kode 6 digit
3. **Setelah aktif, login berikutnya akan minta challenge 2FA**

> **Tips**: Setelah enable, kalau policy `securityRequire2faForOwner` aktif (default ON di production), akses ke `/control/*` di-paksa via 2FA.

## Setting yang penting

`/control/settings` — pengaturan global + per-outlet:

| Setting | Default | Pengaruh |
|---|---|---|
| `securityRequire2faForOwner` | true | Paksa 2FA Owner |
| `shiftDiscrepancyThreshold` | 50000 | Selisih kas > rupiah ini → masuk approval |
| `shiftRequireManagerSignoff` | true | Sign-off manager wajib untuk closing critical |
| `lowStockThreshold` | (per item) | Kapan stok jadi "low" |

## Backup DB

Snapshot manual:
```bash
# PGlite (dev/single-outlet)
robocopy D:\GARAGEFIX\pglite-data-running D:\backup\garage-snapshot-$(date) /E /B

# Postgres production (Neon/lainnya)
node --env-file=.env.production scripts/backup.mjs
# Hasil di backups/garage-YYYYMMDD-HHMMSS.sql
```

Restore:
```bash
psql "$DATABASE_URL" < backups/garage-YYYYMMDD-HHMMSS.sql
```

## Approval Board

`/os?module=approvals` — semua aksi sensitif yang menunggu keputusan:
- **Selisih kas closing** (otomatis dibuat saat tutup shift critical)
- **Manual discount** (kasir minta diskon di POS)
- **Refund / void order**

Approve / reject **bulk** via tombol di header. Setiap keputusan tercatat di audit log.

## Monitoring

- `/os?module=audit` — semua aksi user (immutable)
- `/control/health` — status sistem (DB, AI provider, queue)
- `/control/financial` — KPI keuangan multi-outlet
- `/control/risk` — anomaly detection AI

---

## Troubleshooting Cepat

### "BACKEND BELUM DIKONFIGURASI"
PGlite lock basi. Lihat `docs/README_TECHNICAL.md` → bagian DB Recovery.

### Kasir tidak bisa buka shift
Cek `/control/financial` apakah shift sebelumnya sudah ditutup. Cash session tidak boleh ada 2 yang `open` sekaligus per outlet.

### Order POS tidak muncul di KDS
Cek role koki/barista — KDS auto-filter station (Bar untuk Barista, Food untuk Koki).

### Login owner tapi tidak bisa akses /control
Cek role di `/control/users` — harus `Owner / CEO`. Cek juga 2FA — kalau policy on dan belum setup, akan paksa ke `/control/2fa`.

---

Untuk operasional staff harian, lihat `docs/README_USER.md`.
Untuk troubleshooting teknis & deploy, lihat `docs/README_TECHNICAL.md`.
