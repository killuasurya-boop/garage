# Garage Smart Partner Hub — GATE 0: Audit & Planning

**Tanggal:** 10 November 2026
**Basis audit:** `main` @ `d6cc7f8`, dibaca sendiri dari kode; runtime belum diuji untuk modul ini.
**Status:** MENUNGGU ACC OWNER. Belum ada kode, migrasi, maupun deploy.
**Sumber:**
- PRD Smart Partner Hub Master V1.0;
- 6 papan desain di `docs/design-references/partner-hub/`.

File "MASTER PROMPT" terpisah tidak ikut terlampir. Yang terbaca hanya instruksi di pesan dan PRD.

> ⚠️ Penting untuk ACC: di repo ini **setiap merge ke `main` langsung deploy ke produksi**
> (`.github/workflows/deploy.yml`, `on: push: branches: [main]`, termasuk migrasi). Karena itu:
> - "deploy tanpa izin" = "merge ke main tanpa izin";
> - semua pekerjaan Partner Hub berjalan di branch/PR dan diuji di staging;
> - merge ke main hanya terjadi setelah ACC deploy terpisah.

---

## 1. Audit kondisi repository

### 1.1 Belum ada (perlu dibangun)

- Tidak ada tabel, route, atau UI untuk mitra/partner/konsinyasi.
- Dari 209 tabel, tidak ada `partners*`.
- Role sistem hanya `Owner | Manajer | Kasir | Waiter` (`src/lib/garage-data.ts:34`). Belum ada akun mitra.
- **`order_items` tidak menyimpan HPP per baris.**
  - Margin dihitung dari `menu_variants.base_cost` yang berlaku saat ini (`product-management.ts`, `profitmax-service.ts`).
  - Pengecualian: `event_snapshot` untuk menu event.
  - Akibatnya, laporan mitra wajib punya snapshot sendiri (PRD 16.3 #3).
- **POS kasir (`createOrderImpl`, `garage-service.ts:11547`) tidak menolak produk `sold_out` di server.**
  - Pengecekan baru ada di order pelanggan (`createCustomerOrder`, `garage-service.ts:9704`).
  - Ini celah P0 untuk UAT-04. Perbaikannya juga berdampak ke produk Garage biasa, jadi perlu keputusan (lihat DEC-13).

### 1.2 Sudah ada dan dipakai ulang (tidak dibangun ganda)

| Kebutuhan PRD | Komponen eksisting | Catatan |
|---|---|---|
| Status Tersedia / Habis | `menu_items.stock` = `ready` / `limited` / `sold_out`, `updateMenuProductStock`, label HABIS di POS & menu digital | Mitra hanya memakai `ready` / `sold_out`. Tanpa stok numerik dan tanpa resep WMS, sehingga auto-sold-out resep (`garage-service.ts:1678`) tidak berlaku |
| Snapshot harga jual | `order_items.unit_price`, `line_total` | Harga jual aman. HPP ditambahkan di tabel partner |
| Order POS + idempotensi | `POST /api/orders` + `checkIdempotency`, `orders.client_request_key` | Order mitra memakai jalur ini, **bukan** Quick Retail |
| Pemisahan tiket per station | `kitchen_tickets` (`station`) + `production_ticket_items` (`order_item_id`) | Station baru `Mitra` + `partner_id` |
| Klaim & antar waiter | `kitchen_tickets.claimed_by/at`, `claimKitchenTicketImpl` (`:12699`), `delivered_at/by`, `/api/waiter/tickets` | Fondasi "Siap Antar (Waiter Hub)" |
| Realtime | SSE `/api/production/stream` + `use-production-stream.ts` | Dipakai untuk Sold Out & tiket mitra, dengan fallback polling |
| Notifikasi | `notifyStaff` / `resolveStaffNotifications` (`staff_notifications`, dedup) | Audience baru untuk mitra |
| Menu digital read-only | `digitalMenuMode = waiter_list` per outlet (`digital-menu-mode.ts`); API pelanggan 403 `DIGITAL_MENU_VIEW_ONLY` | DEC-10 bisa dipenuhi tanpa kode baru, cukup setelan. Tapi `self_order` masih default (DEC-14) |
| Void / refund / split / pindah meja | `voidOrder`, `requestOrderRefundApproval` (`:15309`), `splitCustomerOrder` (`:16024`), `moveTable` | Perlu hook penyesuaian partner, bukan menghapus baris |
| Bayar supplier, parsial, bukti, verifikasi ≠ pembuat | `wms_supplier_bill` + `wms_supplier_payment` (`wms-procurement.ts`) | Pola dicontoh untuk `partner_payouts`. Tabelnya tidak dipakai bersama |
| Buku kas & rekening | `cash_ledger_entries`, akun `bank_jago` / `bank_bni` / `external` | Transfer ke mitra keluar dari rekening (DEC-06) |
| PDF profesional | pdfkit, 13 generator (`wms-po-pdf.ts` deterministik, `owner-reports-pdf.ts` DRAFT/FINAL + snapshot hash) | PDF mitra mengikuti pola FINAL snapshot (B7a) |
| Logo resmi | `public/garage-brand/garage-coffee-logo.png`, `-logo-dark.png`, `-icon.png` | Fail-closed jika file hilang (UAT-23) |
| Approval & 2FA Owner | `approvals`, Decision Center, step-up TOTP | Approval settlement + perubahan rekening |
| Audit | `audit_logs` + pola append-only (trigger ledger) | `partner_events` append-only |
| Guard API | `KNOWN_ROUTE_GUARDS`, `public-routes.ts`, `api-route-auth.test.ts` | Route `/api/partner/*` wajib lolos tes guard |
| Staging | `docker-compose.staging.yml`, `scripts/deploy-staging.sh`, DB `garage_staging` | Jalur UAT |

### 1.3 Catatan atas papan desain (tidak dijadikan sumber angka)

1. **Rumus setoran di papan "Keuangan Mitra" bertentangan dengan PRD.**
   - Papan menulis "Setoran ke Mitra (60% dari Profit Garage)" dengan Profit Rp1.728.000 = Setoran Rp1.728.000.
   - PRD 12.1: kewajiban mitra = HPP yang memenuhi syarat ± penyesuaian.
   - **Saya ikuti PRD.** Semua angka di papan adalah simulasi.
2. **Papan "Portal Mitra" menampilkan "2 mitra perlu setoran" dan beberapa mitra sekaligus.**
   - Ini melanggar isolasi data (PRD 03, UAT-20).
   - Portal hanya menampilkan data mitra yang sedang login.
3. **Glassmorphism / blur berat bertentangan dengan kebijakan motion CLAUDE.md** (glassmorphism sengaja dilewati).
   - Usul: panel dibuat dengan kartu solid sedikit transparan + glow merah, tanpa `backdrop-blur` besar.
4. **Logo di papan berupa wordmark gambar.**
   - Implementasi memakai PNG resmi dengan `object-contain`, tidak digambar ulang.
5. **Dari papan "Siap Antar", "Klaim Grup" per meja (beberapa tiket, satu perjalanan)** adalah fitur baru di atas klaim per tiket.
   - Usul masuk P1.
   - "Rute Pengantaran / Trip" masuk P2.

---

## 2. Arsitektur sistem

```
           ┌───────────── POS V6 (kasir) ──────────────┐   ┌── Waiter app ──┐
           │ Produk Mitra │ Pesanan Mitra │ Keuangan    │   │ Siap Antar     │
           └──────┬──────────────┬──────────────┬──────┘   └──────┬─────────┘
                  │ POST /api/orders (jalur normal + idempotency)  │ claim/deliver
                  ▼                                                ▼
   orders ─ order_items ─┬─ kitchen_tickets (station Bar/Food) → Production Hub (tetap)
   (sumber transaksi     └─ kitchen_tickets (station "Mitra", partner_id)
    tunggal)                   │            → Partner Portal /partner (mitra sendiri)
                               ▼
                    partner_order_lines (snapshot HPP+harga, unik per order_item)
                               │ event pemenuhan (ready/delivered/cancel/refund)
                               ▼
              partner_adjustments ── partner_settlements ── partner_settlement_lines
                               │                │
                               │                ├─ partner_payouts (bukti, verifikasi ≠ pembuat)
                               │                └─ partner_reports (PDF DRAFT/FINAL, checksum)
                               ▼
                 expenses (HPP Mitra, sourceDoc = settlement) + cash_ledger (transfer)
```

**Prinsip:**
1. `order_items` tetap satu-satunya sumber penjualan.
2. Partner Hub hanya menambah relasi dan snapshot.
3. Feature flag `partnerHubEnabled` per outlet, dengan kondisi mati = perilaku sekarang 100%.
4. Semua angka dihitung di server dari snapshot dan ledger.

**Rekomendasi akun mitra (DEC-15): sesi Partner terpisah, bukan role staf.**
- Tabel `partner_accounts` dipakai dengan pola auth member (PIN/kata sandi + JWT cookie, `pin-attempt-guard`) yang sudah teruji.
- Dengan begitu mitra tidak pernah masuk `staff_profiles`, sehingga tidak muncul di payroll, absensi, daftar staf, atau izin POS.
- `partner_id` diambil dari sesi, tidak pernah dari parameter klien.

---

## 3. Rencana database dan integrasi

Rencananya satu migrasi `0188_partner_hub.sql`. Sifatnya aditif:
- tidak mengubah kolom lama, hanya menambah tabel dan kolom nullable;
- reversible lewat skrip `down` terdokumentasi;
- diuji di PGlite dan staging.

| Tabel / perubahan | Isi kunci | Constraint utama |
|---|---|---|
| `partners` | kode unik, nama usaha, PIC, WA, alamat, titik serah-terima, jam layanan & last order per hari, status `draft/verifikasi/disetujui/aktif/dibekukan/nonaktif`, status operasional `buka/jeda/tutup`, aturan settlement, SLA, outlet | `code` unik; aktivasi hanya via fungsi yang memeriksa syarat PRD 04 |
| `partner_bank_accounts` | bank, nama penerima, nomor rekening (hanya 4 digit akhir terlihat), status verifikasi, versi | perubahan = baris baru + approval Owner (2FA); tidak di-update di tempat |
| `partner_accounts` | login mitra → `partner_id`, outlet, status, `pin_hash`, `last_login` | 1 akun → 1 mitra |
| `partner_product_links` | `menu_item_id` (+ varian) → `partner_id`, aktif, `approved_by` | satu menu item hanya punya satu mitra aktif |
| `partner_price_history` | HPP & harga jual per varian, `effective_from`, alasan, approver | append-only |
| `menu_items` | **tanpa kolom baru**; produk mitra = `product_type 'partner'` (nilai baru), station `Mitra` | produk regular tidak bisa jadi partner tanpa link |
| `kitchen_tickets` + `production_ticket_items` | kolom baru nullable `partner_id` | Production Hub mengecualikan station `Mitra` |
| `partner_order_lines` | `order_item_id`, `partner_id`, snapshot `unit_price`, `unit_cost`, qty dipesan / dipenuhi / batal, status | **UNIQUE(order_item_id)**; nominal integer rupiah |
| `partner_events` | transisi tiket & produk, aktor, alasan, request id | append-only (trigger seperti ledger) |
| `partner_adjustments` | refund / diskon / batal / koreksi / sengketa, nilai ±, approval | tidak menghapus baris sumber |
| `partner_settlements` | `partner_id`, outlet, periode, nomor, total, status (PRD 13.1), versi | tidak boleh tumpang tindih untuk periode aktif |
| `partner_settlement_lines` | line / adjustment → settlement | **UNIQUE(order_line_id) untuk settlement aktif** (anti dobel) |
| `partner_payouts` | nominal, rekening tujuan (versi), sumber dana, referensi bank, bukti, pembuat, pemeriksa | **UNIQUE(reference)**, idempotency key; verifikator ≠ pembuat (kecuali Owner, ditandai) |
| `partner_reports` | PDF DRAFT / FINAL, versi, checksum sha256, total_lines, path privat | FINAL immutable |

### Titik integrasi kode

1. `createOrderImpl` / open-bill / waiter order, dalam transaksi yang sama:
   - validasi produk mitra di server: mitra aktif + BUKA + produk `ready` + belum lewat last order;
   - buat tiket station `Mitra` per `partner_id`;
   - insert `partner_order_lines` dengan snapshot HPP.
2. Event tiket (terima / proses / siap / klaim / antar / tolak) memakai mesin transisi server, dicatat ke `partner_events`.
3. Hook pada void, refund, split, dan pindah meja: menulis `partner_adjustments` atau memperbarui tujuan, dengan audit.
4. Settlement approve:
   - membuat 1 baris `expenses` kategori "HPP Mitra" (`sourceDoc` = nomor settlement, idempoten), sesuai `cogsBasis: purchase`;
   - pembayaran mencatat `cash_ledger_entries` dari rekening Garage ke `external`.
   - Model ini menunggu DEC-06.
5. Menu digital: produk mitra tampil + label SOLD OUT. Checkout pelanggan ditutup sesuai DEC-10/DEC-14.

---

## 4. Mapping komponen UI/UX (papan → implementasi)

| Papan | Layar target | Komponen / lokasi rencana |
|---|---|---|
| 00 Design System | Token & komponen | Token `--pos-*` / `--gos-*` + komponen `src/components/ds/` (`StatusPill`, `MoneyText`, `StateView`). Tambahan baru hanya bila belum ada (Toggle/Segmented sudah ada di shadcn). Tanpa blur berat |
| 05 Partner Hub Dashboard | `/control/partners` (Owner/Manajer) | KPI 4 kartu, kartu mitra (status, Tersedia/Sold Out, Hubungi WA), tabel pesanan aktif, panel Siap Antar |
| 04 Keuangan Mitra | Tab "Keuangan Mitra" di POS V6 + `/control/partners/finance` | Filter, 6 KPI, tabel rincian dikelompokkan per mitra, ringkasan per mitra, Preview/Export PDF, Ajukan Settlement. **Rumus mengikuti PRD, bukan "60%"** |
| 01 Preview Laporan | Dialog preview PDF + pengaturan ekspor | Viewer PDF (`?inline=1`, pola `PosV6ModuleSheet`), pilih mitra & rentang, opsi baris detail, Draft/Final, riwayat versi |
| 02 Siap Antar (Waiter Hub) | Waiter app: tab "Ambil dari Mitra" | Daftar tiket station Mitra yang `ready`, Klaim (eksisting), Klaim Grup per meja (P1), alur 4 langkah, peringatan siap >10 menit |
| 03 Portal Mitra (mobile) | `/partner` (mobile-first) | Kartu mitra + Buka/Tutup, Hak Mitra hari ini (miliknya saja), Ketersediaan produk (Tersedia/Sold Out), Pesanan baru + SLA, Terima / Proses / Siap Antar, WA, Riwayat, bottom nav |

QA visual mengikuti CLAUDE.md:
- 1366×900 dan 390×844;
- Portal Mitra juga 360 dan 768;
- tanpa overflow, angka tidak terpotong, kontras AA, `prefers-reduced-motion`.

---

## 5. Rencana implementasi per batch (setiap batch = 1 PR, uji, demo staging)

| Batch | Isi | Prio | Gate lulus |
|---|---|---|---|
| **B0** | Fondasi aman: feature flag per outlet; **validasi sold_out di server untuk POS** (DEC-13); baseline tes & snapshot POS (`/api/admin/pos-baseline`) | P0 | Tes regresi order lama hijau; flag OFF = perilaku identik |
| **B1** | Data & izin: migrasi 0188, `partners` / akun / rekening / produk / harga, sesi Partner terpisah, tes isolasi | P0 | Tes akses: mitra A tidak bisa membaca B (403/404); migrasi di staging |
| **B2** | Master & ketersediaan: registrasi mitra (Owner), link produk + harga (24 SKU sebagai **draft nonaktif**), toggle Tersedia/Habis, Buka/Jeda/Tutup, last order, realtime + polling | P0 | UAT-01..05, UAT-26 |
| **B3** | Order & tiket: routing station Mitra di order POS / waiter / open-bill, snapshot HPP, idempotensi, Partner Portal (antrean, terima / proses / siap / tolak) | P0 | UAT-06..09 |
| **B4** | Waiter: tab Ambil dari Mitra, klaim tunggal / grup, antar parsial, pindah meja | P0 (grup = P1) | UAT-10..12 |
| **B5** | Keuangan: ledger lines, adjustment (void / refund / split / diskon), panel Keuangan Mitra POS, closing tanpa blokir shift, settlement draft → ajukan → approve (Owner 2FA) → payout parsial, rekonsiliasi | P0 | UAT-13..19; selisih **Rp0** antara sumber, ledger, dashboard, PDF |
| **B6** | PDF & WA: PDF resmi mitra (A4 landscape, header berulang, logo resmi fail-closed), PDF internal, DRAFT/FINAL + arsip versi, tombol WA (wa.me, tanpa HPP/nomor pelanggan) | P0 (WA API = P2) | UAT-20..25 |
| **B7** | Monitoring & SLA: alarm terima/siap, dashboard Owner, notifikasi, insiden & sengketa | P1 | Alarm teruji di staging |
| **B8** | Pilot: 1 outlet, Es Krim Pokat Au dulu, Dimsum setelah DEC-01; SOP & training | — | ACC go-live terpisah |

P2 (sesudah V1): WhatsApp Business API template, trip/rute pengantaran, pengajuan perubahan harga dari mitra, dashboard analitik lanjutan.

---

## 6. MASTER CHECKLIST

### P0 — wajib sebelum pilot
- [ ] Feature flag per outlet; flag OFF = tidak ada perubahan perilaku
- [ ] Validasi sold_out di server untuk POS (mitra wajib; Garage sesuai DEC-13)
- [ ] Migrasi 0188 aditif + down script + tes PGlite + staging
- [ ] Sesi Partner terpisah, scope `partner_id` dari sesi, tes isolasi lintas mitra
- [ ] Registrasi & aktivasi mitra dengan syarat PRD 04; rekening terverifikasi + histori
- [ ] Link produk + histori harga per varian; produk regular tidak bisa masuk payout
- [ ] Tersedia / Habis + Buka / Jeda / Tutup + last order, divalidasi server di setiap kanal
- [ ] Routing tiket station Mitra dari order POS normal (bukan Quick Retail), order campuran
- [ ] Snapshot HPP & harga di `partner_order_lines`, UNIQUE per order_item
- [ ] Mesin status tiket di server + `partner_events` append-only
- [ ] Partner Portal: antrean, terima / proses / siap / tolak, produk saya, keuangan sendiri
- [ ] Waiter: Ambil dari Mitra, klaim tunggal anti-ganda, antar parsial, pindah meja
- [ ] Ledger kewajiban, adjustment, settlement + payout parsial, anti dobel (constraint DB)
- [ ] Panel Keuangan Mitra di POS dengan pembatasan per role
- [ ] PDF resmi mitra + PDF internal, logo resmi fail-closed, FINAL immutable + checksum
- [ ] Rekonsiliasi Rp0: sumber = ledger = dashboard = PDF
- [ ] Guard semua route baru lolos `api-route-auth.test.ts`; rate limit & idempotency pada mutasi

### P1 — sebelum operasional penuh
- [ ] Klaim grup per meja (papan 02)
- [ ] SLA & alarm (2 / 5 / 3 menit, bisa dikonfigurasi per mitra)
- [ ] Dashboard Owner `/control/partners`
- [ ] Insiden & sengketa terstruktur
- [ ] Monitoring: tiket stagnan, ketersediaan basi, selisih ledger

### P2 — sesudah V1
- [ ] WhatsApp template API resmi
- [ ] Trip / rute pengantaran
- [ ] Pengajuan harga dari mitra
- [ ] Analitik lanjutan

---

## 7. Checklist pengujian

1. **Unit (vitest):**
   - aturan ketersediaan (aktif, buka, last order, sold_out);
   - mesin status tiket (transisi sah / terlarang);
   - rumus PRD 12.1 termasuk diskon / refund / parsial;
   - alokasi diskon;
   - status settlement;
   - format IDR integer.
2. **Integrasi (PGlite):**
   - order campuran Garage + 2 mitra → 1 invoice, tiket benar;
   - retry / double click → 1 order & 1 tiket;
   - dua waiter klaim bersamaan → 1 sah;
   - HPP diubah setelah order → snapshot tetap;
   - void / refund / split → adjustment, tidak dobel;
   - settlement tidak memasukkan baris dua kali;
   - payout dengan referensi ganda ditolak;
   - payout ≤ kewajiban.
3. **Keamanan:**
   - mitra A meminta data mitra B (tiket, laporan, PDF) → 403/404;
   - waiter tidak bisa melihat HPP / profit;
   - kasir tidak bisa memverifikasi transfer;
   - mitra tidak bisa mengubah harga;
   - tes guard route.
4. **Regresi:**
   - suite penuh lama tetap hijau;
   - e2e `critical-flows.spec.ts` (POS tunai / QRIS, tutup shift, PDF Owner);
   - Quick Retail rokok / cookies tanpa tiket mitra (UAT-02);
   - Bar / Kitchen normal saat modul mati (UAT-24).
5. **E2E Playwright baru:** kasir jual → Portal Mitra terima / proses / siap → waiter klaim / antar → settlement → PDF.
6. **PDF:**
   - 100+ dan 1.000 baris lengkap, header berulang, subtotal cocok;
   - DRAFT bertanda watermark;
   - FINAL butuh approval;
   - tanpa logo → final diblokir (UAT-21..23).
7. **UAT staging:** UAT-01..26 dijalankan Owner / kasir / waiter / mitra, multi-perangkat, ganti shift, koneksi putus.
8. **Visual:** 1366×900, 390×844, 360, 768; console bersih; reduced motion.

---

## 8. Staging, deployment, dan rollback

1. **Pengembangan:** branch per batch → PR draft → CI + review → **tidak merge ke main** sampai ACC.
2. **Staging:**
   - `scripts/deploy-staging.sh <branch>` ke `garage_staging` (data produksi teranonimkan);
   - migrasi 0188 dijalankan di staging;
   - UAT berjalan di staging;
   - pesan keluar dan AI tetap mati.
3. **Sebelum produksi:**
   - backup terverifikasi + `scripts/restore-drill.sh`;
   - `scripts/release-check.sh` di commit merge;
   - snapshot `/api/admin/pos-baseline` sebelum dan sesudah;
   - flag `partnerHubEnabled` **OFF** saat rilis.
4. **Produksi (dengan ACC terpisah):**
   - merge → Deploy VPS otomatis (migrasi aditif) → `smoke-prod.sh`;
   - flag tetap OFF;
   - lalu Owner menyalakan flag untuk 1 outlet + 1 mitra (pilot).
5. **Rollback:**
   - Level 1: matikan flag, perilaku POS kembali seperti sekarang, data partner tetap tersimpan.
   - Level 2: revert commit aplikasi. Tabel aditif tidak mengganggu kode lama, jadi tidak perlu down-migration.
   - Level 3 (darurat): down script / restore backup, hanya dengan ACC Owner.

---

## 9. Keputusan yang membutuhkan persetujuan Owner

| Kode | Keputusan | Rekomendasi |
|---|---|---|
| DEC-01 | Identitas & kontrak mitra Dimsum, ejaan "Pancake isi lapan" (DEC-12) | Import sebagai draft nonaktif sampai dikonfirmasi |
| DEC-02 | Titik siap & serah-terima per mitra | Kolom per mitra; Es Krim di outlet? |
| DEC-03 | Kapan item wajib dibayar ke mitra | Setelah **Siap Antar / dipenuhi** (bukan saat order dibuat) |
| DEC-04 | Barang batal setelah mulai dibuat | Ditahan untuk keputusan Owner per kasus |
| DEC-05 | Penanggung diskon / promo / refund | Promo Garage ditanggung Garage, HPP mitra tetap |
| DEC-06 | Model akuntansi | Garage membeli dari mitra: HPP mitra masuk `expenses` "HPP Mitra" saat settlement disetujui, transfer dicatat di buku kas. Perlu konfirmasi Finance |
| DEC-07 | Jadwal bayar Dimsum | Dikonfigurasi per mitra |
| DEC-08 | Siapa yang mencatat / memverifikasi transfer | Manajer mencatat, Owner memverifikasi (Owner sendiri = ditandai "tanpa pemeriksa kedua") |
| DEC-11 | Status tidak terverifikasi (offline) | Blokir order baru |
| **DEC-13** | Validasi sold_out di server untuk **semua** produk POS (sekarang hanya order pelanggan) | **Ya.** Menutup celah UAT-04, tapi kasir tidak bisa lagi menjual item berstatus HABIS sebelum statusnya diubah |
| **DEC-14** | Menu digital: outlet pilot diubah ke `waiter_list` (read-only), atau tetap `self_order` tetapi produk mitra diblokir dari checkout pelanggan | **Blokir produk mitra dari checkout pelanggan** di semua mode, dengan mode outlet tetap seperti sekarang |
| **DEC-15** | Akun mitra: sesi Partner terpisah vs role staf baru | **Sesi terpisah** (isolasi lebih kuat, tidak menyentuh payroll / staf) |
| **DEC-16** | Rumus papan "Setoran = 60% Profit" vs PRD "Setoran = HPP" | **Ikuti PRD** (setoran = HPP ± penyesuaian) |
| **DEC-17** | Gaya visual: glassmorphism papan vs kebijakan tanpa blur berat | Kartu solid sedikit transparan + glow merah, tanpa blur besar |
| **DEC-18** | Nomor rekening Es Krim lengkap | Diinput Owner sendiri di layar Owner (bukan lewat chat / repo), lalu diverifikasi |
| DEC-19 | Urutan pilot | Es Krim Pokat Au dulu (data lengkap), Dimsum setelah DEC-01 |

---

## 10. Batas klaim

Dokumen ini adalah audit kode statis dan rencana. Belum ada implementasi, migrasi, uji runtime modul mitra, akun mitra, maupun deploy. Semua angka di papan desain adalah simulasi.
