# Garage OS — Panduan Teknis

Untuk developer, DevOps, dan teknisi yang setup/maintain sistem.

---

## Stack

- **Next.js 16 App Router** (Turbopack build)
- **TypeScript** (strict)
- **Tailwind v4** + shadcn/ui + lucide-react
- **Drizzle ORM** + **PostgreSQL** (production) / **PGlite** (dev/single-outlet)
- **Better Auth** (email/password + 2FA TOTP)

## Environment Variables

| Var | Wajib | Deskripsi |
|---|---|---|
| `DATABASE_URL` | Ya (prod) | Connection string Postgres |
| `GARAGE_DB_DRIVER` | - | `postgres` atau `pglite` (default: auto-detect) |
| `PGLITE_DATA_DIR` | - | Path PGlite local (default: `D:/GARAGEFIX/pglite-data-running`) |
| `BETTER_AUTH_SECRET` | Ya | Min 32 char random (gunakan `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Ya | Origin app, mis. `https://app.garage.local` |
| `DATABASE_SSL` | - | `true`/`false`, auto-detect neon.tech |

`.env.example` tersedia sebagai template.

## Build & Run

### Development (PGlite local)
```bash
npm install
npm run dev          # port 3001, hot reload
```

### Production
```bash
npm install
npm run build        # next build, dgn DATABASE_URL set (tapi tidak butuh DB live)
npm run start        # production server
```

> **Penting**: `npm run build` **tidak boleh** butuh koneksi DB live. Halaman dengan akses session pakai `export const dynamic = "force-dynamic"` untuk opt-out dari static prerender.

## Database

### Migrasi
**JANGAN** pakai `drizzle-kit migrate` di Windows + PGlite (rusak `Aborted()`). Gunakan script bootstrap:

```bash
GARAGE_DB_DRIVER=pglite PGLITE_DATA_DIR=D:/GARAGEFIX/pglite-data-running \
  npx tsx src/scripts/bootstrap-pglite.ts
```

Untuk **Postgres production**, drizzle-kit aman:
```bash
GARAGE_DB_DRIVER=postgres DATABASE_URL=... npm run db:migrate
```

### Seed
```bash
npm run db:seed   # owner@garage.local / garage12345 + outlet default
```

### Backup
```bash
node --env-file=.env.local scripts/backup.mjs   # ke backups/garage-*.sql
```

### Restore
```bash
psql "$DATABASE_URL" < backups/garage-YYYYMMDD-HHMMSS.sql
```

---

## DB Recovery — "BACKEND BELUM DIKONFIGURASI / Aborted()"

PGlite crash-recovery gagal karena lock basi atau dir corrupt.

### Langkah:

1. **Stop semua node**:
   ```powershell
   Get-Process node | Stop-Process -Force
   ```

2. **Hapus lock basi** (data tidak hilang):
   ```powershell
   Remove-Item D:/GARAGEFIX/pglite-data-running/postmaster.pid -Force
   ```

3. **Restart**:
   ```bash
   npm run dev
   ```

4. Kalau masih gagal → dir benar-benar corrupt. Pindahkan + buat ulang:
   ```powershell
   Rename-Item D:/GARAGEFIX/pglite-data-running D:/GARAGEFIX/pglite-data-running.broken-$(Get-Date -F yyyyMMdd-HHmmss)
   # Lalu bootstrap + seed ulang
   GARAGE_DB_DRIVER=pglite PGLITE_DATA_DIR=D:/GARAGEFIX/pglite-data-running npx tsx src/scripts/bootstrap-pglite.ts
   npm run db:seed
   ```
   Restore data lama (kalau perlu) dari backup terakhir.

---

## Migrasi PGlite → Postgres Production

1. **Setup Neon** (atau Postgres lain). Buat database baru.
2. Set env: `GARAGE_DB_DRIVER=postgres`, `DATABASE_URL=postgres://...?sslmode=require`
3. Migrasi schema:
   ```bash
   npm run db:migrate   # drizzle-kit ok untuk Postgres
   ```
4. Seed initial:
   ```bash
   npm run db:seed
   ```
5. (Opsional) Import data PGlite via SQL backup:
   ```bash
   node --env-file=.env.local scripts/backup.mjs   # bikin SQL dari PGlite
   psql "$NEW_DATABASE_URL" < backups/garage-*.sql
   ```

---

## Security Posture (Fase 4)

| Mitigasi | Lokasi | Default |
|---|---|---|
| 2FA wajib `/control` | `ControlDashboardRoute.tsx` | ON via `securityRequire2faForOwner` |
| Rate-limit sign-in 10/menit/IP | `src/app/api/auth/[[...all]]/route.ts` | always |
| Rate-limit reset-password 5/menit | sama | always |
| Idempotency POS create order | `src/lib/idempotency.ts` | header `X-Idempotency-Key` |
| Anti stok minus | `garage-service.ts adjustInventoryLocationStock` | always |
| Anti close ganda | `garage-service.ts closeCashSession` | always |
| Split payment validation | `garage-service.ts createOrder` | always (kalau field `splits` ada) |

## Performance (Fase 1-3)

| Optimization | Lokasi |
|---|---|
| Code-split garage-app.tsx → 19 lazy modules | `garage-app.tsx` dynamic imports |
| Code-split team-management → 12 lazy panels | `team-management-dashboard.tsx` |
| ETag 304 polling | `src/lib/http-etag.ts` + kitchen/waiter/dashboard endpoints |
| Composite DB index | `drizzle/0056_charming_dust.sql` |
| Loading skeleton route | `garage-route-loading.tsx` + `app/*/loading.tsx` |
| Offline queue POS | `src/lib/pos-offline-queue.ts` (foundation, UI follow-up) |

## Testing Quick Smoke

```bash
# Login + 1 order + verifikasi audit
curl -X POST http://localhost:3001/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@garage.local","password":"garage12345"}' \
  -c cookies.txt
# Buka shift via UI atau API → buat order via API → cek /api/audit
```

Full E2E test plan ada di `CHECKLIST_KERJA_MVP.md` section B.1.

## Lint & Build CI

```bash
npm run lint   # eslint, 0 error 0 warning state
npm run build  # next build, 169/169 halaman, TypeScript pass
```

---

## Troubleshooting Build

### "RuntimeError: Aborted()" di prerender
Halaman pakai `requireGarageSession()` tapi belum opt-out static. Tambah:
```tsx
export const dynamic = "force-dynamic";
```

### "Failed to compile" Turbopack
`next/dynamic` butuh **object literal inline** untuk options. Jangan pakai variabel:
```ts
// ❌ const opts = { loading: Skel }; dynamic(() => ..., opts);
// ✅ dynamic(() => ..., { loading: Skel });
```

### Lint error "set-state-in-effect"
Pakai `useSyncExternalStore` untuk subscribe browser API (mis. `navigator.onLine`), bukan setState dlm useEffect.

---

Lihat juga:
- `PLANNING_TAHAP3_PRODUCTION.md` — roadmap status
- `CHECKLIST_KERJA_MVP.md` — checklist detail per modul
- `STRUKTUR APLIKASI.MD` — peta struktur aplikasi
