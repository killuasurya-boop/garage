# S0b — Sensus layar & route Garage OS (PRD V4.0 §25.1 · F55)

> **Batch:** S0b (Fase 0, `02-ROADMAP.md`) · **Basis:** `main` @ `dc57846` (26 Okt 2026)
> **Sifat:** dokumentasi saja — tidak ada kode aplikasi, migration, atau deploy yang diubah.
> **Dibuat ulang dengan:** `npx tsx scripts/screen-census.ts` (tabel + `routes.json`, deterministik).
> Screenshot diambil dari build produksi lokal + Postgres seed (bukan produksi).

## File di folder `census/`

| File | Isi |
|---|---|
| `TABLES.md` | **Tabel lengkap** hasil generator: semua halaman → layar PRD + guard, modul `/os`, route per grup, route publik, layar PRD tanpa halaman. Jangan diedit manual. |
| `routes.json` | Data mentah generator (halaman, modul + role, 607 route + method + guard). |
| `screens.json` | Hasil uji browser per halaman × viewport: status HTTP, redirect, overflow horizontal, error konsol. |
| `sheet-<grup>-<lebar>.webp` | Contact sheet screenshot per grup (pos-shift, control, wms, payroll-hr, member-public, os-modules) × 1366 / 1024 / 390. Label merah = ada temuan. |

## 1. Angka utama

| Item | Jumlah | Keterangan |
|---|---|---|
| `page.tsx` | **112** | 95 dapat dirute + 17 di `control/_dashboard/*` (folder privat: implementasi yang diimpor wrapper `/control/*`, bukan kode mati) |
| Modul di `/os?module=…` | **25** | Kerangka tunggal `garage-app.tsx` (10.297 baris) |
| Route handler (`route.ts`) | **607** | 595 di `/api/*` (73 grup) + 12 di luar `/api` (OAuth well-known, file upload, kalender) |
| Route dengan guard sesi/permission langsung | 530 | `requirePermission` 356×, `requireGarageSession` 224×, `requireAnyPermission`, `requireCashierSession`, `requireOwnerOrManager`, `requireMemberAuth`, … |
| Route dengan guard tidak langsung | 26 | helper (`financeSectionHandler`, `replenishmentSession`), PIN karyawan (absen), shared secret (router WiFi), Better Auth, dev-only, OAuth discovery |
| Route publik tanpa guard sesi | 43 | Menu digital, status pesanan, chat pelanggan, rekrutmen, member auth, file upload bernama acak, kalender — sesuai desain; 33 di antaranya ber-rate-limit |
| Route legacy 410 | 13 | Jalur `/api/inventory` lama (WMS hardening) |
| Layar target PRD §25.1 | **101** | **86 sudah punya halaman/modul**, 15 belum (bagian 4) |
| Uji browser | 117 target × 3 viewport | 351 tangkapan; 3 halaman berparameter (`[slug]`/`[token]`) dilewati karena butuh data |

Grup route terbesar: `wms` 98 · `finance` 63 · `ai` 32 · `inventory` 24 · `payroll` 24 · `crm` 21 · `hr` 20 · `admin` 19 · `events` 19 · `orders` 18.

## 2. Peta area → layar PRD (ringkas; detail per URL di `TABLES.md`)

| Area existing | Halaman/modul | Layar PRD utama |
|---|---|---|
| POS & Shift | `/pos`, `/shift`, `/sales-history`, `/display/*`, modul `pos` | POS-01/02/03/04/07, SHF-01…05 |
| Owner Control | 28 halaman `/control/*` (+17 implementasi `_dashboard`) | DSH-01…04, FIN-01/02/05/06/07/08, SYS-02/03/05/06/07, CRM-01, HR-01/02, REC-04 |
| Keuangan (OS) | modul `finance`, `approvals` | FIN-01…04, FIN-07, SYS-01 |
| WMS | 28 halaman `/warehouse/*`, modul `inventory` (redirect ke `/warehouse`) | WMS-01…07, REC-01/02/03/05, KDS-03/05, RPT-02 |
| Dapur/Bar | modul `kitchen` | KDS-01/02/04 |
| Produk | modul `produk` | CAT-01/02/03/06 |
| Payroll & HR | `/owner/payroll/*` (8), `/staff/wallet-*`, `/absen`, `/recruitment`, modul `earnings`, `team-management`, `recruitment` | HR-01…06 |
| Member & CRM | `/member`, `/member-login`, `/wifi`, modul `crm`, `membership` | MEM-01/03/04/05, CRM-01/02 |
| Order/QR & Meja | `/order`, `/order/qr-print`, modul `waiter`, `courier` | ORD-01…03, TBL-01/02 |
| Event | `/grand-opening`, `/events/[slug]/menu`, `/undangan/[token]`, modul `events` | EVT-01…05, CAT-05 |
| Marketing & Notif | modul `marketing`, `website`, `smart-notif`, `chat` | MKT-01…04, MSG-01, MSG-04 |
| AI / MCP | modul `ai-agent`, `/oauth/consent` | AI-01, AI-04, AYA-01 |
| Tanpa padanan registry | `/`, `/legal/*`, `/login`, `/login/2fa`, `/pos-login`, modul `training` | Publik/auth/panduan — perlu diputuskan masuk registry atau tidak |

## 3. Temuan uji browser (1366×900 · 1024×768 · 390×844)

Tidak ada error konsol atau HTTP ≥ 500 pada 117 target. Temuan:

| # | Temuan | Viewport | Bukti | Usulan batch |
|---|---|---|---|---|
| T1 | **Semua 28 halaman `/warehouse/*` melebar 40 px** — tombol di header shell WMS (`button.min-h-11.min-w-11` + label `sm:inline`) keluar layar | 1024×768 (tablet landscape) | `sheet-wms-1024.webp`, `screens.json` | Perbaikan kecil shell WMS (bisa sebelum U-series; satu komponen header) |
| T2 | `/control/onboarding` melebar 102 px — kartu checklist (`rounded-lg border p-4`) + badge status tidak membungkus | 390×844 | `sheet-control-390.webp` | Perbaikan kecil / U3 |
| T3 | `/owner/payroll` melebar 41 px — baris tombol navigasi payroll tidak membungkus | 390×844 | `sheet-payroll-hr-390.webp` | Perbaikan kecil |
| T4 | `/oauth/consent` 404 tanpa parameter OAuth | semua | — | Sesuai desain (hanya dibuka dari alur OAuth M0); bukan bug |
| T5 | Modul `finance` tidak pernah "network idle" (koneksi realtime terbuka) | semua | halaman termuat 200 ±6 dtk | Bukan bug; catatan untuk uji otomatis (pakai `domcontentloaded`) |
| T6 | `/pos` menampilkan dialog "Shift belum ditutup" pada data seed | semua | `sheet-pos-shift-*.webp` | Kondisi data uji, bukan bug |

## 4. Gap terhadap screen registry PRD §25.1

**15 layar target belum punya halaman/modul:**

| Layar | Nama | Catatan / batch pemilik |
|---|---|---|
| POS-05 | Quick Retail | **B3** (diambil agent ini) |
| SHF-06 | Manager Handover | B4 (custody D-03) |
| SHF-07 | History | Riwayat shift ada di tab `/shift` (Riwayat) — bisa dipetakan; belum jadi layar sendiri |
| DOC-01 / DOC-02 | Explorer / Export History | B7 |
| RPT-01 / RPT-03 / RPT-04 | Builder / Schedule / Delivery Logs | B7 (+ M4 untuk delivery) |
| MEM-02 | Email/WA Verification | I2 (BLOCKED D-04/D-05) |
| MKT-05 | Performance | Fase 7 |
| MSG-02 / MSG-03 | Email Draft / Templates | M4 (BLOCKED D-04) |
| AI-02 / AI-03 / AI-05 | Evidence Answer / Action Preview & Diff / Capability Registry | M2–M5 (preview & registry sudah ada di MCP; belum ada layar in-app) |

**Halaman existing tanpa padanan registry** (perlu keputusan masuk registry/dipensiunkan):
- `/saas-executive` — halaman demo statis berisi data contoh hardcoded, tanpa guard, tidak ditautkan dari mana pun (hanya disebut di `robots.ts`). **Kandidat dihapus** (butuh persetujuan Owner).
- `/login`, `/login/2fa`, `/pos-login`, `/`, `/legal/*`, modul `training` — wajar di luar registry operasional; usul ditambah ke SYS/registry sebagai "Auth & publik".

**Duplikasi/tumpang tindih:**
- `/attendance` → redirect ke `/absen` (dua URL satu layar).
- `/control/settings` → redirect ke `/os?module=settings&scope=global`; `/control/financial/settings`, `/warehouse/settings`, `/owner/payroll/settings` = 4 pintu pengaturan terpisah (relevan untuk U2 sitemap Owner).
- Modul `inventory` di `/os` → redirect ke `/warehouse` (satu WMS, sesuai CLAUDE.md).
- Dashboard ganda: `/dashboard`, `/control`, `/control/operations`, modul `dashboard`, `/saas-executive` semuanya DSH-01.

## 5. Catatan keamanan dari sensus (untuk S1/S2 — tidak diubah di batch ini)

- Halaman tanpa guard server: `/owner/payroll/*` (8 halaman) dan `/staff/wallet-*` merender kerangka tanpa cek sesi di server;
  **data tetap terlindungi** karena semua `/api/payroll/*` & `/api/wallet-*` memakai guard. Usul: tambah guard server di
  `owner/payroll/layout.tsx` agar konsisten dengan `/control/*` (redirect login lebih awal, tidak ada flash kerangka).
- Route publik yang dicek manual dan aman by design: `/api/wifi/config` (tanpa password), `/garage-uploads/chat/[file]`
  (nama acak 24 heksa + whitelist pola), `/api/dev/demo-login` (mati di production), `/api/wifi/router-script` (shared secret).
- Daftar lengkap route publik + guard tidak langsung ada di `TABLES.md` untuk ditinjau pemilik S1/S2.

## 6. Masukan untuk batch berikutnya

**U0 (ekstraksi `garage-app.tsx`) — urutan usulan** berdasarkan ukuran & keterkaitan:
1. Modul yang sudah punya komponen sendiri dan hanya perlu dipindah: `produk`, `crm`, `membership`, `marketing`, `website`, `recruitment`, `chat`, `events`.
2. `finance` + `approvals` (FIN P0, berat) — setelah B1b merge agar tidak bentrok dengan agent B1.
3. `pos` terakhir — `pos-view.tsx` sendiri 12.762 baris; ekstraksi POS sebaiknya digabung dengan B3/U3.

**M3 (tool per domain):** grup route terbesar = domain prioritas tool: `wms` (98), `finance` (63), `orders`/`pos`/`shift`, `payroll` (24), `crm` (21). Pemetaan route → domain ada di `routes.json` (`group`).

**Responsif:** perbaiki T1–T3 sebelum redesign U-series agar baseline visual bersih.

## 7. Cara memperbarui

```bash
npx tsx scripts/screen-census.ts          # TABLES.md + routes.json (deterministik)
# screenshot: build + Postgres seed + next start, lalu Playwright per halaman (lihat PR S0b)
```
Tambah halaman/modul baru → tambahkan pemetaannya di `PAGE_MAP` / `MODULE_MAP` pada `scripts/screen-census.ts`;
URL yang tidak dipetakan muncul sebagai `UNMAPPED` di `TABLES.md`.
