# Aktivasi Supabase — Checklist Final

Semua kode sudah siap. Yang tersisa **hanya OAuth Supabase MCP** oleh owner
karena aturan sistem melarang AI melakukan flow login OAuth di sesi
non-interaktif.

## ✅ Yang Sudah Selesai (Verified)

- [x] Kode migrasi 94 file drizzle — dry-run **94/94 sukses, 0 error**
- [x] Skema akan menghasilkan **131 tabel** (13 tabel kunci: user, orders, payroll, wms, connect)
- [x] Script health-check + seed sudah teruji di PGlite fresh
- [x] Panduan deploy step-by-step di `docs/HOSTINGER_SUPABASE_DEPLOY.md`
- [x] Fix 3 bug atomicity (redeem, wage, fee-pool) — 291/291 test hijau
- [x] MCP config `.mcp.json` (Supabase + 7 Hostinger) siap load
- [x] Semua commit sudah di GitHub (`feat/garage-connect-mvp`)

## ⏳ Yang Harus Owner Lakukan (Sekali, ~5 menit)

### 1. Auth Supabase MCP (di terminal lokal, bukan chat ini)

```powershell
cd "D:\GARAGEFIX\G A R A G E"
claude
```

Setelah Claude Code interaktif terbuka:

```
/mcp
```

- Pilih **supabase**
- Pilih **Authenticate**
- Login Supabase di browser yang terbuka
- Otorisasi akses project `dzuglwggxxcqkiwwsutt`
- Tutup terminal

### 2. Kembali ke chat ini

Bilang:
> `sudah auth`

## 🤖 Yang Akan Aku Kerjakan Setelahnya (~3 menit)

1. **Migrasi Supabase** — jalankan 94 file via `mcp__supabase__apply_migration`
   → 131 tabel terbentuk
2. **Verifikasi** — cek tabel kunci + entry `drizzle.__drizzle_migrations`
3. **Seed owner** — 1 outlet + akun owner (kamu kasih email + password kuat)
4. **Kasih 8 env untuk hPanel Hostinger:**
   - `DATABASE_URL` (Pooler port 6543 + `?pgbouncer=true`)
   - `GARAGE_DB_DRIVER=postgres`
   - `DATABASE_SSL=true`
   - `BETTER_AUTH_SECRET` (aku generate random)
   - `BETTER_AUTH_URL=https://www.garagecoffee.id`
   - `GARAGE_TRUSTED_ORIGINS`, `GARAGE_PUBLIC_BASE_URL`, `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL`
5. **Cek health post-redeploy** — `/api/health` harus `driver: postgres` (bukan `pglite`)

## 🎯 Setelah Ini Selesai

Data persisten, migrasi tercatat, owner bisa login di `https://www.garagecoffee.id`
pakai email+password. Payroll V2 cron 00:15 WIB otomatis jalan. Absensi karyawan
siap dipakai (setelah owner set GPS + upah + PIN di UI setting).

---

**Tidak ada lagi kerjaan kode. Blocker terakhir tinggal 1 OAuth 5 menit di terminal terpisah.**
