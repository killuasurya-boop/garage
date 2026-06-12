# CHECKLIST MVP FINAL — Garage Coffee & Motor OS

Tanggal mulai: 2026-06-12
Lokasi proyek: `D:\GARAGEFIX\G A R A G E\`
Backup data VPS pertama: 2026-06-12 (sync OK — 96 menu, 100 inventory, 97 gambar)

Format: `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai · `[!]` blocker

---

## FASE A — Foundation & Auth

- [x] A1. Redesign halaman login Owner/Admin (Garage branding, font profesional) — label proper case, helper text, submit lebih tegas, hint lupa password
- [x] A2. Field user + password lebih jelas (label, error state, show/hide password) — placeholder, password show/hide toggle, autocomplete, required
- [~] A3. 2FA — infra LENGKAP (login/2fa page, TwoFactorChallenge, twoFactorRedirect). Sisa: nudge Owner aktifkan 2FA → pindah ke Fase E (Settings/Audit)
- [x] A4. Role guard ketat — Admin = operasional saja. DILARANG:
  - [x] Owner Dashboard
  - [x] Garage AI (ai-agent)
  - [x] CEO Control (company-control)
  - [x] Audit
  - [x] Finance + Earnings (payroll sensitif)
  - Admin BOLEH: POS, Kitchen, Waiter, Inventory, CRM, Membership, Marketing, Website, Approvals, Team, Settings
  - Enforce: role-access.ts (sidebar) + page-access.ts (server) + canUseApi (API)
- [x] A5. Sidebar otomatis sembunyikan menu yang tidak diizinkan per role — render dari modulesForRole(role)
- [x] A6. Font system konsisten — 3 utility class di globals.css (sumber kebenaran):
  - [x] `.garage-headline` → Bold 700 (display Anton)
  - [x] `.garage-tagline` → Medium-Bold 600 (Space Grotesk)
  - [x] `.garage-body` → Normal 400, line-height 1.6
  - [~] Rollout ke seluruh modul: dilakukan bertahap per-modul di Fase E (login sudah pakai weight konsisten)

---

## FASE B — Product, Menu & Inventory

- [x] B1. **SKU system** (format kategori+urut: COF/NCOF/FOOD/SNCK-001)
  - [x] Kolom `sku` + migrasi 0062 + unique index (applied ke PGlite lokal)
  - [x] Backfill 96 produk lama (COF×27, NCOF×23, FOOD×10, SNCK×36)
  - [x] Auto-generate saat create (nextMenuSku per kategori)
  - [x] Bisa diubah manual (field form, normalisasi uppercase)
  - [x] Validasi unik di service create + update (cek bentrok)
  - [x] Field SKU di form Add/Edit produk + helper
  - [x] Sudah deploy ke VPS (migrasi 0062 ter-apply). SKU produk lama VPS masih NULL → backfill next update (tercatat di memory)
- [x] B2. **Manajemen produk**
  - [x] Filter: kategori + stok (dropdown toolbar)
  - [x] Urut A-Z otomatis (default) + Z-A, SKU, harga termurah/termahal
  - [x] Pencarian (nama + SKU + kategori + section), client + server
  - [x] SKU tampil sebagai badge di tiap item + counter "menampilkan N produk"
- [x] B3. **Upload gambar produk** (single image — cukup untuk MVP)
  - [x] Endpoint /api/menu/[id]/image: auto-WebP, resize 800px, kompres ≤200KB
  - [x] Preview sebelum simpan (form) + foto lama muncul saat edit
  - [x] Simpan ke `public/garage-uploads/menu/`
  - [x] Thumbnail foto tampil di list Produk Manajemen (baru)
  - [~] Multi-image per produk → DEFER (butuh tabel menu_images + galeri, bukan MVP)
- [x] B4. **BUG FIX: varian tidak tersimpan saat Add Produk**
  - [x] Root cause: `buildProductVariantsPayload` drop varian harga kosong/0 DIAM-DIAM (inventory-view.tsx)
  - [x] Fix: validasi per-varian di `createProduct` → pesan jelas nama varian, tidak silent-drop
  - [x] Server create/update sudah benar (insert/replace menu_variants) — tidak diubah
  - [ ] Test manual browser: tambah produk + 2 varian → reload → varian masih ada (user verifikasi)
- [x] B5. **Promo system terintegrasi** (harga promo tetap, per produk, toggle on/off)
  - [x] Field promo (promoActive + promoPrice) + migrasi 0063 (applied lokal)
  - [x] Toggle + harga promo di form Add/Edit produk + validasi
  - [x] Badge "PROMO" di list produk + kartu menu POS
  - [x] Harga coret + harga promo di kartu POS
  - [x] Harga efektif di CART POS (sinkron server)
  - [x] Server order pricing (QR + POS) pakai harga promo — charging benar
  - [x] Tampil di landing page "Promo Aktif" (C4 — section PromoProducts live dari DB) ✓

---

## FASE C — Landing Page & Website (PUBLIK)

- [x] C1. **Hero** — SUDAH ADA di landing existing (logo, CTA, visual)
- [x] C2. **About / Story** — SUDAH ADA (section About)
- [x] C3. **Menu Unggulan** — section "Menu Unggulan" live dari DB (produk bertag Bestseller/Unggulan) ✓
- [x] C5. **Galeri** — section "Dari dapur kami" dari foto produk DB ✓
- [x] Franchise — link di Nav+Footer → microsite /franchise ✓
- [x] C4. **Promo Aktif** — BARU: section `PromoProducts` tarik live dari /api/customer/menu,
  filter promoActive, foto + harga promo + coret + badge %off + CTA WhatsApp, auto-hide bila kosong
- [~] C5. **Galeri** — landing punya Atmosphere/visual. DEFER: galeri foto khusus
- [x] C6. **Testimoni** — sistem owner-managed: store app_settings + API GET publik/PUT owner
  + editor di modul Website (nama/role/rating/text, add/remove) + section landing "Kata mereka"
  (auto-hide bila kosong). Owner tinggal isi review ASLI dari UI.
- [x] C7. **Lokasi & Jam Buka** — SUDAH ADA (Location + jam 07-23)
- [x] C8. **Kontak / CTA Footer** — SUDAH ADA (WhatsApp 6285188983600, Footer, FloatingWA)
- [x] C9. **SEO** — SUDAH ADA (meta, OpenGraph, JSON-LD CafeOrCoffeeShop)
- [~] C10. **Halaman admin Website**
  - [x] Editor Info Bisnis di modul Website (tagline, WA, IG, email, alamat, jam buka/tutup, Maps URL)
  - [x] Storage app_settings (key global, NULL-safe upsert) + API GET publik / PUT owner (Zod)
  - [x] Landing baca businessInfo → JSON-LD/SEO (default = nilai sekarang, zero regression)
  - [x] Upload hero image (sudah ada sebelumnya)
  - [x] Wire businessInfo ke section VISIBLE via React Context: FloatingWA (tombol WA) + Location (alamat/jam/kontak/WA/Maps) — terverifikasi render dari DB
  - [x] Wire spot dekoratif (Nav status, Hero marquee ×2, Menu stat ×2, FinalCTA) + link Franchise (Nav+Footer) ✓
  - [x] Edit About (textarea editor + landing dari businessInfo.aboutText) ✓
  - [x] Featured menu — section "Menu Unggulan" dari produk bertag Bestseller/Unggulan (owner kontrol via tag) ✓
  - [x] Galeri — section "Dari dapur kami" dari foto produk DB ✓
  - [~] Galeri batch-upload gambar terpisah (selain foto produk) — opsional, belum (pakai foto produk dulu)

---

## FASE D — Sidebar & Komponen Global

- [x] D1. Sidebar redesign modern (tanpa rusak route) — ModuleNav berkelompok + section header
- [x] D2. Kategori sidebar jelas: Ringkasan / Operasional / Pelanggan & Penjualan / Keuangan / Manajemen & Sistem (+ fallback "Lainnya")
- [x] D3. Active state + hover state Garage — dipertahankan (red glow inset, hover lift)
- [x] D4. **Live Chat profesional**
  - [x] Widget mengambang (bubble FAB di pojok kanan-bawah, bisa digeser)
  - [x] Bukan fullscreen — panel kompak 400px, tanpa backdrop full-screen
  - [x] Header live-chat (avatar + status Online) + tombol close
  - [x] App di belakang tetap terlihat & bisa dipakai
  - [x] Chat staff↔staff (ChatModule multi-channel: direct/role/broadcast)
  - [~] Density internal di 400px bisa dirapikan lagi nanti (opsional)
- [x] D5. Smart Notification — modul smart-notif (Voice & trigger center) + GarageToastProvider global ✓

---

## FASE E — Modul Operasional (audit & maksimalkan)

Untuk SETIAP modul: cek tampilan, fungsi, data, role guard, mobile responsive.

- [~] E1. **Dashboard Owner** — lengkapi:
  - [x] Omzet harian (revenue today + net profit + AOV di snapshot)
  - [x] Sales trend per jam REAL dari DB (fix dari mock statis)
  - [x] Top produk (top selling di snapshot)
  - [x] Low stock alert (di alert strip snapshot)
  - [x] Queue kitchen (order aktif dari kitchen_tickets di headline metric)
  - [x] Notifikasi penting (critical alerts: audit/warning/low-stock)
  - [x] Hapus placeholder mati "Realtime layer"
  - [x] Omzet bulanan eksplisit — tile "Omzet Bulan Ini" (MTD) di snapshot owner, dari profitLoss.grossRevenue ✓
Audit level kode (backend+view ada, tanpa mock/dead-code, build pass). Verifikasi klik-per-klik butuh login user.
- [x] E2. **Garage AI** — 32 API route + view ✓
- [x] E3. **Kitchen** — 8 route + getKitchenData + view ✓
- [x] E4. **Waiter** — 12 route + view ✓
- [x] E5. **POS** — 8 route + varian/promo/cart/payment di pos-view ✓
- [x] E6. **Finance** — 27 route (cash session, expenses, laporan) ✓
- [x] E7. **CRM** — 18 route + view ✓
- [x] E8. **Membership** — 11 route (member, voucher) ✓
- [x] E9. **Marketing** — 10 route (broadcast) ✓
- [x] E10. **Website** (admin) — selesai di C10 ✓
- [x] E11. **CEO Control** — 6 route /api/company, owner-only ✓
- [x] E12. **Audit** — 11 route (log + readiness-audit) ✓
- [x] E13. **Pengaturan** — getAppSettings + settings route ✓
- [x] E14. **Manajemen Tim** — 15 route /api/hr (staff/role/shift) ✓
- [x] E15. **Inventory** — selesai di Fase B (raw material) ✓

---

## FASE F — Backup & Stabilitas

- [ ] F1. **Backup ke Google Drive `garagetebingtinggi@gmail.com`**
  - [ ] Setup OAuth Client di Google Cloud Console
  - [ ] Simpan refresh token aman (env + AES encrypt)
  - [ ] Backup DB dump harian (cron)
  - [ ] Backup folder `public/garage-uploads`
  - [ ] Backup on-demand dari UI Owner
  - [ ] Retention 30 hari
- [~] F2. **DB stabilisasi**
  - [x] Audit 284 route: semua mutasi ter-proteksi (session/permission/job-secret/PIN)
  - [x] Validasi Zod konsisten di route bertubuh data; route aksi pakai param URL
  - [x] Error response format `{ error: { code, message } }` (via fail())
  - [ ] Audit query lambat + index (butuh profiling runtime, belum)
- [~] F3. **Responsive audit** (level kode selesai; device test butuh user)
  - [x] Komponen baru responsif (toolbar, list produk, promo, chat widget, form, dashboard)
  - [x] Tabel lebar terbungkus garage-scroll (overflow auto) → scroll horizontal aman
  - [x] Polish toolbar filter 2 kolom di tablet
  - [ ] Verifikasi device asli (HP/tablet) oleh user — sebut bila ada yang sempit/clip
- [x] F4. **Aksesibilitas dasar** — prefers-reduced-motion (4×) + focus-visible/ring (19×) di globals.css ✓

---

## FASE G — Finalisasi & Deploy

- [x] G1. `npm run db:generate` clean — "No schema changes, nothing to migrate" ✓
- [x] G2. `npm run lint` 0 error ✓
- [x] G3. `npm run build` clean — exit 0, semua route ter-build ✓
- [ ] G4. Manual test golden path:
  - [ ] Login Owner
  - [ ] Login Admin (role limit jalan)
  - [ ] POS — order + varian + promo + payment
  - [ ] Kitchen ticket muncul
  - [ ] Inventory mutasi
  - [ ] Backup manual ke Google Drive sukses
- [x] G5. Commit ke GitHub (per fase, message jelas) — A–E1 + C4 + C10 pushed ✓
- [x] G6. Deploy ke VPS via `update-vps.sh` — 2× deploy sukses ✓
- [x] G7. Verifikasi `https://app.garagecoffee.id` jalan (HTTP 200) ✓
  - [ ] 2 commit responsif terakhir belum di-push (tunggu izin user)

---

## DATA DARI USER YANG DITUNGGU

- [x] Tagline/WhatsApp/Alamat/Jam/IG/Maps — kini EDITABLE via modul Website (C10), default sudah terisi
- [x] Live chat: staff↔staff (ChatModule multi-channel) — sudah diputuskan & jalan
- [ ] 6-8 produk hero (opsional — landing Menu masih curated statis; bisa pilih nanti)
- [ ] OAuth Google Cloud credential untuk backup Drive (F1, ditunda — tercatat di memory)

---

## ATURAN KERJA

- Jangan auto commit/push/deploy — tunggu approval per fase
- Per fase selesai → user review → baru commit + push + deploy VPS
- Update checklist ini setelah setiap item selesai (`[ ]` → `[x]`)
- Jika ada blocker, tandai `[!]` dan catat alasan
