# PLANNING — GARAGE OS → FINAL PRODUCTION READY

> Roadmap eksekusi dari **state sekarang** (41 ✅ · 7 🟡 · 19 ⬜) menuju Final
> Production Ready. Diurut berdasarkan **risiko × dampak**: yang paling
> berisiko atau memblokir hal lain → dikerjakan dulu.
>
> Prinsip kerja yang **TIDAK BOLEH DILANGGAR**:
> 1. Tidak menyentuh `createOrder` / path uang kecuali dengan rencana fokus + uji menyeluruh
> 2. Build hijau + lint 0/0 setelah tiap commit
> 3. Verifikasi end-to-end di app live (bukan asumsi), update checklist setelahnya
> 4. Backward compatible: alur lama jalan, fitur baru opt-in
> 5. Aman dari kerusakan: tidak `db:migrate` (gunakan `bootstrap-pglite`); dir DB tunggal

---

## FASE 0 — PRE-COMMIT WORK SAAT INI (≤ 30 menit)

**Tujuan**: state code bersih + ter-push sebelum mulai fase baru.

- [ ] Verifikasi git status — semua perubahan QRIS (3 surface + port 1:1) sudah ter-commit
- [ ] Hard-refresh browser → uji visual `/display/payment` & klik "Layar Customer" dari POS
- [ ] **PUSH** branch `garage/perf-hardening-mvp` ke remote (lindungi kerja 20+ commit)
- [ ] Buat snapshot DB: `node scripts/backup.mjs` → ada di `backups/garage-*.sql`

---

## FASE 1 — TUTUP MVP (Tahap 1 sisa) — risiko rendah

**Tujuan**: centang sisa B.3 + perbaiki 🟡 yang gampang. Tanpa sentuh path uang.

### 1.1 State UI per modul (B.3) — sweep visual
- [ ] **Empty state** — POS menu kosong, KDS antrian kosong, Inventory tabel kosong, CRM tanpa member, Audit tanpa log → semua tampil pesan ramah, bukan blank
- [ ] **Loading skeleton** — semua list/dashboard pakai skeleton bertema Garage saat fetch awal (banyak sudah punya, tinggal audit)
- [ ] **Error state + retry** — saat fetch gagal: pesan + tombol "Coba lagi" (jangan hanya toast hilang)
- [ ] **Toast** — sukses ✓ hijau dan error ✗ merah konsisten di POS checkout, void, approve, opname apply

**Estimasi**: 1 sesi. Risiko: rendah (visual saja). Dampak: tinggi (langsung kelihatan "rapi").

### 1.2 Verifikasi 🟡 yang murah
- [ ] **HR attendance punch** — uji POST `/api/hr/attendance/punch` dgn PIN seed → cek `employeeAttendances` row terbuat, geofence guard jalan
- [ ] **Shift scheduler conflict** — buat 2 shift overlap → cek UI peringatan
- [ ] **Inventory opname workflow** — draft → submit → approve → apply, cek `stockMovements` terbuat
- [ ] **Inventory transfer antar-outlet** — request → approve → issue, cek stok pindah
- [ ] **Finance rollup multi-outlet** — uji `?outletId=all` dari user Owner
- [ ] **AI recommend vs execute** — buat draft `aiActionDrafts`, eksekusi wajib approval

**Estimasi**: 1–2 sesi. Risiko: rendah (mostly verifikasi). Dampak: jelas dari 🟡 → ✅.

### 1.3 Redeem reward + voucher di POS
- [ ] Uji `voucher/validate` dari POS aktif
- [ ] Uji redeem point member: pilih reward → diskon otomatis applied → point berkurang
- [ ] Validasi member tak bisa redeem > saldo + member orang lain

**Estimasi**: 1 sesi. Risiko: sedang (menyentuh POS checkout). Dampak: fitur loyalty lengkap.

---

## FASE 2 — POS SPLIT PAYMENT (gap nyata C.1) — risiko tinggi, fokus

**Tujuan**: 1 order dibayar dgn >1 metode (Cash + QRIS misalnya). Schema `payments` sudah multi-row, tinggal API + UI.

> ⚠️ **Sesi terisolasi**. Tidak digabung dengan lain. Verifikasi B.1 (rantai inti) sebelum & sesudah.

### 2.1 Backend dulu (aman: backward-compat)
- [ ] Tambah field `splits?: Array<{ method, amount, reference? }>` ke schema Zod di `/api/orders` POST
- [ ] Validasi: `sum(splits.amount) === totalDue` (anti selisih)
- [ ] Modifikasi `createOrder` di `garage-service`: kalau `splits` ada → loop insert ke `payments`; kalau tidak → fallback ke single payment lama
- [ ] Audit log: catat array of methods di metadata
- [ ] **Uji via API**: 1 order Cash 20k + QRIS 10k → cek `payments` 2 row, total 30k, audit benar
- [ ] **Regresi B.1**: ulang uji rantai single-payment, pastikan tak rusak

### 2.2 UI POS (setelah backend stabil)
- [ ] Tambah toggle "Split payment" di payment panel POS
- [ ] Editable list: + tambah baris, pilih metode, masukan nominal, hapus baris
- [ ] Validasi visual: warna merah kalau sum ≠ totalDue
- [ ] Submit kirim `splits` array

**Estimasi**: 2 sesi. Risiko: **tinggi** (path uang). Dampak: fitur kasir nyata.

---

## FASE 3 — POS OFFLINE QUEUE (gap nyata C.1) — risiko sedang

**Tujuan**: kasir tetap bisa simpan order saat koneksi putus, sync nanti.

### 3.1 Service worker minimal (atau IndexedDB-only)
- [ ] Buat `src/lib/pos-offline-queue.ts` — IndexedDB wrapper untuk simpan draft order
- [ ] Saat checkout & fetch gagal: simpan order + idempotency key ke queue, banner kuning "X order menunggu sync"
- [ ] Background retry tiap 30s (window aktif) — pakai key yang sama biar idempotent
- [ ] Saat sukses sync: hapus dari queue, toast "Synced X order"

### 3.2 Hardening
- [ ] Anti double-submit (idempotency sudah ada di backend — uji)
- [ ] Limit queue 50 order (mencegah memory blow up)
- [ ] Indikator status online/offline di header POS

**Estimasi**: 1–2 sesi. Risiko: sedang (state management klien kompleks). Dampak: ketahanan operasi.

---

## FASE 4 — SECURITY HARDENING (Tahap 3 D)

**Tujuan**: tutup celah keamanan sebelum production.

### 4.1 Auth & access
- [ ] **2FA wajib `/control`** — tolak akses kalau `twoFactorEnabled = false` untuk role Owner/CEO
- [ ] **Rate-limit `/api/auth/sign-in`** — 5 attempts/menit/IP (lockout sudah ada di Better Auth, pastikan jalan)
- [ ] **Rate-limit lupa-password** — endpoint reset password
- [ ] **Audit log login sukses + gagal** ke `auditLogs` (untuk forensik)

### 4.2 Audit coverage gap
- [ ] Semua endpoint write yang menyentuh `payments`, `orders`, `stockMovements`, `cashSessions`, `approvals`, `staffProfiles` → wajib audit log
- [ ] Script `npm run security:audit` (sudah ada) jalankan → fix temuan blocker

### 4.3 Data protection
- [ ] Password `Auth.account.password` sudah hashed Better Auth ✓ (verify)
- [ ] Token member di cookie httpOnly + secure ✓ (verify)
- [ ] PII customer tidak bocor di log frontend

**Estimasi**: 1–2 sesi. Risiko: rendah-sedang. Dampak: keamanan.

---

## FASE 5 — RESPONSIVE SWEEP MENYELURUH (Tahap 3)

**Tujuan**: semua 20 modul lulus di desktop 1366×900 + mobile 390×844.

- [ ] Daftar 20 modul (sudah ada di STRUKTUR APLIKASI.MD)
- [ ] Per modul: buka di **mobile 390×844** (DevTools) — cek 0 overflow, 0 clipping
- [ ] Per modul: buka di **desktop 1366×900** — cek layout penuh, sidebar collapsible, tabel readable
- [ ] **Tablet POS landscape (1024×768)** — cart selalu terlihat, menu grid 4 kolom

**Tools**: gunakan iframe preview yang ada, atau manual di Chrome DevTools.

**Estimasi**: 1 sesi (cepat dgn checklist). Risiko: rendah. Dampak: profesional.

---

## FASE 6 — DEPLOYMENT PREP (Tahap 3 final)

**Tujuan**: siap deploy ke Neon Postgres + Vercel/VPS.

### 6.1 Database produksi
- [ ] Setup Neon database (atau cloud Postgres pilihan)
- [ ] Set env: `GARAGE_DB_DRIVER=postgres`, `DATABASE_URL=postgres://...`
- [ ] Jalankan `bootstrap-pglite` style migrate untuk Postgres (semua 56 migrasi di `drizzle/`)
- [ ] Seed via `npm run db:seed` (dgn env Postgres)
- [ ] Backup script `scripts/backup.mjs` jalan ke S3 (atau target backup pilihan)

### 6.2 Build production check
- [ ] `npm run build` hijau **dengan** `GARAGE_DB_DRIVER=postgres` (tanpa connect DB live saat build)
- [ ] `npm run start` di port 3001 → cek alur login penuh
- [ ] Smoke test 4 alur kunci: login owner, POS order, KDS update, Finance closing

### 6.3 Dokumentasi
- [ ] **README user** — cara login, role-role, ringkasan modul
- [ ] **README admin** — setup outlet, owner setup, backup
- [ ] **README teknis** — env vars, migrasi, troubleshooting (`postmaster.pid` stale, dll)
- [ ] **Deployment checklist** — final go/no-go

### 6.4 Go/No-Go final
- [ ] Semua role uji login
- [ ] Build prod hijau di lingkungan target
- [ ] Backup terverifikasi (restore dummy)
- [ ] 0 console error di production build
- [ ] Push ke remote + PR/merge ke main

**Estimasi**: 2–3 sesi. Risiko: sedang (deployment-specific). Dampak: deploy nyata.

---

## RINGKASAN URUTAN EKSEKUSI (FASE)

```
[ 0 ] Push & backup state sekarang        ← 30 menit, blocking
  ↓
[ 1 ] Tutup MVP — state UI + verifikasi 🟡 ← 2-3 sesi, low risk
  ↓
[ 2 ] POS Split Payment                    ← 2 sesi, HIGH RISK (path uang)
  ↓
[ 3 ] POS Offline Queue                    ← 1-2 sesi, med risk
  ↓
[ 4 ] Security Hardening                   ← 1-2 sesi, low-med risk
  ↓
[ 5 ] Responsive Sweep 20 modul            ← 1 sesi, low risk
  ↓
[ 6 ] Deployment Prep + dokumentasi        ← 2-3 sesi
  ↓
       FINAL PRODUCTION READY ✅
```

**Total estimasi**: ~10–14 sesi kerja. Bisa skip/skip-back kalau prioritas berubah.

---

## DECISION POINTS (perlu input user)

Saat tiba ke fase tertentu, beberapa pilihan butuh keputusan Anda:

1. **Fase 0 — push branch**: ke remote mana? Atau biar lokal saja sampai siap PR?
2. **Fase 2 — split payment**: ambil sekarang (HIGH RISK), atau tunda sampai semua low-risk selesai dulu?
3. **Fase 6 — deployment**: Neon Postgres + Vercel? Atau VPS Anda sendiri? Target domain?

---

## ATURAN STOP-LOSS (kalau ada masalah)

- Kalau `npm run build` gagal setelah perubahan → **rollback commit terakhir**, debug terpisah
- Kalau B.1 (rantai POS→Finance) putus → **prioritas perbaiki dulu** sebelum lanjut
- Kalau DB rusak (`Aborted()` PGlite) → pakai prosedur recovery di FASE 6 README teknis (stop server, hapus `postmaster.pid`, restart)
- Kalau hang > 2 menit di satu task → **stop, ganti pendekatan**, jangan tumpuk waktu

---

_File ini diupdate setiap akhir sesi: centang yang selesai, catat blocker._
