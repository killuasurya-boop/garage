# CHECKLIST KERJA GARAGE OS → MVP

> Tracker progres kerja AI Agent. Buka file ini kapan saja untuk cek sampai mana.
> Legenda: ✅ selesai & terverifikasi · 🟡 ada tapi belum diverifikasi end-to-end · ⬜ belum dikerjakan
>
> Branch kerja: `garage/perf-hardening-mvp` · DB: `pglite-data-running` (seed)
> Login uji: `owner@garage.local` / `garage12345` (atau tombol "ISI DEMO")

---

## A. SUDAH SELESAI & TERVERIFIKASI (sesi ini)

### A.1 Recovery & Akses
- [x] ✅ DB PGlite dipulihkan (crash-recovery gagal → rebuild dir fresh + seed)
- [x] ✅ **Login berfungsi end-to-end** (terbukti: login → redirect `/os` → dashboard render)
- [x] ✅ Konsolidasi ke satu sumber DB tunggal (`pglite-data-running`), dir rusak dihapus
- [x] ✅ Data lama aman di `backups/*.sql`

### A.2 Performa
- [x] ✅ Code-split `garage-app.tsx` — 19 modul jadi lazy (`next/dynamic`)
- [x] ✅ Code-split `team-management` — 12 sub-panel lazy
- [x] ✅ ETag 304 untuk endpoint polling (kitchen, waiter, dashboard, orders history, customer-queue, tables live, customer menu)
- [x] ✅ Composite index hot columns (orders, kitchen_tickets, audit_logs, attendance) — migrasi 0056 ter-apply
- [x] ✅ Pagination/bounding query besar (customers, kitchen tickets)
- [x] ✅ `loading.tsx` skeleton untuk route dinamis
- [x] ✅ Warm response 180–250 ms (tidak lelet)

### A.3 Integritas & Keamanan
- [x] ✅ Idempotency anti double-submit (order POS, customer QR order, void, payout, points redeem, opname apply, approvals bulk)
- [x] ✅ Rate-limit semua operasi uang/stok sensitif
- [x] ✅ Anti stok-minus (adjustment & stock movement)
- [x] ✅ Anti close-ganda (cash session)

### A.4 Kualitas Build
- [x] ✅ `npm run build` sukses (169/169 halaman)
- [x] ✅ `npm run lint` 0 error 0 warning
- [x] ✅ Build-safety (`force-dynamic` halaman akses-session)

---

## B. TAHAP 1 — TUTUP MVP (verifikasi alur nyata)

> Sekarang login jalan, alur ini perlu diuji end-to-end dengan data seed.

### B.1 Alur transaksi inti — ✅ TERVERIFIKASI (uji: order POS-13073839, ticket K-07383941)
- [x] ✅ Buat order POS dengan varian (burger-garage/telur x2 + kentang) → HTTP 201
- [x] ✅ Checkout → order paid, total Rp30.000
- [x] ✅ Order muncul di Kitchen (KDS) — K-07383941, station Food, status queue
- [x] ✅ Kitchen update status → cooking → ready (200)
- [x] ✅ Waiter terima order ready → delivered (200)
- [x] ✅ Payment masuk Finance (orders/history: POS-13073839, total 30.000)
- [x] ✅ Aksi tercatat di Audit log ("Kitchen ticket marked delivered" / Owner)

### B.2 Alur member & kas — ✅ TERVERIFIKASI
- [x] ✅ Order dengan member → CRM terupdate (Member Uji MVP: visits 1, **points 11** auto-earn, isMember true)
- [x] ✅ Cash closing shift → hitung selisih (discrepancy -120.000, status critical)
- [x] ✅ Selisih besar → masuk Approval (**fitur baru diimplementasikan**: "Selisih kas closing" Rp120.000 risk high) → approve via board OK

### B.3 State UI per modul (Section 38 DoD)
- [ ] ⬜ Empty state lengkap (POS, Kitchen, Inventory, Finance, CRM, Audit)
- [ ] ⬜ Loading state lengkap
- [ ] ⬜ Error state + retry lengkap
- [ ] ⬜ Toast sukses/error konsisten

### B.4 Responsive (login sudah jalan → bisa diuji)
- [x] ✅ Mobile (~471px) — Dashboard, Audit, POS: **page tanpa overflow**; tabel padat (audit min-w-900) pakai scroll container internal (pola benar, layout tak rusak)
- [ ] 🟡 Desktop 1366×900 — preview window fixed narrow, belum bisa diuji lebar penuh (asumsi aman: lebih lega dari mobile)
- [ ] ⬜ Sweep ke-20 modul lengkap (baru spot-check 3 modul utama)

---

## C. TAHAP 2 — MASTER PRO (perdalam fitur)

### C.1 POS
- [ ] ⬜ Split payment (Cash + QRIS dalam 1 order)
- [ ] ⬜ Offline queue (IndexedDB + retry + banner)
- [ ] ⬜ Upsell AI panel tersambung ke cart
- [ ] ⬜ Quick reorder dari history member

### C.2 Inventory
- [x] ✅ Smart reorder (prediksi habis + rekomendasi qty) — **VERIFIED**: 100 saran, prediksi nyata dari stock_movements (top: Telur ayam habis 0 hari → reorder 73, critical)
- [ ] 🟡 Opname workflow draft → submit → approval → apply (endpoint ada 200 + apply sudah di-hardening; perlu verifikasi alur penuh)
- [ ] 🟡 Transfer antar-outlet (endpoint `/api/inventory/transfers` ada 200; perlu verifikasi request→approve→issue)

### C.3 Finance
- [ ] 🟡 Rollup multi-outlet (perlu cek param outletId=all)
- [ ] 🟡 CFO brief otomatis (komponen + data ada)
- [ ] 🟡 Anomaly panel + forecast (endpoint `/api/finance/forecast` ada 200)

### C.4 CRM & Membership
- [ ] 🟡 Auto-segment (endpoint `/api/crm/segments-auto` ada 200; perlu verifikasi hasil segmentasi)
- [x] ✅ Point earn otomatis di POS — **VERIFIED** (Member Uji MVP dapat 11 poin dari 1 order)
- [ ] ⬜ Redeem reward + voucher di POS (voucher validate ada; redeem di POS perlu diuji)

### C.5 HR / Tim
- [ ] ⬜ Attendance geofence + selfie (radius per outlet)
- [ ] ⬜ Shift scheduler conflict detection
- [ ] ⬜ Payroll (gaji + komisi − kasbon → payout)

### C.6 GARAGE AI
- [ ] 🟡 Pemisahan recommend vs execute (schema `aiActionDrafts` + approval ada)
- [ ] 🟡 Daily brief owner (endpoint `/api/owner/daily-brief` ada 200)

> **CATATAN PENTING (temuan verifikasi):** Mayoritas backend Tahap 2 TERNYATA SUDAH ADA
> (semua endpoint balas 200). Yang benar-benar masih GAP (belum ada):
> **C.1 POS split payment** & **C.1 offline queue** — sisanya tinggal verifikasi alur/UI, bukan bangun dari nol.

---

## D. TAHAP 3 — FINAL PRODUCTION READY

- [ ] ⬜ Responsive sweep menyeluruh 20 modul (1366×900 + 390×844)
- [ ] ⬜ 2FA wajib `/control` + rate-limit login
- [ ] ⬜ Audit log lengkap untuk semua aksi sensitif
- [ ] ⬜ Pindah DB produksi (`GARAGE_DB_DRIVER=postgres` + `DATABASE_URL` Neon)
- [ ] ⬜ Build production + migrate + seed + backup terverifikasi
- [ ] ⬜ Uji semua role login & akses
- [ ] ⬜ Dokumentasi user/admin/teknis
- [ ] ⬜ Deployment checklist (Section 37)
- [ ] ⬜ Push branch ke remote + PR/merge

---

## CARA VERIFIKASI CEPAT

```
1. Hard-refresh browser (Ctrl+Shift+R)
2. Buka http://127.0.0.1:3001/login
3. Login owner@garage.local / garage12345 (atau "ISI DEMO")
4. Cek dashboard /os tampil → centang B.1 dst.
```

Catatan teknis:
- Apply migrasi: `npx tsx src/scripts/bootstrap-pglite.ts` (JANGAN `npm run db:migrate` — drizzle-kit rusak di mesin ini)
- Re-seed: `npm run db:seed`
- Dev server: `npm run dev` (port 3001, env dari `.env.local` → `pglite-data-running`)

---

_Update terakhir oleh AI Agent — sesi pengembangan performa + hardening + recovery._
