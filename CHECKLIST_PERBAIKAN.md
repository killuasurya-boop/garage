# CHECKLIST PERBAIKAN - Garage OS

> **Dibuat:** 2026-06-08
> **Dasar:** daftar kekurangan jujur hasil audit (workflow + kualitas + keamanan + testing)
> **Cara baca:** Prioritas P0 (genting) → P3 (nice-to-have). Owner: 🤖 = bisa AI kerjakan solo · 👤 = butuh kamu/manusia · 🤝 = bareng. Effort: S (<1j) · M (beberapa jam) · L (>1 hari).
> **Aturan:** tiap item selesai WAJIB lewat tsc 0 + lint 0 + build hijau sebelum dicentang.

---

## FASE A — Safety & Quick Wins (P0)
> Cepat, mencegah bencana. Kerjakan duluan.

- [x] **A1. Buat `.gitignore`** 🤖 S ✅ DONE (commit f80d117)
  - `.gitignore` sudah ada tapi `/node_modules` (slash) cuma tutup root → ditambal `**/node_modules/`, `/.pglite-data/`, `/pglite-data*/`, `/.agent/ /.codex/ /.stitch/ /.garage/`, `/outputs/`.
  - **Hasil:** `git add -A` turun dari puluhan ribu file → 66 (aman, 0 node_modules).
- [~] **A2. Amankan secret** 🤝 S — SEBAGIAN
  - [x] `.env.local` terverifikasi TIDAK pernah ter-track/commit (aman di repo).
  - [ ] Rotasi kredensial (Neon DB pass, OpenAI key) — **butuh kamu** (akses dashboard provider).
  - [ ] Set `BETTER_AUTH_SECRET` high-entropy untuk produksi — **butuh kamu**.
- [ ] **A3. Commit kerja sesi yang tertinggal** 🤝 S
  - Retrofit cache + refactor view-split (working tree) + dokumen. Keputusan scope ada di kamu.
  - **Selesai jika:** working tree bersih dari kerja yang sudah matang.

---

## FASE B — Correctness & Security (P0/P1)
> Ini soal UANG dan DATA. Paling kritis untuk bisnis nyata.

- [ ] **B1. UAT kebenaran perhitungan Finance** 👤 M
  - Verifikasi MANUAL oleh orang finance: subtotal, service charge, pajak, diskon (voucher+manual+poin), HPP/COGS, gross/net profit, cash closing, fee karyawan.
  - AI cuma bisa cek "endpoint balas 200", bukan benar-tidaknya angka.
  - **Selesai jika:** finance tanda-tangan angka cocok untuk ≥5 skenario order.
- [ ] **B2. Uji keamanan IDOR / multi-outlet** 🤝 M
  - Pastikan staff outlet A TIDAK bisa baca/ubah order, customer, cash session, payroll outlet B.
  - Uji manipulasi `id`/`outletId` di request. Seed 2 outlet untuk tes.
  - **Selesai jika:** semua akses lintas-outlet ditolak (403/404), terbukti via skrip.
- [x] **B3. Uji keamanan dasar** 🤖 M ✅ AUDIT BERSIH (read-only, tak perlu fix)
  - SQL injection: semua `sql\`\`` Drizzle parameterized; `sql.identifier` hanya dari `CRITICAL_TABLES` (hardcoded). Tak ada string-concat ke query.
  - Upload: `chat/upload` 10MB + whitelist mime (png/jpeg/webp/gif); selfie absensi 3MB + regex mime; knowledge upload size-guard.
  - Rate-limit: `checkRateLimit` per-IP di PIN/attendance, `rateLimit` di orders create + pos-sync.
  - **Catatan:** ini audit dasar. IDOR/multi-outlet mendalam = B2 (butuh 2 outlet, belum).
- [ ] **B4. Uji login asli (bukan demo-login)** 🤝 S
  - Better Auth email/password + PIN POS + member login dari UI sungguhan.
  - **Selesai jika:** 3 jalur login lulus tanpa demo-login.

---

## FASE C — Kualitas Kode (P1/P2)
> Maintainability. Bukan blocker operasional, tapi cegah bug masa depan.

- [ ] **C1. Standardisasi success shape `{ data }`** 🤖 M
  - Retrofit response sukses HR/staff (`{ staff }`→`{ data }`, dst) + sesuaikan konsumen frontend.
  - **Selesai jika:** semua route balas `{ data }` / `{ error }` konsisten.
- [ ] **C2. Lanjut rollout cache invalidation** 🤖 M
  - 25 komponen ad-hoc fetch → `useGarageQuery`/listener + `invalidateGarageCache` di mutation.
  - **Selesai jika:** modul utama (audit, marketing, membership, dll) ikut pola.
- [~] **C3. Tambah Zod di mutation handler yang belum** 🤖 M — HR routes done
  - [x] 5 route HR POST diberi Zod via `readJson`: glossary, announcements, locations, kpi, advances. Balas `VALIDATION_ERROR` shape. tsc 0, lint 0, build hijau.
  - [x] sop & shifts: sudah punya runtime validation memadai (body bersarang template/log + array) — Zod ditunda (benefit kecil, risiko tinggi pada nested/array).
  - [x] +4 route API server-side: audit/cases (POST), audit/cases/[id]/notes (POST), audit/cases/[id] (PATCH), hr/team/payroll (POST). Total **9 mutation handler** ber-Zod sesi ini.
  - [ ] Sisa: crm/inventory/marketing mutation handlers — dicicil. **Hindari** yg overlap refactor view-split paralel.
- [ ] **C4. Split god-file** 🤖 L
  - `garage-service.ts` (14.7k) → per-modul; lanjutkan split `garage-app.tsx`.
  - **Selesai jika:** tak ada file >3k baris di domain inti; build hijau.

---

## FASE D — Testing & Verifikasi (P1/P2)
> Pembuktian otomatis. Yang paling kurang sekarang.

- [~] **D1. Verifikasi responsive/visual** 🤝 M — SPOT-CHECK (overflow via DOM)
  - [x] POS desktop 1366×900: **0 overflow horizontal**, 0 elemen melampaui viewport ✅
  - [x] POS mobile 390×844: **pageOverflowX=0** (layout tidak pecah) ✅. Satu-satunya "offender" = chat FAB di posisi off-screen → terbukti **artefak timing preview** (viewport diterapkan setelah mount; `innerWidth` benar 390, localStorage kosong, komponen sudah punya `clampToViewport`+resize handler). **Bukan bug device nyata.**
  - [x] Sales History desktop: render bersih, angka/uang tak terpotong (screenshot sesi sebelumnya).
  - [ ] Belum disisir mobile: Kitchen/Inventory/Finance/CRM (tab in-app, perlu klik nav) — verifikasi penuh sebaiknya manual di tablet/HP nyata (F1).
  - **Metode:** deteksi overflow via `scrollWidth>clientWidth` + `getBoundingClientRect().right>viewport` (lebih andal dari screenshot utk clipping).
- [~] **D2. Unit/component test inti** 🤖 L — MULAI (member-types selesai)
  - [x] `member-types.test.ts` — 13 test: points multiplier, redeem, threshold, rank, progress.
  - [x] `attendance.test.ts` — 13 test: hashPin (HMAC deterministik+trim), pinHashEquals (timing-safe), haversine geofence, evaluatePunchStatus, label, formatWorkedHours. **Suite total 47 test hijau.**
  - [ ] Sisa: billing totals (perlu export `calculateBillingTotals` dari god-file dulu — tunda hingga refactor view-split paralel beres agar tak konflik), recipe deduct, voucher cap, komponen POS cart/kitchen.
  - **Selesai jika:** coverage logic finance/POS/inventory ≥70%.
- [ ] **D3. Uji beban ringan** 🤝 M
  - Simulasi puluhan order beruntun + beberapa kasir paralel. Cek pglite/postgres tahan, tak ada race di cash session/stock.
  - **Selesai jika:** 50 order beruntun tanpa error/stok minus.

---

## FASE E — Real-time & UX (P2/P3)
> Peningkatan rasa. Opsional.

- [ ] **E1. (Opsional) Live tracking real-time** 🤝 L
  - Ganti polling dapur/POS dgn SSE/websocket kalau lag terasa saat pilot.
  - **Selesai jika:** tiket muncul <1 detik; fallback polling tetap ada.
- [ ] **E2. (Opsional) Optimistic update** 🤖 M
  - POS cart, kitchen bump, status meja update UI dulu lalu sinkron.
  - **Selesai jika:** aksi terasa instan, rollback bila gagal.

---

## FASE F — Pra-Pilot (P0, terakhir)
- [ ] **F1. Akses dari tablet/HP via WiFi LAN** 👤 S — buka `http://192.168.110.96:3001` dari device, cek operasional nyata.
- [ ] **F2. Ganti akun & password default** 👤 S — `@garage.local` / `garage12345` jangan dipakai produksi.
- [ ] **F3. Backup & restore DB teruji** 🤝 M — pastikan data bisa di-backup + dipulihkan.

---

## URUTAN EKSEKUSI YANG DISARANKAN
1. **A1, A2** (safety) → **F1** (cek LAN) — fondasi aman + konfirmasi pilot dasar.
2. **B1, B2** (uang & data) — kritis bisnis.
3. **A3, C1** (rapikan + konsistensi).
4. **D1, D2** (pembuktian).
5. Sisanya (C2-C4, B3-B4, D3, E, F2-F3) dicicil.

## RINGKASAN OWNER
- 🤖 **Bisa AI kerjakan:** A1, B3, C1, C2, C3, C4, D2, E2
- 👤 **Butuh kamu:** B1 (finance sign-off), F1, F2 (akses/keputusan), A2-rotasi
- 🤝 **Bareng:** A2, A3, B2, B4, D1, D3, E1, F3
