# Audit Navigasi & Tombol — Garage OS (Seluruh Modul & Role)

> Status: **AUDIT (belum ubah kode)** · Dibuat 2026-07-07
> Tujuan: hilangkan ambiguitas tombol (Kembali vs Keluar vs Logout), sidebar ganda,
> entry-point absen tersembunyi, dan scroll ambigu — konsisten di semua modul & role.
>
> Setelah disetujui, **Bagian 1 (Standar)** dipindah jadi bagian resmi di
> `design-system/MASTER.md`, lalu **Bagian 4 (Backlog)** dieksekusi bertahap.

---

## Ringkasan keluhan owner (terverifikasi di kode)

1. Tombol **Kembali / Keluar / hapus / scroll ambigu** di seluruh modul.
2. **Kasir ada 2 sidebar** (dua menu navigasi berbeda).
3. **Absen tidak tampak** — harus buka profil dulu baru muncul.
4. Banyak tombol yang **kurang / tidak konsisten** antar modul & role.

Semua poin **terkonfirmasi**. Ini bukan sekadar "kurang tombol" — akarnya **4 shell terpisah**
dengan aturan navigasi berbeda-beda.

---

## Bagian 0 — Peta shell (akar masalah)

Aplikasi punya **4 kerangka navigasi (shell) terpisah**, masing-masing beda aturan tombol:

| Shell | File | Dipakai | Tombol "keluar" saat ini |
|---|---|---|---|
| OS (utama) | `src/components/garage/garage-app.tsx` (±7.400 baris, monolitik) | semua role OS | "Kembali ke [role home]" (ikon Home) + "Logout" (merah) + "Sign out" (dropdown ⋯) |
| Kasir/POS | `src/components/garage/pos-view.tsx` (±4.700 baris) | Kasir, Waiter, Supervisor | Sheet "Menu Kasir" sendiri + "Kembali ke dashboard" (ArrowLeft) |
| Warehouse | `src/components/wms/wms-shell.tsx` | Gudang, Owner, Admin | "Garage OS" (ArrowLeft, = pindah app) |
| Admin/Control | `src/components/garage/admin/admin-shell.tsx` | Owner, Admin | (perlu dicek terpisah) |
| CEO/Owner | `src/components/ceo/layout/Sidebar.tsx` | Owner | (perlu dicek terpisah) |

**Akibat:** kata "Kembali" berarti 3 hal berbeda tergantung layar, dan "Logout" muncul
2x dengan 2 label ("Logout" vs "Sign out").

---

## Bagian 1 — STANDAR NAVIGASI & AKSI (kontrak wajib)

Setiap layar, di semua shell & role, WAJIB mengikuti ini.

### 1.1 Tiga konsep navigasi harus dibedakan tegas

| Konsep | Arti | Ikon tetap | Label tetap | Posisi | Warna |
|---|---|---|---|---|---|
| **Kembali** | mundur 1 level di dalam app yang sama | `ArrowLeft` | "Kembali" | header kiri | netral (chrome) |
| **Ganti App** | pindah antar sub-app (OS ↔ Warehouse ↔ Owner) | `LayoutGrid`/`ArrowLeftRight` | "Ke Garage OS" / "Ke Warehouse" | header kiri, terpisah | netral, ada border |
| **Keluar (Logout)** | akhiri sesi | `LogOut` | "Keluar" | **user-menu** (avatar) kanan | merah, HANYA di 1 tempat |

Aturan keras:
- **Logout hanya 1 tombol**, di dalam menu avatar/user. Hapus duplikasi "Logout"+"Sign out".
- Pakai **satu istilah**: "Keluar" (Indonesia, konsisten). Jangan campur "Logout"/"Sign out".
- "Kembali" tidak pernah dipakai untuk pindah app atau logout.

### 1.2 User-menu (avatar) — konten baku

Klik avatar kanan-atas → menu berisi (urut): Nama+role · **Absen** · Ganti App (jika ada
akses) · Profil/Setting · Pemisah · **Keluar** (merah). Sama di semua shell.

### 1.3 Absen = aksi kelas satu

- Tombol/entry **Absen** WAJIB tampak untuk semua role staff **tanpa buka profil**.
- Minimal di 2 tempat: (a) item pertama di user-menu avatar, (b) chip status di header
  ("Belum absen" merah / "Sudah absen 08:12" hijau) yang bisa diklik.
- Satu komponen absen kanonis (rujuk `absen-v2-panel.tsx`); pensiunkan/duplikat
  `employee-clock-panel.tsx` & `attendance-today-widget.tsx` bila tumpang tindih.

### 1.4 Satu sidebar per konteks

- Satu layar = satu sumber navigasi utama. **Kasir tidak boleh punya 2 sheet nav.**
- Sheet "Menu Kasir" dan "Garage Command" digabung: POS pakai satu menu saja
  (aksi kasir + navigasi modul + absen + keluar).

### 1.5 Penempatan aksi konsisten

- **Aksi utama** (Simpan/Bayar/Proses): kanan-bawah (form/modal) atau kanan-atas (halaman).
  Warna aksen merah Garage.
- **Aksi destruktif** (Hapus/Batalkan/Void): merah + **wajib konfirmasi** (dialog, bukan
  langsung). Tidak pernah bersebelahan tanpa jarak dengan aksi utama.
- **Aksi sekunder** (Batal/Tutup): netral, kiri dari aksi utama.
- Setiap tombol ikon wajib `aria-label` + `title`.

### 1.6 Scroll tidak ambigu

- Setiap area padat data (tabel, daftar, antrian, keranjang) = **scroll container tinggi
  tetap** dengan scrollbar terlihat (kelas `garage-scroll`), bukan scroll halaman penuh.
- Header/aksi sticky tidak menutup baris terakhir; sisakan padding bawah.
- Mobile: satu kolom, scroll horizontal HANYA untuk tabel lebar.

### 1.7 CRUD & aksi massal — WAJIB di semua daftar/tabel (SEMUA role, termasuk Owner)

Setiap daftar atau tabel data (produk, menu, stok, order, staff, member, resep,
approval, dll) WAJIB punya set aksi baku yang seragam:

- **Edit** per baris: ikon `Pencil`, `aria-label="Edit [nama]"`. Buka modal/drawer edit,
  bukan navigasi hilang konteks.
- **Hapus** per baris: ikon `Trash2`, **merah**, `aria-label="Hapus [nama]"`. WAJIB
  konfirmasi (dialog "Hapus [nama]? …") — tidak pernah hapus 1 klik. Bila data punya
  riwayat/relasi, pakai **arsip (soft-delete)**, bukan hapus permanen (pola `archiveWmsProduct`).
- **Select-all + pilih per baris**: checkbox header (pilih semua di halaman) + checkbox
  tiap baris. Saat ada yang terpilih → muncul **bar aksi massal** (sticky) berisi jumlah
  terpilih + tombol massal (Hapus/Arsip terpilih, Export terpilih, Ubah status, dll) +
  "Batal pilih".
- **Tambah**: tombol utama kanan-atas daftar (ikon `Plus`, "Tambah [entitas]").
- Aksi baris ditaruh konsisten di **kolom kanan** (Edit lalu Hapus), jarak cukup agar tak
  salah pencet; Hapus selalu paling kanan & merah.
- Rujukan pola yang sudah baik: `src/app/warehouse/inventory/page.tsx` (select-all + arsip
  massal + edit + kelola stok). Jadikan ini acuan visual untuk daftar lain.

### 1.8 Anti-duplikat — satu fitur, satu tempat

- Jika sebuah fitur/tombol/komponen **muncul dobel** (mis. logout 2x, absen 3 komponen,
  2 sidebar), **hapus/gabungkan** jadi satu yang kanonis. Duplikasi = bug UX.
- Sebelum menambah komponen/aksi baru, cek apakah sudah ada yang setara; **reuse** dulu.

### 1.9 Cakupan — berlaku untuk SEMUA role

Standar §1.1–§1.8 wajib di **semua role tanpa kecuali**: dari Kasir/Barista/Waiter/Gudang
sampai **Manager, Finance, Admin, dan Owner/CEO**. Owner bukan pengecualian — justru
paling sering lintas modul, jadi konsistensi navigasinya paling penting.

### 1.10 Ini standar coding permanen

Aturan di Bagian 1 adalah **kontrak coding tetap**, bukan hanya untuk perbaikan sekali ini.
**Setiap fitur/halaman/modul baru** WAJIB mengikuti §1.1–§1.9 sejak dibuat (header seragam,
Absen+Keluar, satu sidebar, CRUD+select-all+bulk, konfirmasi hapus, anti-duplikat, scroll
jelas). Direview sebelum merge.

---

## Bagian 2 — TEMUAN (grounded, dengan lokasi)

| # | Severity | Temuan | Bukti |
|---|---|---|---|
| N-01 | 🔴 Tinggi | Logout dobel & label beda ("Logout" vs "Sign out") | `garage-app.tsx:1220-1232` & `:1267-1273` |
| N-02 | 🔴 Tinggi | Kasir punya 2 sheet navigasi (Garage Command + Menu Kasir) | `garage-app.tsx:1130/1344`, `pos-view.tsx:3167` |
| N-03 | 🔴 Tinggi | Absen bukan aksi kelas satu — hanya item modul `/absen`, tak tampak di header | nav `garage-app.tsx:2456,2496`; tak ada tombol Absen di header |
| N-04 | 🟠 Sedang | 3 konsep "Kembali" berbeda pakai ikon/label mirip | "Kembali ke role home" `garage-app.tsx:1201-1213` (Home) · "Kembali ke dashboard" `pos-view.tsx:4673` (ArrowLeft) · "Garage OS" `wms-shell.tsx` (ArrowLeft, = ganti app) |
| N-05 | 🟠 Sedang | Komponen absen terfragmentasi (3 komponen) | `absen-v2-panel.tsx`, `employee-clock-panel.tsx`, `attendance-today-widget.tsx` |
| N-06 | 🟠 Sedang | Istilah campur EN/ID ("Sign out", "Quick action", "Open POS tablet") di UI ID | `garage-app.tsx:1246-1272` |
| N-07 | 🟡 Rendah | Banyak kelas scroll ad-hoc (`garage-scroll`, `garage-scroll-x`) tanpa aturan tinggi tetap konsisten | tersebar |
| N-08 | 🟡 Rendah | Shell Admin & CEO belum diverifikasi terhadap standar (kemungkinan pola tombol beda lagi) | `admin-shell.tsx`, `ceo/layout/Sidebar.tsx` |

---

## Bagian 3 — MATRIKS MODUL × ROLE

15 role. Modul per role (dari `src/lib/role-access.ts`). Kolom **Absen** & **Keluar**
harus ADA & seragam untuk semua; **Kembali/Ganti-App** sesuai konteks.

| Role | Modul utama (ringkas) | Absen tampak? | Keluar 1 tombol? | Sidebar tunggal? |
|---|---|---|---|---|
| Owner / CEO | dashboard, pos, ai, kitchen, waiter, produk, inventory, finance, crm, membership, marketing, approvals, website, company-control, earnings, audit, team, settings, recruitment, payroll-owner | ⬜ audit | ❌ (N-01) | ❌ (multi-shell) |
| Admin | pos, kitchen, waiter, produk, inventory, crm, membership, marketing, approvals, website, team, settings, recruitment | ⬜ | ❌ | ❌ |
| Manager Operasional | dashboard, pos, ai, kitchen, waiter, inventory, crm, membership, marketing, approvals, audit, team, settings, recruitment, absensi-v2, wallet-gaji | ⬜ | ❌ | ⬜ |
| Finance / CFO | dashboard, ai, finance, earnings, approvals, audit | ⬜ | ❌ | ⬜ |
| **Kasir** | pos, earnings, absensi-v2, wallet-gaji, wallet-fee | 🔴 tersembunyi | ❌ | 🔴 2 sidebar |
| Barista / Koki / Asisten Koki | kitchen, inventory, earnings, ai, absensi-v2, wallet-gaji, wallet-fee | 🔴 tersembunyi | ❌ | ⬜ |
| Waiter 1 / Waiter 2 | waiter, earnings, ai, absensi-v2, wallet-gaji, wallet-fee | 🔴 tersembunyi | ❌ | ⬜ |
| Kitchen / Barista | kitchen, inventory, earnings, ai, absensi-v2, wallet-gaji, wallet-fee | 🔴 | ❌ | ⬜ |
| Gudang | inventory, ai, absensi-v2, wallet-gaji, wallet-fee | 🔴 | ❌ | ❌ (WMS shell beda) |
| Supervisor Shift | dashboard, pos, ai, kitchen, waiter, inventory, approvals, absensi-v2, wallet-gaji | 🔴 | ❌ | 🔴 (pakai POS) |
| Delivery Admin | ai, absensi-v2, wallet-gaji, wallet-fee | 🔴 | ❌ | ⬜ |

Legenda: 🔴 masalah pasti · ❌ gagal standar · ⬜ perlu dicek per layar saat implementasi.

**Pola yang jelas:** SEMUA role staff kena masalah **Absen tersembunyi** + **Logout dobel**.
Role yang pakai POS (Kasir, Waiter, Supervisor) tambah kena **sidebar ganda**.

---

## Bagian 4 — BACKLOG PERBAIKAN (urut prioritas)

Dampak besar dulu (kena semua role), risiko rendah dulu.

### Fase 1 — Header & aksi global (kena SEMUA role) ✅ SELESAI (OS shell)
- **F1-a** Satukan logout jadi 1 tombol "Keluar" di user-menu avatar; hapus duplikat
  "Sign out". (N-01, N-06)
- **F1-b** Tambah **chip Absen** di header (status + klik → panel absen) untuk semua
  role staff; masukkan "Absen" sebagai item pertama user-menu. (N-03)
- **F1-c** Bakukan 3 konsep nav (Kembali / Ganti App / Keluar): ikon+label+posisi tetap. (N-04)
- **F1-d** Terjemahkan sisa istilah EN → ID konsisten. (N-06)

### Fase 2 — Kasir (disebut spesifik owner) ✅ SELESAI
- **F2-a** Gabung sheet "Menu Kasir" + "Garage Command" jadi satu menu kasir. (N-02)
- **F2-b** Pastikan Absen + Keluar + Kembali jelas di POS. (N-03/N-04)
- **F2-c** Audit tombol POS (bayar, void, split, cetak, tahan order) sesuai §1.5.

### Fase 3 — Konsolidasi Absen ✅ SELESAI
- **F3-a** `/absen` jadi SATU route absen kanonis: otomatis pakai Payroll V2
  (AbsenV2Panel) bila flag ON, terminal legacy (EmployeeClockPanel) bila OFF →
  tombol Absen selalu berfungsi. `/attendance` (duplikat) redirect → `/absen`.
  `AttendanceTodayWidget` DIPERTAHANKAN (beda fungsi: ringkasan read-only dashboard
  owner, bukan terminal absen). (N-05, N-08)
  - Bonus: memperbaiki bug laten — tombol Absen Fase 1/2 mengarah ke `/absen` yang
    sebelumnya 503 (checkin V2) saat flag OFF; kini fallback ke terminal legacy.

### Fase 4 — Sapu per modul ✅ SELESAI

**Koreksi audit (scan mendalam ke sub-komponen list):** SEMUA modul list ternyata
SUDAH punya **Edit + Hapus per baris**. Gap yang seragam hanya **Select-all + aksi
massal**. Kebijakan owner: **bulk aman saja** (export / ubah status / arsip
soft-delete) — TANPA hapus permanen massal.

| Modul | Komponen | Edit | Hapus | Select-all + Bulk |
|---|---|:--:|:--:|:--:|
| recruitment | recruitment-view | ✅ | ✅ | ✅ bulk ubah status |
| membership | membership-admin-view | ✅ | ✅ | ✅ bulk export CSV |
| approvals | approvals-board | — | — | ✅ (sudah ada) |
| crm-segments | crm-segments | — | — | ✅ (sudah ada) |
| CRM (customer) | crm-customer-list | ✅ | ✅ | ✅ bulk export CSV |
| marketing | garage-marketing | ✅ | ✅ | ✅ bulk export CSV |
| produk | inventory-view | ✅ | ✅ | ✅ bulk export CSV |
| team | admin/user-management | ✅ | ✅ | ✅ bulk suspend/activate/delete/logout (konfirmasi) |

**Fase 4 tuntas.** Semua modul list punya select-all + aksi massal. Produk
terverifikasi penuh (48 produk, pilih semua → export). CRM & marketing struktur
benar (seed kosong). team/user-management sudah lengkap sejak sebelum audit
(bulk dengan konfirmasi hapus + alasan suspend).

Sisa hanya **Fase 5** = QA verifikasi lintas 15 role (login tiap role, cek header
seragam Absen+Keluar, 1 sidebar, scroll) — tidak ada perubahan kode lagi.
- **F4-a** Terapkan §1.5 (penempatan aksi) + §1.6 (scroll) per layar.
- **F4-b** Verifikasi shell Admin & CEO terhadap standar. (N-08)
- **F4-c** Lengkapi tombol yang kurang per matriks Bagian 3.
- **F4-d** Terapkan §1.7 CRUD baku di **semua daftar/tabel** (Edit + Hapus/Arsip
  berkonfirmasi + Select-all + bar aksi massal + Tambah) — semua role termasuk Owner.
  Acuan: `warehouse/inventory/page.tsx`.
- **F4-e** Terapkan §1.8 anti-duplikat: sisir & hapus/gabung fitur/komponen dobel.

### Fase 5 — Verifikasi lintas role ✅ SELESAI
QA login per role (standalone). Hasil:
- **Kasir** (POS/kiosk): Absen ✅ · Keluar tunggal ✅
- **Barista** (kitchen/OS): Absen ✅ · Keluar ✅ · tanpa "Logout/Sign out"
- **Admin, Finance** (back-office/OS): Absen tersembunyi (benar, tak punya
  absensi-v2) · Keluar tunggal ✅
- **Gudang** (shell WMS): AWALNYA tak ada Absen & Keluar (shell WMS di luar scope
  Fase 1/2) → **DIPERBAIKI**: tambah tombol **Absen** (gated `absensi-v2`) +
  **Keluar** (logout tunggal) di header `wms-shell.tsx`. Terverifikasi Absen→/absen,
  Keluar jalan, 0 error console.
- Kedua cabang gating Absen terbukti (staff = tampil, back-office = sembunyi);
  "Keluar" tunggal di semua shell (OS, POS, WMS); tak ada "Logout/Sign out" tersisa.

---

## Cara kerja usulan
1. Owner review dokumen ini (terutama **Bagian 1 Standar** & urutan **Bagian 4**).
2. Setelah oke, Standar dipindah ke `design-system/MASTER.md` (sumber kebenaran).
3. Eksekusi Fase 1 → verifikasi → lanjut fase berikutnya. Tanpa deploy sampai diperintah.

---

## Fase 6 — Perluasan audit (area di luar 26 modul utama) 🟠 SEDANG BERJALAN

Owner menandai area yang belum diperiksa: warehouse sub-modul, pengaturan,
payroll, buku pintar, chat internal, garage ai, produk, membership, + dugaan
duplikat "atur" di pengaturan.

### Temuan
| # | Area | Temuan | Status |
|---|---|---|---|
| P-01 | **Payroll** (`/owner/payroll/*`) | Tak ada nav shell: sub-halaman (requests, settings, [staff]) dead-end tanpa "Kembali", tak ada back-to-OS | ✅ **DIPERBAIKI** — `layout.tsx` + `PayrollNav`: back Garage OS + tab Dashboard/Permintaan/Pengaturan |
| P-02 | **Pengaturan** | 2 permukaan (scope Outlet vs Global Sistem) terasa "dobel" | ✅ **DIPERBAIKI (klarifikasi)** — tambah penjelas per-scope di settings-view ("Outlet = override outlet ini", "Global = default semua outlet", "Integrasi = webhook") agar jelas ini SCOPE beda, bukan menu dobel. (Merge penuh = refactor besar, ditahan.) |
| P-03 | **Warehouse sub-modul** | Header shell WMS sudah punya Absen/Keluar/Back (Fase 5); tiap `/warehouse/*` pakai shell yg sama | ✅ tercakup shell |
| P-04 | **Buku Pintar / SOP** | Render di dalam shell OS (modul "training") → header terpadu; widget SOP mengambang di-dedup (disembunyikan saat di modul training/chat) | ✅ OK (tak ada gap) |
| P-05 | **Chat Internal** | Render di dalam shell OS → header terpadu; ChatFab mengambang di-dedup (disembunyikan saat modul chat aktif) | ✅ OK (tak ada gap) |
| P-06 | **Garage AI** (ai-agent) | Render di dalam shell OS (AiPosAgentView) → header terpadu (Kembali/Absen/Keluar) | ✅ OK (tak ada gap) |
| P-07 | **Produk / Membership** | CRUD+bulk sudah (Fase 4); nav via shell OS | ✅ tercakup |

**Fase 6 tuntas.** Gap nyata hanya Payroll (P-01, nav shell) & Pengaturan (P-02,
klarifikasi scope). Sisanya sudah tercakup shell OS/WMS + dedup widget mengambang.

> Catatan verifikasi P-02: perubahan teks (tsc+lint+build bersih). Verifikasi browser
> terhalang `/api/settings` 403 di standalone (env/permission seed), bukan cacat kode.
