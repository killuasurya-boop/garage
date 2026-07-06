# Handoff: GARAGE Warehouse Management System (WMS)

> Paket serah-terima untuk developer. Tujuan: membangun **GARAGE WMS** menjadi aplikasi operasional nyata, berbasis prototipe desain di paket ini.

---

## 1. Overview

GARAGE WMS adalah sistem manajemen gudang enterprise untuk **GARAGE Coffee & Motor** (bisnis F&B). Sistem ini berdiri sebagai **gudang independen** yang terhubung ke **Garage OS (POS)**: gudang "menjual" bahan ke Dapur & Bar sebagai transaksi internal (Internal Order), sehingga restock dan pengeluaran barang tercatat rapi dengan HPP.

Tujuan utama:
- Mempermudah **admin gudang** mencatat penerimaan, pengeluaran, dan stok opname.
- Memberi **owner** visibilitas food cost, margin, dan waste secara real-time.
- Menjadi "smart system 2026": forecast reorder, cold chain IoT, AI insight.

**18 modul** ada di prototipe; 4 layar utama (Dashboard, Inventory, Scanner, Receiving) paling detail, sisanya fungsional penuh sebagai alur.

---

## 2. About the Design Files

File `GARAGE WMS.dc.html` di bundle ini adalah **referensi desain yang dibuat dalam HTML** — prototipe yang menunjukkan tampilan & perilaku yang diinginkan, **bukan kode produksi untuk disalin langsung**.

Tugas developer: **membangun ulang desain ini di environment codebase yang sebenarnya** (disarankan **Next.js + React + TypeScript**, sesuai permintaan awal), memakai pola, state management, dan library yang sudah mapan di sana. Logika bisnis (FEFO, perhitungan HPP, pemotongan stok) yang ada di prototipe adalah **spesifikasi perilaku** — implementasikan di backend dengan benar, jangan hanya di frontend.

> ⚠️ **Penting:** Semua data di prototipe tersimpan di memori browser (hilang saat refresh). Ini PROTOTIPE, bukan sistem yang sudah punya database. Lihat bagian 9 (Arsitektur) & 10 (Data Model).

---

## 3. Fidelity

**High-fidelity (hifi).** Prototipe ini punya warna final, tipografi, spacing, dan interaksi yang sudah matang. Developer harus membangun ulang UI **se-presisi mungkin** memakai library codebase. Semua nilai desain (hex, font, radius, animasi) ada di bagian 8 (Design Tokens).

---

## 4. Tech Stack yang Disarankan

| Layer | Rekomendasi | Alasan |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | Diminta user; SSR + API routes |
| Bahasa | **TypeScript** | Type-safety untuk data inventory yang kompleks |
| UI | **React + Tailwind CSS** | Token desain mudah dipetakan ke Tailwind config |
| Animasi | **Framer Motion** | Sesuai spesifikasi animasi prototipe |
| Chart | **Recharts** | Area chart & bar chart di Dashboard/Reports |
| State server | **TanStack Query** | Caching, refetch, optimistic update |
| State klien | **Zustand** atau Context | Warehouse scope, sidebar, drawer |
| Database | **PostgreSQL + Prisma** | Relasi batch/stok/transaksi kuat |
| Auth | **NextAuth / Clerk** | Login + role-based access |
| Realtime | **Supabase Realtime / WebSocket** | Cold chain & multi-user |

---

## 5. Layout Shell (global)

Semua layar (kecuali Scanner yang full-dark) memakai shell yang sama:

- **Sidebar kiri** — lebar **240px**, bisa collapse ke **64px** (ikon saja). Background graphite `#2F3136`. Garis aksen merah 4px di paling atas. Logo "GARAGE / WMS · BACK OFFICE" di header. Nav dikelompokkan: **Main** (Dashboard, Inventory, Scan Barcode, Receiving, Transfer), **Operations** (Internal Order, Kitchen, Bar, Recipe, Production), **Control** (Stock Opname, Adjustment, Reports, Keuangan & HPP), **Smart 2026** (Smart Reorder, Cold Chain, Owner Analytics), **System** (Settings). Item aktif: border kiri merah + teks putih + background `rgba(200,16,46,0.14)`. Bawah sidebar: action bar (Tambah/Print/Design Laporan/Hapus) + profil user (avatar, nama, role badge) + chevron.
  - Saat collapse: label di-`display:none` (bukan opacity), ikon center, action bar menumpuk vertikal. Transisi width `0.26s cubic-bezier(.22,1,.36,1)`.
- **Header atas** — tinggi **60px**, putih, shadow-sm. Kiri: hamburger toggle + breadcrumb + judul halaman. Kanan: warehouse selector pill (WH-01 Gudang Utama ▼, 3 scope: Gudang Utama / Stok Bar / Stok Dapur) | command palette trigger (⌘K) | bell notifikasi dengan badge merah | avatar dropdown.
- **Content area** — background surface-2 `#F8F9FB`, padding 24px, garis aksen merah 4px di atas.

---

## 6. Screens / Views

### 6.1 Dashboard (home)
- **Purpose:** ringkasan harian admin & owner.
- **Layout:** AI Insight banner (gradient gelap) → KPI row 1 (4 kartu) → KPI row 2 (4 kartu kecil) → grid 60/40 (chart pergerakan stok 7 hari + Live Alerts) → grid 50/50 (Transaksi Terbaru + Quick Actions 2×2).
- **KPI row 1:** Total Item Aktif (1.247, count-up), Nilai Inventory HPP (Rp 284,7jt, count-up), Low Stock Alert (23, amber, pulse), Out of Stock (4, merah, pulse + ring).
- **Chart:** AreaChart 2 garis — Masuk (hijau `#16A34A`) & Keluar (merah `#C8102E`), gradient fill, animasi draw saat mount.
- **Live Alerts:** dot merah berkedip "LIVE", list alert dengan border kiri berwarna sesuai severity, slide-in stagger 40ms.
- **AI Insight banner:** rekomendasi harian + tombol aksi yang route ke Smart Reorder.

### 6.2 Inventory List
- Tabel: ☐ | Img | SKU | Nama | Min | Stok/Status | HPP | Aksi. SKU pakai JetBrains Mono warna merah. Mini stok bar (hijau/amber/merah). Baris OUT OF STOCK ber-background merah tipis.
- Filter bar sticky: search + pill (Warehouse/Status/Kategori) + sort. Chip filter aktif di bawah.
- **Bulk action bar** muncul (slide-up spring) saat baris dicentang: "N item dipilih | Print Labels | Export | Update Min Stok | ✕".

### 6.3 Barcode Scanner
- Full viewport dark `#181818`. Mode pills [SKU][Barcode][QR]. Viewport kamera dengan corner L-bracket merah + scan line animasi `scanline 2.4s ease-in-out infinite`. Scan history (kartu dark). Result bottom sheet (putih, slide-up spring) dengan info produk + tombol aksi.

### 6.4 Receiving Form
- Header dokumen RCV-... + badge DRAFT. Stepper 5 langkah (Supplier ✓ → Item & Qty ● → QC → Batch → Put Away). Tabel item dengan input Diterima/HPP, status QC (PASS/DISCREPANCY/REJECT), expand row → batch + expired + lokasi. Sticky totals card kanan.

### 6.5 Transfer
- KPI status (Pending/Proses/Kirim/Selesai). Tabel transfer dengan badge status, baris pending + tombol Approve.

### 6.6 Internal Order ⭐ (inti konsep)
- Gudang → Dapur/Bar sebagai transaksi internal (HPP).
- **Builder (slide-over panel):** pilih outlet (Dapur/Bar) → cari/tambah item (batch FEFO ditampilkan otomatis) → keranjang dengan stepper qty → total HPP live → "Konfirmasi & Potong Stok".
- Saat konfirmasi: **stok gudang berkurang**, dokumen IO baru muncul (highlight hijau, status ISSUED), toast konfirmasi. Validasi: tidak boleh keluar melebihi stok tersedia.

### 6.7 Recipe / BOM
- Kartu resep (COGS, harga jual, margin dihitung dari BOM). Klik → panel detail: 3 metrik + Food Cost Ratio (bar berwarna: hijau ≤30%, amber ≤38%, merah >38%) + Bill of Materials (tiap bahan: qty, biaya, % kontribusi COGS).

### 6.8 Keuangan & HPP ⭐
- **Master Modal Bahan**: 14 bahan + overhead dengan unit cost (sumber: Receiving).
- **HPP & Margin per Resep**: dihitung **otomatis** dari harga bahan. Jika harga beli berubah, HPP resep ikut berubah. KPI: Nilai Modal Inventory, Avg Food Cost, Bahan Terdaftar, status Auto-Sync.

### 6.9 Stock Opname
- Sesi opname aktif. KPI progress/variance/nilai selisih. Tabel hitung fisik dengan input qty, variance berwarna, baris bertanda jika selisih >10%.

### 6.10 Reports / Pergerakan Stok
- **Date filter dropdown beranimasi** (7 preset, animasi drop-in, centang merah pada aktif). KPI masuk/keluar/net/waste. Bar chart harian 10 hari. Tabel mutasi dengan border kiri per tipe transaksi.

### 6.11 Smart Reorder & Forecast
- Tabel prediksi: stok, forecast (conf %), sparkline tren 7 hari, saran qty, supplier+lead, urgensi berwarna, tombol "+PO". Tombol "Auto-Generate PO".

### 6.12 Cold Chain Monitor (IoT)
- Badge "LIVE IoT". Kartu suhu real-time chiller/freezer (normal/warning). Grafik tren suhu dengan zona aman 2–6°C. Riwayat excursion.

### 6.13 Owner Analytics
- KPI: Avg Food Cost, Gross Margin, Waste, Nilai Inventory. Tren food cost 7 bulan (area chart). Food cost per outlet (bar). Top 5 bahan by konsumsi.

### 6.14 Kitchen / Bar
- Stok per outlet + daftar permintaan internal order.

### 6.15 Settings
- **Master-detail 7 tab:** Profil & Akun, Warehouse & Lokasi (3 gudang), Ambang Stok & Expiry, User & Role, Keuangan & Pajak, Integrasi & Perangkat (Garage OS/printer/IoT), Notifikasi. Semua toggle switch fungsional (merah ON / abu OFF).

### 6.16 Global overlays
- **Command Palette (⌘K):** cari & lompat menu / aksi cepat.
- **Notifications drawer** (dari bell): dikelompokkan per severity warna (Kritis=merah, Peringatan=amber, Approval=biru), tombol aksi kontekstual yang route ke layar terkait.

---

## 7. Interactions & Behavior (animasi)

Gunakan **Framer Motion**. Hormati `prefers-reduced-motion` (disable semua animasi; pastikan elemen rest dalam keadaan visible — chart SVG `stroke-dashoffset:0; opacity:1`).

| Elemen | Animasi |
|---|---|
| Page enter | opacity 0→1, y 8→0, 350ms, ease `[0.22, 1, 0.36, 1]` |
| KPI cards | stagger 80ms, y 20→0 + fade |
| KPI numbers | count-up dari 0 ~1200ms (ease-out cubic) |
| Table rows | stagger 35ms, x -5→0 + fade |
| Card hover | translateY(-2px), shadow deepen, 200ms |
| Alert items | x 40→0, stagger 40ms |
| Critical values | pulse + ring kontinu |
| Scan line | CSS keyframes infinite, 2.4s |
| Bottom sheet | y 100%→0 spring |
| Slide-over (IO/Recipe/Notif) | translateX(100%)→0, 0.38s cubic-bezier(.22,1,.36,1) |
| Date dropdown | opacity+scale drop-in, 0.22s |
| Bulk action bar | y 60→0 spring saat ada seleksi |
| Stepper fill | left→right saat step selesai |

---

## 8. Design Tokens

```css
--garage-red:    #C8102E;   /* aksen utama (satu-satunya warna aksen) */
--garage-red-10: #FDF1F3;   /* tint merah */
--graphite:      #2F3136;   /* sidebar */
--surface-1:     #FFFFFF;
--surface-2:     #F8F9FB;   /* content bg */
--border:        #E8E8E8;
--text-primary:  #111111;
--text-secondary:#6B7280;
--status-green:  #16A34A;
--status-amber:  #D97706;
--status-red:    #DC2626;
--status-blue:   #2563EB;
/* tambahan dipakai di prototipe */
--purple:        #7C3AED;   /* waste, semi-finished */
--orange:        #EA580C;   /* expiring */
```

**Tipografi:** `Inter` (semua teks, weight 400–800). `JetBrains Mono` untuk SKU, barcode, nomor dokumen, batch.
**Type scale:** judul halaman 22px/800; judul kartu 14–15px/700; body 12.5–13px; KPI besar 23–30px/800; label kecil 10–11px/600–700 uppercase letter-spacing .05em.
**Radius:** kartu 12px; tombol/input 9px; pill 20px; toggle 11px.
**Shadow:** kartu hover `0 8px 24px rgba(16,24,40,.08)`; tombol merah `0 2px 8px rgba(200,16,46,.25)`; slide-over `-16px 0 50px rgba(0,0,0,.28)`.
**Status → warna (konsisten di seluruh app):** OUT OF STOCK/REJECT = merah; LOW STOCK/DISCREPANCY = amber; IN STOCK/PASS = hijau; EXPIRING = oranye; info/transfer = biru.

---

## 9. Arsitektur yang Disarankan

```
[Garage OS (POS)] --webhook penjualan--> [WMS API]
                                            |
   [Frontend Next.js] <--REST/tRPC--> [WMS API (Next API routes)]
                                            |
                                      [PostgreSQL + Prisma]
                                            |
                              [Realtime: cold chain, multi-user]
```

**Alur kunci yang harus jalan di backend:**
1. **Receiving** menambah stok + mencatat batch (number, expired, lokasi) + meng-update harga beli → memicu **recalculate HPP** semua resep yang memakai bahan itu.
2. **Internal Order** memotong stok gudang dengan **FEFO** (batch terdekat expired dulu), menambah sub-inventory outlet, mencatat nilai HPP.
3. **Integrasi Garage OS:** POS menjual menu → baca BOM resep → otomatis trigger Internal Order untuk memotong bahan. (Ditunda ke tahap backend sesuai permintaan; siapkan endpoint webhook.)
4. **Cold chain:** sensor IoT push suhu tiap 30 detik → simpan time-series → alert jika keluar zona aman.

---

## 10. Data Model (skema awal, Prisma-style)

```prisma
model Warehouse { id String @id; code String @unique; name String; type WhType; isPrimary Boolean }
enum WhType { MAIN BAR KITCHEN }

model Product {
  id String @id; sku String @unique; name String; category String
  unit String; minStock Float; hpp Float        // HPP = harga modal rata-rata
  warehouseStocks WarehouseStock[]; batches Batch[]
}

model WarehouseStock { id String @id; productId String; warehouseId String; qty Float }

model Batch {
  id String @id; productId String; batchNo String
  expiredAt DateTime?; qty Float; location String; receivedAt DateTime
}

model Receiving {
  id String @id; doc String @unique; supplier String; warehouseId String
  status DocStatus; items ReceivingItem[]; createdAt DateTime
}
model ReceivingItem { id String @id; receivingId String; productId String; orderedQty Float; receivedQty Float; hpp Float; qc QcStatus; batchNo String?; expiredAt DateTime? }
enum QcStatus { PASS DISCREPANCY REJECT }
enum DocStatus { DRAFT REQUEST APPROVED ISSUED RECEIVED COMPLETED }

model InternalOrder {
  id String @id; doc String @unique; outletWarehouseId String
  status DocStatus; totalHpp Float; items InternalOrderItem[]; createdAt DateTime
}
model InternalOrderItem { id String @id; orderId String; productId String; batchId String; qty Float; lineHpp Float }

model Recipe {
  id String @id; name String; category String; yieldQty String
  sellPrice Float; version String; bom BomItem[]
}
model BomItem { id String @id; recipeId String; productId String; qty Float }   // cost = product.hpp * qty (hitung di query)

model StockOpname { id String @id; doc String; warehouseId String; status DocStatus; lines OpnameLine[] }
model OpnameLine { id String @id; opnameId String; productId String; systemQty Float; physicalQty Float } // variance = physical - system

model ColdChainReading { id String @id; unitCode String; tempC Float; recordedAt DateTime }

model User { id String @id; name String; email String @unique; role Role; warehouseId String? }
enum Role { OWNER MANAGER WAREHOUSE_ADMIN RECEIVING_STAFF BARISTA }

model StockMovement {   // ledger semua mutasi (untuk Reports & audit)
  id String @id; type MoveType; productId String; warehouseId String
  qty Float; valueHpp Float; refDoc String; userId String; createdAt DateTime
}
enum MoveType { IN OUT TRANSFER WASTE ADJUSTMENT INTERNAL_OUT }
```

**Perhitungan turunan (jangan disimpan, hitung saat query):**
- `recipe.cogs = Σ(bomItem.qty × product.hpp)`
- `foodCostPct = cogs / sellPrice × 100`
- `margin = sellPrice − cogs`

---

## 11. API Endpoints (saran minimal)

```
GET    /api/dashboard?warehouse=             → KPI + chart + alerts
GET    /api/products?search=&status=&warehouse=
POST   /api/products                          → tambah produk
GET    /api/products/:id
POST   /api/receiving                         → buat draft
PATCH  /api/receiving/:id                     → update item/QC
POST   /api/receiving/:id/complete            → +stok, +batch, recalc HPP
POST   /api/internal-orders                   → buat (FEFO pick batch)
POST   /api/internal-orders/:id/issue         → potong stok gudang
GET    /api/recipes  /  GET /api/recipes/:id  → BOM + cogs/margin
GET    /api/finance/materials                 → master modal bahan
GET    /api/finance/hpp                        → HPP & margin per resep
GET    /api/stock-opname/:id  / POST .../finalize
GET    /api/reports/movements?from=&to=&type=
GET    /api/reorder/suggestions               → forecast + saran
POST   /api/cold-chain/readings  (webhook IoT)
POST   /api/webhooks/garage-os/sale           → POS jual → trigger internal order via BOM
```

---

## 12. Files dalam bundle

- `GARAGE WMS.dc.html` — prototipe lengkap (18 modul). Buka di browser untuk melihat tampilan & interaksi referensi. Ini Design Component (HTML+JS) — baca sebagai spesifikasi visual & perilaku, bukan kode untuk disalin.

---

## 13. Urutan Build yang Disarankan (fase)

1. **Fondasi:** auth + role + warehouse + Product + WarehouseStock + shell UI (sidebar/header).
2. **Inventory + Receiving** (inti): list, filter, tambah produk, receiving → stok masuk + batch + HPP.
3. **Internal Order + FEFO** (pembeda): builder, potong stok, ledger StockMovement.
4. **Recipe/BOM + Keuangan/HPP:** perhitungan otomatis food cost.
5. **Reports + Stock Opname + Adjustment.**
6. **Smart 2026:** Reorder forecast, Cold Chain IoT, Owner Analytics.
7. **Integrasi Garage OS** (webhook POS → BOM → internal order).

---

*Dokumen ini self-sufficient: developer yang tidak ikut percakapan bisa membangun dari README ini saja. Untuk detail visual presisi, buka `GARAGE WMS.dc.html` di browser dan inspeksi elemennya.*
