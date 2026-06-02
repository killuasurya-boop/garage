---
description: FASE 3 — Cek Data Pre-Deploy Garage OS
argument-hint: "[opsional: scope, mis. data / env / vps / backup]"
---

# FASE 3 — Pre-Deploy Data Audit

Kamu **WAJIB planning mode** (no edit). Tugas: verifikasi data + environment + VPS readiness sebelum deploy production.

## Sumber acuan

@GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md
@STRUKTUR APLIKASI.MD
@POLA_KERJA_AI_AGENT.md
@panduan_deploy_aplikasi_mvp_ke_vps.md
@CLAUDE.md

## Argumen
Scope: **$ARGUMENTS** (kosong → audit semua).

## Cara Kerja

### Langkah 1 — Pra-syarat
- Konfirmasi FASE 2 (`/fase2`) sudah GO.
- Jika belum → **STOP**, arahkan kembali ke `/fase2`.

### Langkah 2 — Audit 9 Dimensi Pre-Deploy

Acuan: `POLA_KERJA_AI_AGENT.md` section 3.1–3.9 + `panduan_deploy_aplikasi_mvp_ke_vps.md` section 3, 9, 18–24.

#### 3.1 Pembersihan Data
- Cek `src/lib/garage-data.ts` — apakah seed berisi data dummy yang tidak boleh masuk production?
- Cek `drizzle/` — migration & seed rapi?
- Cek apakah ada akun test password lemah → grep di seed/script

#### 3.2 Validasi Data Master
- Outlet (geofence, jam operasi) → `src/lib/garage-app-settings-types.ts`, `garage-settings-schema.ts`
- Produk + varian → `garage-data.ts`
- Inventory + min stock → `garage-data.ts`
- Role + permission matrix → `src/lib/role-access.ts`, `page-access.ts`
- User awal (owner/admin) → `src/lib/admin-user-service.ts`

#### 3.3 Environment Variable
- `.env.example` ada?
- `.gitignore` mengabaikan `.env`?
- Variabel wajib: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`
- Cek tidak ada secret hard-coded di kode

#### 3.4 Database Pre-Deploy
- `drizzle.config.ts` siap
- Folder `drizzle/` punya migration
- `src/db/schema.ts` final
- Index di FK + field search
- `src/db/index.ts` lazy init (tidak query saat import)

#### 3.5 Backup & Rollback
- `scripts/backup.mjs` ada + readable
- Apakah ada `scripts/rollback.sh` atau prosedur rollback?
- Retention plan?

#### 3.6 VPS Readiness
Acuan: `panduan_deploy_aplikasi_mvp_ke_vps.md` section 4–8, 13–15.
- Dockerfile ada?
- `docker-compose.yml` ada?
- Nginx config template ada?
- Folder `nginx/`, `scripts/` di repo?

#### 3.7 Monitoring & Logging
- Endpoint `/api/health` ada? Cek `src/lib/garage-health-service.ts`
- `client-error-reporter.tsx` aktif?
- Log aplikasi tidak bocorkan password/token

#### 3.8 Security Hardening Pre-Deploy
- Security headers Nginx (template)
- Rate limit endpoint sensitif
- `npm audit` clean (cek lock file)
- CEO Control 2FA aktif

#### 3.9 Dokumentasi
- `CLAUDE.md`, `STRUKTUR APLIKASI.MD`, `POLA_KERJA_AI_AGENT.md`, `GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md` up-to-date?
- `panduan_deploy_aplikasi_mvp_ke_vps.md` ada?
- Template info server diisi?

### Langkah 3 — Laporan Planning Mode

```
# FASE 3 — Pre-Deploy Report

## Pra-syarat
- [ ] FASE 2 GO ✅/❌

## Status 9 Dimensi
| Dimensi | Status | Item ❌ | Path |
|---|---|---|---|
| 3.1 Pembersihan Data | ✅/🟡/❌ | ... | ... |
| 3.2 Data Master | ... | ... | ... |
| 3.3 ENV | ... | ... | ... |
| 3.4 Database | ... | ... | ... |
| 3.5 Backup | ... | ... | ... |
| 3.6 VPS | ... | ... | ... |
| 3.7 Monitoring | ... | ... | ... |
| 3.8 Security Hardening | ... | ... | ... |
| 3.9 Dokumentasi | ... | ... | ... |

## Daftar File yang Perlu Disiapkan Sebelum Deploy
- [ ] `.env.example` lengkap
- [ ] `Dockerfile`
- [ ] `docker-compose.yml`
- [ ] `nginx/app.conf`
- [ ] `scripts/deploy.sh`
- [ ] `scripts/rollback.sh`
- [ ] `scripts/backup-db.sh`
- [ ] (lainnya...)

## Data Master Wajib Diisi PIC
- [ ] Data outlet (nama, alamat, geofence, jam)
- [ ] Data owner / admin awal
- [ ] Data role + permission per role
- [ ] Logo + branding company_settings

## Go/No-Go Deploy
[ ] Semua dimensi ✅
[ ] PIC technical + product confirmed
[ ] Window deploy disepakati
[ ] Rollback plan dipahami semua PIC

Keputusan: **GO / NO-GO DEPLOY**

## Rencana Eksekusi Deploy (urut)
1. Backup staging DB
2. Tag release di Git
3. Deploy ke VPS (docker compose up -d --build)
4. Jalankan migration
5. Jalankan seed (idempotent)
6. Smoke test (login owner, transaksi POS test)
7. Monitoring 24 jam pertama
```

## Aturan
- **JANGAN edit file**.
- **JANGAN deploy beneran** — hanya planning.
- Output WAJIB punya: status tiap dimensi + daftar file/data yang masih kurang + Go/No-Go keputusan.
- Bahasa Indonesia.
