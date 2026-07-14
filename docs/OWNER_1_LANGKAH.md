# Aktivasi Supabase — 1 Langkah untuk Owner

**Tanpa terminal, tanpa command.** Cuma copy-paste env di panel Hostinger + klik
Redeploy. Sistem otomatis migrasi 94 file ke Supabase saat app start.

## Langkah Tunggal (~10 menit)

### 1. Ambil connection string Supabase (2 menit)

Buka: https://supabase.com/dashboard/project/dzuglwggxxcqkiwwsutt

Klik **Settings** (⚙️ kiri bawah) → **Database** → cari **Connection string** →
klik tab **URI**.

Ada 2 tab: **Session** (port 5432) dan **Transaction pooler** (port 6543).
**Copy yang Transaction pooler** (yang port 6543). Bentuknya:

```
postgresql://postgres.dzuglwggxxcqkiwwsutt:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Ganti `[YOUR-PASSWORD]` dengan **password database Supabase** kamu (di halaman
yang sama ada tombol reset kalau lupa).

### 2. Set 8 Environment Variables di hPanel Hostinger (5 menit)

Buka hPanel Hostinger → Web App → **Environment Variables**.

Tambahkan 8 baris ini (copy-paste, ganti nilai `<...>`):

```
DATABASE_URL=postgresql://postgres.dzuglwggxxcqkiwwsutt:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
GARAGE_DB_DRIVER=postgres
DATABASE_SSL=true
BETTER_AUTH_SECRET=<generate-panjang-di-langkah-3>
BETTER_AUTH_URL=https://www.garagecoffee.id
GARAGE_TRUSTED_ORIGINS=https://www.garagecoffee.id,https://garagecoffee.id
GARAGE_PUBLIC_BASE_URL=https://www.garagecoffee.id
NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL=https://www.garagecoffee.id
```

⚠️ **PENTING**: Perhatikan **port 6543** dan **`?pgbouncer=true`** di ujung
`DATABASE_URL`. Ini format khusus untuk aplikasi (bukan admin/migrasi).

### 3. Generate `BETTER_AUTH_SECRET` (1 menit)

Buka https://1password.com/password-generator/ atau situs random string apa saja.
Buat string acak **minimal 32 karakter**, campur huruf + angka + simbol. Contoh:
```
a3F9k2mQ8vN4pL7xR6tY1wZ5jH0bC8dE
```
Paste ke `BETTER_AUTH_SECRET` di step 2.

### 4. Klik Redeploy di hPanel Hostinger (2 menit)

Hostinger akan:
1. Pull kode terbaru dari GitHub
2. Install dependencies
3. Build Next.js
4. **Jalankan `npm start` → yang otomatis migrate 94 file ke Supabase → lalu start app**
5. Layanan hidup di https://www.garagecoffee.id

### 5. Verifikasi (30 detik)

Buka: https://www.garagecoffee.id/api/health

Harus lihat:
```json
{
  "data": {
    "ok": true,
    "database": {
      "configured": true,
      "status": "reachable (postgres)",
      "driver": "postgres"    ← BUKAN pglite lagi!
    }
  }
}
```

Kalau `driver: postgres` = **berhasil!** ✅

### 6. Buat Akun Owner Pertama

Buka https://www.garagecoffee.id/register (atau `/signup`) → daftar dengan
email + password kamu. Akun pertama otomatis jadi Owner.

Atau kalau tidak ada halaman register, kabari aku dengan **email owner** yang
kamu mau — aku bantu bikin via query MCP read-only + panduan insert.

---

## Kalau Ada Masalah

**Redeploy gagal / error di build:**
- Cek log Hostinger. Screenshot atau copy error ke chat.
- Kemungkinan `DATABASE_URL` typo (salah password, salah port, atau `?pgbouncer=true` hilang).

**`/api/health` masih `pglite`:**
- Env `GARAGE_DB_DRIVER=postgres` belum di-set atau typo.
- Restart / redeploy ulang.

**Login gagal setelah migrasi:**
- DB kosong (tabel `user` tidak ada isi). Perlu insert akun owner.
- Kabari aku, kita seed via query.

---

## Alur Deploy Auto-Migrate (untuk referensi teknis)

`package.json` script `start` sekarang:
```json
"start": "npm run db:migrate:runner && next start -H 0.0.0.0 -p 3001"
```

Setiap Hostinger jalankan `npm start`:
1. `npm run db:migrate:runner` → panggil `src/db/migrate.ts`
2. Runner cek `drizzle.__drizzle_migrations` — skip yang sudah applied
3. Apply migrasi baru (kalau ada file yang belum tercatat)
4. **Idempoten** — aman dijalankan berulang, tidak duplicate
5. Kalau semua migrasi lancar → `next start` naik → app hidup

Runner **tidak throw pada error** — kalau ada migrasi bermasalah, dia catat di log tapi tetap `exit 0` biar app tetap start. Ini disengaja: **data tidak sinkron lebih baik daripada app total down**.
