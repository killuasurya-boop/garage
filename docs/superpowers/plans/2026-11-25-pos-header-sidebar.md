# Header & Sidebar POS Ringkas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar POS 9 menu kerja + "Lainnya" berkelompok, topbar satu baris, satu daftar menu dipakai sidebar, lembar Lainnya, dan lembar Menu (<1280 px) — tanpa menghilangkan menu atau mengubah alur transaksi.

**Architecture:** Daftar menu jadi data murni `posNavModel(ctx)` di `src/lib/pos-nav.ts` (dites tanpa DOM). Komponen tampilan kecil (`PosV6NavList`, `PosV6MoreSheet`) merender model itu; `pos-view.tsx` hanya memetakan `id → handler` (aturan POS V6: logika tetap di `pos-view.tsx`). Topbar dirombak di tempat (`pos-view.tsx` + `pos-v6.tsx`).

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind v4, shadcn/ui (`Sheet`, `DropdownMenu`), lucide-react, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-pos-header-sidebar-design.md`

## Global Constraints

- Tombol F tidak berubah: F1 Kasir, F2 Pesanan QR, F3 Meja, F4 Riwayat Struk, F6 Belum Bayar, F8 Bayar nanti, F9 Bayar, `[` ciut sidebar.
- Blind count: topbar tidak pernah menampilkan omzet/kas/expected cash.
- Setiap menu lama tetap terjangkau paling jauh 2 klik, di semua peran dan lebar layar.
- Absen tetap tombol ikon (sidik jari) yang selalu terlihat di topbar (NAV_ACTION_AUDIT §1.3).
- Owner/Manajer (non-kiosk) memakai topbar yang sama + tombol "Kembali ke dashboard".
- Warna baru hanya token `--pos-*`; file POS baru 0 kelas hex (tes `pos-color-classes.test.ts`); jumlah file lama tidak naik.
- Copy: kalimat biasa (sentence case), tanpa label HURUF BESAR, tanpa "Garage OS POS V6 / Point of Sale System", tanpa badge "V6", tanpa chip "Gudang Auto"; logo `object-contain`, tidak terpotong.
- Target klik ≥ 40 px; fokus terlihat; tombol ikon punya `aria-label`; `prefers-reduced-motion` dihormati; tidak ada animasi baru selain bawaan `Sheet`.
- Lebar sidebar penuh 208 px (dari 248), ikon 80 px; topbar ≤ 64 px tinggi pada 1024–1920 px; sidebar tanpa scroll pada 1366×768.

## Review Focus

1. **Owner/Manajer tanpa sidebar** harus bisa mencapai setiap menu kasir lewat tombol Menu — tes: `posNavModel` untuk ctx non-kiosk berisi id yang sama dengan kiosk (Task 1).
2. **Partner Hub mati / bukan pengelola / tanpa izin opname** → grup Mitra, item Pengaturan POS, Stok opname tidak muncul, grup kosong tidak dirender — tes di Task 1.
3. **Angka besar** (badge > 99) tampil "99+" dan tidak memotong label — sudah di `PosV6NavItem`; E2E Task 5 cek tidak ada teks terpotong.
4. **Lebar 1024 px** topbar tetap satu baris tanpa overflow horizontal saat semua chip muncul (QR, Tagih, Chat) — E2E Task 5.
5. **Nama kasir panjang** di chip shift/profil terpotong elipsis, tidak mendorong tombol keluar layar — E2E Task 5 dengan nama seed panjang bila ada, cek `scrollWidth`.

---

### Task 1: Model menu murni `posNavModel`

**Files:**
- Create: `src/lib/pos-nav.ts`
- Test: `src/lib/pos-nav.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PosNavId =
    | "kasir" | "pesanan-qr" | "meja" | "belum-bayar" | "riwayat-struk" | "produksi" | "stok-habis" | "shift" | "kas"
    | "laporan-shift-saya" | "riwayat-penjualan" | "riwayat-laporan-shift" | "petty-cash" | "catatan-kejadian"
    | "kontak-member" | "daftar-member" | "pesanan-mitra" | "penjualan-mitra"
    | "qc-kasir" | "stok-opname" | "pengumuman-suara" | "mode-tampilan" | "theme-studio" | "pengaturan-pos" | "muat-ulang";
  export type PosNavIconKey = string; // kunci ikon lucide, dipetakan di komponen
  export type PosNavItem = { id: PosNavId; label: string; icon: PosNavIconKey; shortcut?: string; count?: number; dot?: "good" | "warn" | "danger"; testId?: string };
  export type PosNavGroup = { id: string; label: string; items: PosNavItem[] };
  export type PosNavContext = {
    shiftOpen: boolean; waitingQr: number; pendingAll: number; pendingOverdue: number; receiptCount: number;
    kitchenTickets: number; soldOut: number; partnerHubEnabled: boolean; partnerAttention: number;
    canQuickCount: boolean; canManagePosSettings: boolean; refreshing: boolean;
  };
  export type PosNavModel = { primary: PosNavItem[]; more: PosNavGroup[]; moreAttention: number };
  export function posNavModel(ctx: PosNavContext): PosNavModel;
  export function allNavIds(model: PosNavModel): PosNavId[];
  ```

- [ ] **Step 1: Tulis tes gagal** `pos-nav.test.ts` dengan `ctx` dasar (semua angka 0, partnerHubEnabled true, canQuickCount true, canManagePosSettings true):
  - `primary` id berurutan persis: `["kasir","pesanan-qr","meja","belum-bayar","riwayat-struk","produksi","stok-habis","shift","kas"]`; shortcut kasir F1, pesanan-qr F2, meja F3, riwayat-struk F4, belum-bayar F6; item lain tanpa shortcut.
  - `more` grup berurutan `["laporan","pelanggan","mitra","gudang","perangkat"]` dengan label `"Laporan & riwayat"`, `"Pelanggan"`, `"Mitra"`, `"Gudang & cek"`, `"Perangkat"`; isi id per grup sesuai spec.
  - `allNavIds` = 25 id unik (semua `PosNavId`).
  - tidak ada dua item dengan `icon` sama di seluruh model.
  - label tidak ada yang huruf besar semua (`label !== label.toUpperCase()`).
  - `partnerHubEnabled:false` → grup `mitra` hilang; `canQuickCount:false` → `stok-opname` hilang; `canManagePosSettings:false` → `pengaturan-pos` hilang; grup tanpa item tidak ada di `more`.
  - `shiftOpen:true` → shift `{label:"Shift aktif", dot:"good"}`; false → `{label:"Mulai shift", dot:"danger"}`.
  - `pendingAll:3, pendingOverdue:1` → belum-bayar `count 3, dot "danger"`; `pendingOverdue:0` → `dot "warn"`; `pendingAll:0` → tanpa dot.
  - `kitchenTickets:2` → produksi `count 2, dot "good"`; `soldOut:4` → stok-habis `count 4, dot "danger"`.
  - `partnerAttention:5` → pesanan-mitra `count 5, dot "danger"` dan `moreAttention 5`; partnerHub mati → `moreAttention 0`.
  - `refreshing:true` → muat-ulang label `"Memuat…"`.
  - testId: belum-bayar `pos-pending-open`, qc-kasir `pos-qc-open-menu`, petty-cash `pos-menu-petty`, catatan-kejadian `pos-menu-incident`, pesanan-mitra `pos-menu-partners`, penjualan-mitra `pos-menu-partner-sales`.
- [ ] **Step 2: Jalankan** `npx vitest run src/lib/pos-nav.test.ts` → FAIL (modul belum ada).
- [ ] **Step 3: Implementasi** `posNavModel` & `allNavIds` di `src/lib/pos-nav.ts` (data + kondisi; tanpa import React/lucide).
- [ ] **Step 4: Jalankan** tes yang sama → PASS.
- [ ] **Step 5: Commit** `feat(pos): model menu POS satu sumber (posNavModel)`.

### Task 2: Komponen daftar menu & lembar Lainnya

**Files:**
- Create: `src/components/garage/pos/pos-v6-nav.tsx`
- Modify: `src/components/garage/pos/pos-v6.css` (gaya grup lembar, lebar sidebar 208 px, judul grup kalimat biasa)

**Interfaces:**
- Consumes: `PosNavModel`, `PosNavItem`, `PosNavId`, `PosNavGroup` (Task 1); `PosV6NavItem` (`pos-v6.tsx`).
- Produces:
  ```ts
  export const POS_NAV_ICONS: Record<string, LucideIcon>; // semua icon key di model → ikon lucide unik
  export function PosV6NavList(props: { items: PosNavItem[]; onSelect: (id: PosNavId) => void; activeId?: PosNavId }): JSX.Element;
  export function PosV6NavGroups(props: { groups: PosNavGroup[]; onSelect: (id: PosNavId) => void; extra?: Partial<Record<PosNavId, ReactNode>> }): JSX.Element;
  export function PosV6MoreSheet(props: { open: boolean; onOpenChange: (open: boolean) => void; theme: CashierThemeMode; groups: PosNavGroup[]; onSelect: (id: PosNavId) => void; themeSwatches: ReactNode }): JSX.Element;
  ```
  `extra["mode-tampilan"]` = swatch tema (dirender di tempat item, bukan tombol). Memilih item di lembar menutup lembar lalu memanggil `onSelect`.

- [ ] **Step 1:** Tambah tes ke `pos-nav.test.ts`: setiap `icon` di `posNavModel(ctxPenuh)` punya entri di `POS_NAV_ICONS` dan nilai ikonnya unik (import dari `pos-v6-nav.tsx`).
- [ ] **Step 2:** `npx vitest run src/lib/pos-nav.test.ts` → FAIL.
- [ ] **Step 3:** Implementasi komponen; judul grup `<h3>` kalimat biasa; lembar = `Sheet side="left"` dengan `data-cashier-theme-scope={theme}`, judul "Lainnya", deskripsi "Menu yang tidak dipakai tiap transaksi."; hanya token `--pos-*`.
- [ ] **Step 4:** Tes PASS; `npx vitest run src/components/garage/pos/pos-color-classes.test.ts` PASS (file baru 0 hex).
- [ ] **Step 5: Commit** `feat(pos): daftar menu & lembar Lainnya dari model`.

### Task 3: Sidebar ringkas di `pos-view.tsx`

**Files:**
- Modify: `src/components/garage/pos-view.tsx` (blok `<aside className="pos-v6-sidebar …">` ±5185–5345; state baru `moreOpen`)
- Modify: `src/components/garage/pos/pos-v6.tsx` (`PosV6Brand` sidebar: logo utuh), `pos-v6.css`

**Interfaces:**
- Consumes: `posNavModel`, `PosV6NavList`, `PosV6MoreSheet`, `PosV6ThemeSwatches`.
- Produces: `function runPosNav(id: PosNavId): void` di dalam `PosView` (map id → handler lama, satu `switch` lengkap; dipakai Task 4 & 5).

- [ ] **Step 1:** Buat `navModel = useMemo(() => posNavModel({...}), [...])` dari state yang ada (`waitingCustomerOrderCount`, `pendingSummary.counts`, `receiptHistory.length`, `kitchenTickets.length`, `soldOutIds.size`, `partnerAttention`, `canQuickCount`, `canManagePosSettings`, `cashierRefreshing`, `shiftOpen`, `settings.partnerHubEnabled`).
- [ ] **Step 2:** `runPosNav` memetakan setiap `PosNavId` ke handler yang sekarang dipakai item sidebar lama (salin persis dari JSX lama; `kasir` → `focusPosSearch`, `mode-tampilan` → tidak ada aksi).
- [ ] **Step 3:** Ganti isi `<nav>` sidebar: `PosV6NavList items={navModel.primary}` + pemisah + `PosV6NavItem` "Lainnya" (ikon dari `POS_NAV_ICONS.more`, `count={navModel.moreAttention}`, `testId="pos-more-open"`) → `setMoreOpen(true)`. Hapus `pos-v6-sidebar-foot` dan caption "POS V6 · perangkat". Render `PosV6MoreSheet` dengan swatch tema.
- [ ] **Step 4:** Logo sidebar tampil utuh (perbaiki penyebab terpotong di `.pos-v6-sidebar-brand`); lebar `--pos-sidebar-w` 208 px dan offset konten `xl:pl-[208px]` disesuaikan (cari `xl:pl-[260px]`).
- [ ] **Step 5:** `npx tsc --noEmit -p .` bersih; `npx eslint` file berubah 0 error.
- [ ] **Step 6: Commit** `feat(pos): sidebar 9 menu kerja + Lainnya`.

### Task 4: Topbar satu baris

**Files:**
- Modify: `src/components/garage/pos-view.tsx` (blok `.pos-v6-topbar` ±6105–6260), `src/components/garage/pos/pos-v6.tsx` (`PosV6Brand`, `PosV6ShiftChip`), `pos-v6.css`

**Interfaces:**
- Consumes: `runPosNav` (Task 3).
- Produces: tombol/chip dengan `data-testid`: `pos-qc-open` (chip koneksi), `pos-topbar-qr` (chip QR, hanya bila >0), `pos-topbar-tagih` (chip Belum Bayar, hanya bila >0), `pos-menu-open` (tombol Menu), `pos-fullscreen` (ikon layar penuh).

- [ ] **Step 1:** `PosV6Brand`: hapus judul "Garage OS POS V6", badge V6, subtitle; topbar menampilkan logo hanya bila sidebar tidak tampil (`hideLogoAtXl` untuk kiosk).
- [ ] **Step 2:** Susun satu baris: chip Shift (klik → `runPosNav("shift")`), jam, `PosV6Kpi` transaksi; kanan: chip koneksi (pindah `testId="pos-qc-open"` ke sini, klik → QC), chip QR (`waitingCustomerOrderCount>0`), chip Tagih (`pendingSummary.counts.all>0`, tone merah bila overdue), Chat tamu (label hanya bila ada pesan), lonceng (Kasir), status suara (ikon), Absen ikon sidik jari (bila izin `absensi-v2`), layar penuh ikon (`aria-label` "Layar penuh"/"Keluar layar penuh", tanpa teks "Keluar"), Kembali (non-kiosk), tombol Menu (`<1280` atau non-kiosk; badge = `kitchenTickets.length + partnerAttention`), profil.
- [ ] **Step 3:** Hapus dari topbar: chip "Gudang Auto", tombol Belum Bayar/QR/Bar & Dapur/Muat ulang/Shift/Keluar yang sekarang `xl:hidden` (semua kini ada di Menu/model); Keluar tetap di menu profil.
- [ ] **Step 4:** CSS: topbar `flex-nowrap`, tinggi ≤ 64 px; pada 1024–1279 chip berlabel jadi ikon+angka (label tetap di `aria-label`/`title`); <640 pola ikon yang sudah ada tetap.
- [ ] **Step 5:** tsc + eslint bersih.
- [ ] **Step 6: Commit** `feat(pos): topbar satu baris dengan status yang bisa diklik`.

### Task 5: Lembar Menu (<1280 & Owner/Manajer) dari model + profil

**Files:**
- Modify: `src/components/garage/pos-view.tsx` (Sheet `cashierMenuOpen` ±4868–5180; aksi `PosV6Profile`)

**Interfaces:**
- Consumes: `navModel`, `runPosNav`, `PosV6NavList`, `PosV6NavGroups`.

- [ ] **Step 1:** Di lembar Menu: pertahankan kartu profil & blok navigasi modul (`navModules`, NAV_ACTION_AUDIT §1.4); ganti daftar aksi kasir yang terduplikasi dengan `PosV6NavList items={navModel.primary}` + `PosV6NavGroups groups={navModel.more}` (memilih item menutup lembar lalu `runPosNav`).
- [ ] **Step 2:** Item profil "Menu kasir": ≥1280 kiosk → `setMoreOpen(true)`, selain itu `setCashierMenuOpen(true)`.
- [ ] **Step 3:** tsc + eslint bersih; commit `feat(pos): lembar Menu memakai daftar yang sama`.

### Task 6: E2E, cek visual, audit, rilis

**Files:**
- Modify: `e2e/pos-v6-theme.spec.ts` (swatch lewat Lainnya), `e2e/pos-guardian.spec.ts` (QC lewat chip — testId sama), `e2e/pos-pending.spec.ts` (bila perlu)
- Create: `e2e/pos-nav.spec.ts`
- Modify: `.claude/skills/garage-pos/SKILL.md`, `docs/design-system/POS-V6-DESIGN-SYSTEM.md` (papan 01/02)

- [ ] **Step 1: Tulis `e2e/pos-nav.spec.ts`** (desktop-1366, viewport 1366×768, kasir2): sidebar `scrollHeight <= clientHeight`; 9 item utama + "Lainnya" terlihat; buka Lainnya → 5 judul grup terlihat; klik "Petty cash" membuka sheet modul; topbar `boundingBox().height <= 64`; tidak ada overflow horizontal di 1366 & 1024 (`document.documentElement.scrollWidth <= innerWidth`); di 1024 tombol `pos-menu-open` membuka lembar berisi "Belum Bayar" dan "Laporan & riwayat"; F2/F3/F4/F6 tetap membuka panelnya.
- [ ] **Step 2:** Perbarui spec lama yang menunjuk item pindah; jalankan `npx playwright test e2e/pos-nav.spec.ts e2e/pos-keyboard.spec.ts e2e/pos-guardian.spec.ts e2e/pos-pending.spec.ts e2e/pos-offline.spec.ts e2e/pos-insights.spec.ts e2e/pos-v6-theme.spec.ts e2e/critical-flows.spec.ts --trace off --reporter=line` → semua lulus.
- [ ] **Step 3:** Harness piksel before (main) / after → periksa ke-30 gambar: logo utuh, tanpa teks terpotong/tabrakan, 5 tema terbaca; `node scripts/ui-check.mjs` pada 1366×768, 1024, 390 → tanpa temuan.
- [ ] **Step 4:** Audit `web-design-guidelines` atas `pos-v6-nav.tsx` + blok topbar/sidebar (output `file:baris`) dan checklist anti-slop `design-taste-frontend`/`frontend-design`; perbaiki temuan.
- [ ] **Step 5:** `npx vitest run` penuh, `npx tsc --noEmit -p .`, eslint file berubah, `npm run build` (env dummy) → bersih.
- [ ] **Step 6:** Catat aturan di skill `garage-pos` + papan 01/02 di POS-V6-DESIGN-SYSTEM; commit; `superpowers:requesting-code-review` atas branch; perbaiki temuan; PR, merge squash, pantau Deploy VPS.
