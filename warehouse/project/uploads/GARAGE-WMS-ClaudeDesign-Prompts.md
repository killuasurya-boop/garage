# 🎨 CLAUDE DESIGN — MASTER PROMPT
## GARAGE Warehouse Management System · UI/UX Build

---

> **Cara pakai:** Copy salah satu prompt di bawah, paste langsung ke Claude Design.
> Setiap prompt dirancang untuk satu halaman / komponen spesifik.
> Urutan pengerjaan: mulai dari **[00] Design System** dulu, baru halaman lain.

---

---

## [00] DESIGN SYSTEM & FOUNDATION
### *Kerjakan PERTAMA sebelum halaman lain*

```
Build a complete design system foundation for GARAGE Warehouse Management System — a professional enterprise WMS for F&B businesses (coffee shops, restaurants, multi-outlet chains) built with Next.js 15 + Framer Motion.

IDENTITY:
Brand is GARAGE Coffee & Motor — industrial, bold, modern. Think automotive workshop meets premium F&B. Clean data-first interface that feels fast and confident. Staff use this for 8+ hours/day so it must not tire the eyes.

DESIGN TOKENS — implement ALL of these exactly:

CSS Custom Properties:
  --garage-red: #C8102E        /* Primary: CTAs, critical alerts, brand */
  --garage-red-10: #FDF1F3     /* Red tint for icon backgrounds */
  --garage-red-20: #FAD7DC     /* Red hover states */
  --graphite: #2F3136          /* Sidebar, dark headers */
  --graphite-80: #484D55       /* Secondary text on dark */
  --graphite-10: #F8F9FB       /* Page background */
  --status-green: #16A34A      /* In stock, success */
  --status-amber: #D97706      /* Low stock, warning */
  --status-red: #DC2626        /* Out of stock, critical */
  --status-blue: #2563EB       /* In progress, info */
  --status-purple: #7C3AED     /* Analytics, system */
  --surface-1: #FFFFFF         /* Card backgrounds */
  --surface-2: #F8F9FB         /* Page background */
  --surface-3: #F3F4F6         /* Input bg, chips */
  --border: #E8E8E8            /* Default borders */
  --text-primary: #111111
  --text-secondary: #6B7280
  --text-muted: #9CA3AF

TYPOGRAPHY:
  Font: Inter (all weights 400–800) from Google Fonts
  Mono font: JetBrains Mono (for SKU codes, barcode values, numbers)
  Scale:
    10px — eyebrows, uppercase labels (letter-spacing: 2px)
    12px — captions, badges, table headers
    13px — body text (default)
    14px — standard body
    16px — subheadings
    22px — section titles
    30px — KPI metric numbers
    36px — hero metrics

SPACING: 4px base grid. Common: 4/8/12/16/20/24/32/40/48px
RADIUS: sm=6px badges | md=8px buttons/inputs | lg=10px cards | xl=14px modals

LAYOUT SHELL (build this as the main wrapper):
  - Left sidebar: 240px wide, graphite (#2F3136) background
    • GARAGE logo + "WMS" wordmark at top (red accent bar)
    • Nav items with icon + label, red active state, hover: slight lighten
    • Sections: Main, Operations, Control, Settings
    • Bottom: user avatar + role + logout
    • Collapsed state: 64px, icons only
  - Top header: white, 60px tall, shadow-sm
    • Left: Breadcrumb + page title
    • Right: Warehouse selector dropdown | Notification bell (with red dot badge) | User menu
  - Main content: graphite-10 background, 24px padding

ANIMATION RULES (implement with Framer Motion):
  Page enter: opacity 0→1, y 8→0, duration 350ms, ease [0.22, 1, 0.36, 1]
  Card hover: y -2px, box-shadow increase, duration 200ms
  Sidebar item hover: background lighten, x 2px nudge
  All animations MUST respect prefers-reduced-motion

COMPONENT PRIMITIVES TO BUILD:
  1. Button — variants: primary (red), secondary (outline), ghost, danger | sizes: sm/md/lg | loading state with spinner
  2. Badge — variants: green/amber/red/blue/purple/gray | sizes: sm/md
  3. Input — default, focused (red border), error state, with icon prefix/suffix, search variant
  4. Card — default white with border, hover lift animation
  5. StatusDot — colored dot with optional pulse animation for critical states
  6. Skeleton — loading placeholder matching card/table shapes

Show all components in a living style guide layout. Include dark sidebar preview alongside white content area to show the full shell.
```

---

## [01] DASHBOARD UTAMA
### *Halaman yang paling sering dilihat — harus impresif*

```
Build the main operational dashboard for GARAGE Warehouse Management System. This is a Next.js React component using Framer Motion for animations and Recharts for charts.

DESIGN CONTEXT:
- Dark graphite sidebar (240px) + white/light-gray content area
- Professional, data-dense, zero visual clutter
- Staff check this every morning — must show critical info at a glance
- Use Inter font, garage-red (#C8102E) as primary accent

LAYOUT (top to bottom):

1. PAGE HEADER (inside content area, not sidebar)
   - Left: "Dashboard" title (22px bold) + "Senin, 29 Juni 2026" subtitle
   - Right: Warehouse selector pill ("WH-01 Gudang Utama" with dropdown chevron) + "Refresh" icon button
   - Thin red accent line at very top of content area (4px)

2. KPI CARDS ROW — 4 columns, equal width
   Each card: white bg, rounded-xl, border, 20px padding
   Cards (in order):
   
   Card 1 — TOTAL ITEMS
   Icon: box/package (red bg icon box)
   Value: "1,247" in 30px bold, animate count-up from 0 on load
   Label: "Total Item Aktif"
   Subtext: "+12 item baru minggu ini" in green
   
   Card 2 — INVENTORY VALUE  
   Icon: chart/value
   Value: "Rp 284,7jt" in 30px bold, animate count-up
   Label: "Nilai Inventory (HPP)"
   Subtext: "Per hari ini 09:41"
   
   Card 3 — LOW STOCK ALERT ⚠️
   Icon: alert triangle
   Value: "23" in 30px bold, COLOR: amber #D97706
   Label: "Low Stock Alert"
   Subtext: "Di bawah minimum stok"
   Card border: amber-200, bg: amber-50/30
   Add subtle pulse animation on the amber value
   
   Card 4 — OUT OF STOCK 🔴
   Icon: X circle
   Value: "4" in 30px bold, COLOR: red #DC2626  
   Label: "Out of Stock"
   Subtext: "Perlu restock segera"
   Card border: red-200, bg: red-50/30
   Add stronger pulse/ring animation on value

3. KPI CARDS ROW 2 — 4 columns
   Card 5: Expired Hari Ini — "2 item" — orange
   Card 6: Transfer Hari Ini — "8 dokumen" — blue
   Card 7: Receiving Hari Ini — "3 PO" — green  
   Card 8: Waste Hari Ini — "Rp 240rb" — purple

4. MAIN CONTENT GRID — 2 columns (60% / 40%)

   LEFT COLUMN:
   Stock Movement Chart (full width, 280px height)
   - Title: "Pergerakan Stok 7 Hari Terakhir" 
   - Recharts AreaChart with gradient fill
   - Two lines: "Masuk" (green #16A34A) and "Keluar" (red #C8102E)
   - Smooth curve, grid lines very subtle gray
   - X-axis: Sen/Sel/Rab/Kam/Jum/Sab/Min
   - Animate chart draw on mount (left to right)
   - Small legend below chart

   RIGHT COLUMN:
   Alert Feed — "Live Alerts" title with red pulsing dot (LIVE indicator)
   Scrollable list, max 6 visible items, each item:
   - Colored left border (red=critical, amber=warning, blue=info)
   - Icon + title + timestamp
   - Items:
     • 🔴 "Arabica Gayo 1kg — OUT OF STOCK" — 2 mnt lalu
     • 🟡 "Susu UHT Full Cream — Low Stock (2 kg tersisa)" — 5 mnt lalu  
     • 🟠 "Whip Cream 500ml — Expired 3 hari lagi" — 12 mnt lalu
     • 🔴 "Gula Aren — OUT OF STOCK" — 18 mnt lalu
     • 🟡 "Kertas Thermal 80mm — Low Stock" — 24 mnt lalu
     • 🔵 "Transfer TRF-240 menunggu approval" — 31 mnt lalu
   Animate: each item slides in from right with stagger (40ms delay)
   New items flash briefly yellow before settling

5. BOTTOM GRID — 2 columns (50% / 50%)
   
   LEFT: Recent Transactions
   Title: "Transaksi Terbaru"
   Simple list: icon (receive/transfer/waste) | doc number | warehouse | time
   5 rows, alternating subtle bg, hover highlight red-left-border

   RIGHT: Quick Actions
   Title: "Quick Actions" 
   2×2 grid of action cards:
   • 📥 "Scan Barcode" — "Scan produk atau dokumen"
   • 📦 "Tambah Receiving" — "Input penerimaan barang"
   • 🔄 "Buat Transfer" — "Pindah stok antar gudang"
   • 📋 "Stock Opname" — "Hitung fisik stok"
   Each: icon (large, red), title bold, desc small, hover: red bg tint, scale 1.02

ANIMATIONS (all Framer Motion):
- Page load: content fades in, then KPI cards stagger in (each 80ms delay, y: 20→0)
- KPI numbers count up from 0 over 1200ms using spring
- Chart draws from left to right on mount
- Alert items slide in from right with 40ms stagger
- Cards hover: translateY(-2px), box-shadow deepen
- Critical values (4 out-of-stock): continuous subtle pulse animation

STYLE REQUIREMENTS:
- NO decorative elements that don't carry data
- Keep sidebar visible (use a placeholder/preview of it)
- White cards, border #E8E8E8, border-radius 10px
- Font: Inter, JetBrains Mono for numbers/codes
- Make it feel like a Bloomberg terminal met a premium SaaS — fast, dense, trustworthy
```

---

## [02] INVENTORY LIST PAGE
### *Tabel produk dengan search, filter, barcode action*

```
Build the Inventory Management page for GARAGE Warehouse Management System. Next.js React + Framer Motion + Tailwind.

PAGE STRUCTURE:

HEADER AREA:
- Page title: "Inventory" (22px, 700) with subtitle "1,247 item aktif di 3 warehouse"
- Right side: "Tambah Produk" button (red, solid) + "Import Excel" button (outline) + "Print Label" button (outline)

FILTER & SEARCH BAR (sticky, white bg, border-bottom):
- Search input (full text search): "Cari nama produk, SKU, barcode..." with search icon prefix
- Filter pills (clickable toggle):
  • Warehouse: [Semua ▼] [WH-01] [Kitchen] [Bar]
  • Status: [Semua] [In Stock] [Low Stock] [Out of Stock] [Expired]
  • Kategori: [Semua ▼] with dropdown
- Right: "Sort: Nama A-Z ▼" dropdown + column visibility toggle icon
- Active filters show as dismissible chips below

DATA TABLE:
Columns: □ Checkbox | Gambar | SKU | Nama Produk | Kategori | Stok (qty + unit) | Min Stok | Status | HPP | Gudang | Aksi

Table rows (show 8 sample rows):

Row 1: Arabica Gayo Aceh 1kg
  SKU: BVR-COF-0001-A (mono font, red)
  Stok: 0 kg | Status: OUT OF STOCK badge (red, strong)
  Min: 5 kg | HPP: Rp 85.000/kg
  ACTION ROW HIGHLIGHT: red-tinted background, pulsing indicator

Row 2: Susu UHT Full Cream 1L
  SKU: BVR-MLK-0012-C
  Stok: 3 ltr | Status: LOW STOCK (amber)  
  Min: 10 ltr | Stok bar: 30% filled amber

Row 3: Gula Pasir Premium 1kg
  SKU: FNB-DRY-0005-B
  Stok: 28 kg | Status: IN STOCK (green)
  Min: 10 kg | Stok bar: 100% green

Row 4: Whip Cream 500ml
  SKU: BVR-CRM-0008-D
  Stok: 4 pcs | Status: EXPIRING SOON (orange)
  Expired badge: "Exp: 2 Jul 2026" in orange pill

Row 5: Cup 16oz Paper
  SKU: PKG-CUP-0003-A
  Stok: 2,400 pcs | Status: IN STOCK
  Min: 500 pcs

Row 6: Sirup Hazelnut Torani 750ml
  SKU: BVR-SYP-0019-E
  Stok: 12 btl | Status: IN STOCK

Row 7: Kertas Thermal Roll 80mm
  SKU: PKG-STN-0002-B
  Stok: 2 roll | Status: LOW STOCK (amber)

Row 8: Es Batu Kristal 10kg
  SKU: BVR-ICE-0001-A
  Stok: 0 pcs | Status: OUT OF STOCK (red)

STOK VISUALIZATION per row:
- Mini horizontal bar (80px wide) showing stok vs min_stok
- Color: green if >min, amber if ≤min, red if 0
- Tooltip on hover: "28 kg / min 10 kg (280%)"

ACTION COLUMN per row (appear on hover):
- 🔍 View detail
- ✏️ Edit
- 🏷️ Print label (open print modal)
- 📊 History (movement log)
Icons only, tooltip on hover, smooth opacity reveal

BULK ACTION BAR (appear when rows checked, slide up from bottom):
Floating bar: "3 item dipilih" | Print Labels | Export | Update Min Stok | ✕ Batal

PAGINATION:
"Menampilkan 1–20 dari 1,247 item" | ← 1 2 3 ... 62 →
Rows per page: 20 / 50 / 100

ANIMATIONS:
- Table rows: stagger fade-in on load (each row 35ms delay, opacity + x: -5→0)  
- Filter change: rows fade out, new rows fade in
- Bulk action bar: slides up from bottom (y: 60→0) when selection happens
- Row hover: subtle left red border appears, bg lightens to red-10
- OUT OF STOCK rows: constant very subtle red-tinted bg pulse
- Sorting: rows shuffle with layout animation

EMPTY STATE (when search has no results):
Center: illustration (box with magnifying glass), title "Produk tidak ditemukan", subtitle "Coba kata kunci lain atau hapus filter aktif", button "Reset Filter"
```

---

## [03] BARCODE SCANNER PAGE
### *Halaman scan — harus terasa seperti native app*

```
Build the Barcode Scanner page for GARAGE WMS — a full-screen, mobile-friendly scanning interface. This is the page staff use most on the warehouse floor.

LAYOUT: Full viewport height, dark theme (#1a1a1a background), feels like a native camera app.

SECTIONS:

TOP BAR (dark, 56px):
- Back arrow | "Scan Barcode" title (white) | Settings gear icon
- Scan mode switcher: [SKU] [Barcode] [QR Code] — pill tabs, selected=red

SCANNER VIEWPORT (center, takes 50% of screen height):
- Camera feed area (simulate with dark rectangle, rounded-xl)
- Corner brackets: sharp L-shaped corners in garage-red (#C8102E), 28px each
- Animated scan line: red horizontal line, glows (#C8102E with blur shadow), bounces top-to-bottom continuously
  • Animation: top 15% → bottom 85%, duration 2s, ease-in-out, infinite
  • Add subtle red glow/shadow on the line
- Semi-transparent dark overlay outside the scan zone
- Label below camera: "Arahkan kamera ke barcode produk" (white, 13px, centered)

SCAN HISTORY (below scanner):
Title: "Hasil Scan Terakhir" with clear button
Scrollable list of recently scanned items:

Item 1 (most recent, highlighted):
  Left: green checkmark circle icon
  Center: "BVR-COF-0001-A" (mono bold red) | "Arabica Gayo 1kg"
  Right: Stok badge "0 kg — OUT OF STOCK" (red) | timestamp "09:41"
  Full row has subtle green-left-border and green-tinted bg

Item 2:
  "BVR-MLK-0012-C" | "Susu UHT Full Cream" | "3 ltr — LOW STOCK" (amber) | 09:38

Item 3:
  "PKG-CUP-0003-A" | "Cup 16oz Paper" | "2,400 pcs — OK" (green) | 09:35

SCAN RESULT MODAL (show in triggered/open state):
Full bottom sheet (slides up from bottom), white bg, rounded-t-2xl
  - Drag handle pill at top
  - Product image (60×60px placeholder) + SKU (mono, red) + Product name (bold, 18px)
  - Status badge (big, 36px text): "⚠️ LOW STOCK — 3 ltr tersisa"
  - Info grid (2×2): Gudang | Batch | Expired | HPP
  - Batch list (FEFO order): each batch shows batch# + qty + expired date + age
  - ACTION BUTTONS (full width):
    • "Tambah Receiving" (red, primary)
    • "Lihat Detail Inventory" (outline)  
    • "Buat Transfer" (outline)
    • "Catat Waste" (ghost, text-red)
  - Bottom: "Scan berikutnya" link (blue)

MANUAL INPUT SECTION (collapsible, at bottom):
Accordion: "Input Manual SKU atau Barcode"
When open: text input with keyboard + search button + recent suggestions

SUCCESS STATE ANIMATION (show as overlay):
When scan succeeds:
  1. Screen flashes green briefly (rgba(22,163,74,0.2) overlay, 100ms)
  2. Large green checkmark scales in from 0 (spring animation)
  3. Haptic-style visual feedback (brief border glow)
  4. Bottom sheet slides up
  
ERROR STATE:
  1. Red flash overlay briefly
  2. "Barcode tidak dikenali" toast slides in from top
  3. Scanner resets automatically after 1.5s

STYLE:
- Dark theme throughout (except result bottom sheet which is white)
- Scan line: filter: drop-shadow(0 0 6px #C8102E)
- Camera area: border: 2px solid rgba(255,255,255,0.1)
- History items: dark cards (#2a2a2a), hover lighten
- Font: Inter white on dark, JetBrains Mono for SKU/barcode values
- Make this feel premium — like a professional scanner app, not a web form
```

---

## [04] PRODUCT DETAIL PAGE
### *Detail produk + batch list + movement history*

```
Build the Product Detail page for GARAGE WMS. Desktop-first, information-dense but well-organized.

URL: /inventory/BVR-COF-0001-A

PAGE HEADER:
Back link "← Inventory" | breadcrumb
Title row: Product image (80px square, rounded-xl) + "Arabica Gayo Aceh 1kg" (h1, 24px, bold) + SKU: "BVR-COF-0001-A" (mono red pill) + Status badge "OUT OF STOCK" (red, large) + Edit button + Print Label button

TABS (sticky below header): [Overview] [Batch & Lokasi] [History] [Barcode & Label]

TAB 1 — OVERVIEW:
Left column (60%):
  Info card: grid of key details
    • Kategori: Beverage / Coffee
    • Unit: Kilogram (kg)
    • Kode Barcode: 8990123456789 (mono) + mini barcode preview
    • HPP Rata-rata: Rp 85.000 / kg
    • Metode Cost: Weighted Average
    • Perishable: Ya (track batch & expired)
    • Min Stok: 5 kg | Max Stok: 50 kg | Reorder Point: 8 kg
    • Supplier Utama: PT Kopi Nusantara Premium

  Stock per Warehouse (card):
    Table: Gudang | Qty | Unit | Min | Status | % dari Min
    Row 1: WH-01 Gudang Utama | 0 kg | 5 kg | OUT OF STOCK | 0%
    Row 2: Kitchen-01 | 0.3 kg | 1 kg | LOW STOCK | 30%
    Each row has colored status indicator

Right column (40%):
  30-day movement sparkline chart (Recharts LineChart, tiny, 120px height)
  Title: "Pergerakan 30 Hari"
  
  Cost history card: HPP trend mini chart

  Quick stats:
    • Total terjual bulan ini: 42 kg
    • Rata-rata harian: 1.4 kg/hari
    • Terakhir masuk: 18 Jun 2026
    • Terakhir keluar: 29 Jun 2026 09:15

TAB 2 — BATCH & LOKASI:
Title: "3 Batch Aktif" (green dot) + "Filter" button

Batch cards (3 cards):
  
  Card 1 — ACTIVE:
  Batch: BTH-2026-0089 | Supplier: PT Kopi Nusantara | Tgl masuk: 15 Jun 2026
  Qty: 0 kg (depleted indicator) | HPP: Rp 83.000/kg
  Expired: 30 Nov 2026 | "185 hari lagi"
  Lokasi: WH-01 — Rak A3
  Status pill: DEPLETED (gray)
  
  Card 2 — EXPIRING SOON (amber border, amber tinted bg):
  Batch: BTH-2026-0112 | Qty: 0.3 kg | Expired: 3 Jul 2026
  "⚠️ 4 HARI LAGI — Prioritas FEFO"
  
  Card 3 — ACTIVE:
  Qty: 0 kg | Expired: 15 Jan 2027

TAB 3 — HISTORY:
Timeline style movement log:
  Filter: [Semua] [Receiving] [Transfer] [Waste] [Adjustment] | Date range picker

Timeline items:
  29 Jun 2026, 09:15 — KELUAR — Transfer ke Kitchen
    "TRF-20260629-008 · -0.5 kg · Disetujui: Budi Manager"
    Stok: 2.5 kg → 2.0 kg
    
  28 Jun 2026, 16:30 — MASUK — Receiving dari supplier
    "RCV-20260628-003 · +5 kg · Harga: Rp 83.000/kg"
    Stok: 0 kg → 5 kg
    
  27 Jun 2026, 11:00 — KELUAR — Waste
    "WST-20260627-011 · -0.3 kg · Spoilage · By: Rina Staff"

Each timeline item: left colored dot + connector line, right card with details

TAB 4 — BARCODE & LABEL:
Three sections side by side:

Section 1 — Code 128 (SKU):
  Large barcode render (bwip-js Code128)
  Value: BVR-COF-0001-A
  Size selector: S / M / L
  Download PNG button

Section 2 — QR Code:
  QR code (contains JSON: sku, name, warehouse, batch info)
  Size: 180×180px
  Download button

Section 3 — Label Preview (A6 print):
  Scaled preview of print label:
    [GARAGE logo] [SKU: BVR-COF-0001-A]
    [BARCODE]
    Arabica Gayo Aceh 1kg
    HPP: Rp 85.000/kg
    Batch: BTH-2026-0112
    Expired: 03/07/2026
    WH-01 — RAK A3
  Print Label button (red, full width)

ANIMATIONS:
- Tab switch: content fades + slides (opacity + y: 8→0), 250ms
- Batch cards: stagger reveal on tab open
- Timeline items: stagger from top, 40ms apart
- Barcode render: fade in after "rendering" animation (200ms)
- Page enter: header info slides in, then content section
- Stats counter: count up on first load
```

---

## [05] RECEIVING PAGE
### *Alur penerimaan barang — form + scan workflow*

```
Build the Receiving (Penerimaan Barang) page for GARAGE WMS. This is a workflow/form hybrid page.

TWO STATES TO SHOW — show state 2 as primary:

STATE 1 — LIST VIEW (show as smaller secondary section or tab):
"Daftar Receiving" with table:
Columns: Doc Number | Tanggal | Supplier | Item | Total Nilai | Status | Aksi
3 sample rows:
  RCV-20260629-003 | Hari ini 09:30 | PT Kopi Nusantara | 5 item | Rp 4.250.000 | DRAFT (amber) | Lanjutkan
  RCV-20260628-008 | Kemarin | CV Dairy Fresh | 3 item | Rp 1.800.000 | COMPLETED (green) | Lihat
  RCV-20260627-002 | 27 Jun | PT Packaging Indo | 8 item | Rp 920.000 | COMPLETED (green) | Lihat
+ "Buat Receiving Baru" button (red)

STATE 2 — ACTIVE RECEIVING FORM (main focus):
Document header bar (white, border-bottom):
  Left: "RCV-20260629-003" (mono, gray) | Status: "DRAFT" amber badge | "Barcode: scan PO" icon button
  Center: Supplier: "PT Kopi Nusantara Premium" | Warehouse: "WH-01 Gudang Utama"
  Right: "Simpan Draft" (outline) | "Selesaikan" (red) | "Batalkan" (ghost red)

PROGRESS STEPPER (horizontal, 5 steps):
[1 Supplier ✓] — [2 Item & Qty ●ACTIVE] — [3 QC Check] — [4 Batch & Expired] — [5 Put Away]
Active step: red filled circle, completed: green checkmark, upcoming: gray outline

ACTIVE STEP 2 — ITEM & QTY:
  Instruction text: "Scan barcode produk atau cari manual, lalu input quantity yang diterima"

  ADD ITEM BAR:
    [ 🔍 Scan / Cari produk... ] + [+ Tambah] button
    Below: "atau scan barcode dengan kamera" — camera icon button (opens scan overlay)

  ITEM TABLE (items already added):
  
  Item 1: Arabica Gayo 1kg
    SKU: BVR-COF-0001-A (mono red) | Pesan: 10 kg | Diterima: [10 ▼] kg | HPP: [85000] | Subtotal: Rp 850.000
    QC: [✓ PASS ▼] | Kondisi: [Normal ▼]
    Expand arrow → shows batch input fields

    EXPANDED (batch section for item 1):
    Batch Number: [BTH-2026-0142 ] (auto-generated, editable)
    Tanggal Expired: [30 / Nov / 2026 📅]
    Tanggal Produksi: [—]
    Lokasi Put Away: [WH-01 — Rak A3 ▼]
    → Print Label after save? [✓ Cetak otomatis]

  Item 2: Susu UHT Full Cream 1L
    Pesan: 24 ltr | Diterima: [20 ▼] ltr | ⚠️ Discrepancy flag (amber)
    Discrepancy note appears: "Qty diterima (20) ≠ qty pesan (24) — Catat alasan: [...]"

  Item 3: Gula Pasir Premium
    Pesan: 15 kg | Diterima: [15 ▼] kg | QC: [✗ REJECT ▼] (red)
    Reject reason field appears: [Kondisi rusak/basah ▼]
    Return to supplier? [✓]

  TOTALS CARD (right side, sticky):
    Total Item: 3 jenis
    Total Qty: 10 kg + 20 ltr + 15 kg
    Total Nilai: Rp 5.370.000
    QC Summary: 1 Pass ✓ | 1 Discrepancy ⚠️ | 1 Reject ✗
    [Lanjut ke QC Check →] button (red, full width)

BOTTOM: auto-save indicator "Tersimpan otomatis 09:41 ✓"

ANIMATIONS:
- Item rows: slide in from top when added (height 0→auto + fade)
- Expanded batch section: accordion expand with spring
- Discrepancy alert: slides down from item row with amber shake effect
- Step progress: animated fill left-to-right when step completes
- Totals: numbers update live with brief yellow flash on change
- Delete item: slide out to left + collapse height
- Camera scan overlay: slides up from bottom (full overlay)
```

---

## [06] LAPORAN — STOCK MOVEMENT
### *Laporan profesional dengan chart dan export*

```
Build the Stock Movement Report page for GARAGE WMS. Clean, data-dense, export-ready.

PAGE LAYOUT:

REPORT HEADER:
Left: "Stock Movement Report" (h1, bold)
Subtitle: "Laporan pergerakan stok semua produk"
Right: "Export Excel" button (green outline, xlsx icon) | "Export PDF" button (red outline, pdf icon) | Print icon

FILTER BAR (white card, rounded-xl, padding):
Row 1: 
  Date range: [01 Jun 2026 📅] sampai [29 Jun 2026 📅] | Quick: [7 Hari] [30 Hari] [Bulan Ini] [Custom]
  Warehouse: [Semua Warehouse ▼]
  Kategori: [Semua Kategori ▼]
  Movement Type: [Semua] [Receiving] [Transfer] [Waste] [Adjustment] [Production]
  [🔍 Terapkan Filter] button (red)

SUMMARY CARDS (4 cards, after filter applied):
  Total Masuk: +1,247 unit | Rp 284,7jt (green arrow up)
  Total Keluar: -892 unit | Rp 198,3jt (red arrow down)
  Net Movement: +355 unit | Rp 86,4jt
  Total Transaksi: 234 dokumen

CHART SECTION (white card):
  Title: "Trend Pergerakan Stok" + period label
  Recharts BarChart: grouped bars per date (last 30 days, x-axis = tanggal)
  Bar 1 (green): Masuk | Bar 2 (red): Keluar
  Tooltip: hover shows detailed breakdown
  Chart height: 220px
  Below chart: toggle [Per Hari] [Per Minggu] [Per Bulan]

MOVEMENT TABLE:
Headers: Tanggal | Waktu | Dokumen | Tipe | Produk | SKU | Dari → Ke | Qty | Unit | Nilai | User

Sample rows (show 10):
  29/06 | 09:41 | TRF-20260629-008 | TRANSFER OUT | Arabica Gayo | BVR-COF-0001-A | WH-01 → Kitchen | -0.5 | kg | Rp 42.500 | Budi M.
  
  29/06 | 09:30 | RCV-20260629-003 | RECEIVING | Susu UHT 1L | BVR-MLK-0012-C | — → WH-01 | +20 | ltr | Rp 280.000 | Rina S.
  
  28/06 | 16:45 | WST-20260628-011 | WASTE | Whip Cream | BVR-CRM-0008-D | WH-01 → — | -0.2 | kg | Rp 24.000 | Deni S.
  
  27/06 | 11:00 | ADJ-20260627-004 | ADJUSTMENT+ | Gula Pasir | FNB-DRY-0005-B | WH-01 | +1.5 | kg | Rp 22.500 | Budi M.

Color coding:
  RECEIVING: green left border, qty in green
  TRANSFER OUT: blue left border
  WASTE: red left border, qty in red
  ADJUSTMENT+: green | ADJUSTMENT-: amber

Movement type badges: color-coded pills matching the above colors

DOCUMENT LINK: click doc number → opens detail modal

PAGINATION + ROW COUNT:
"Menampilkan 1-20 dari 234 transaksi" | ← 1 2 3 ... 12 →

DETAIL MODAL (when clicking doc number):
Slide-in right panel (40% width, overlay left dimmed):
  Document header: TRF-20260629-008 | TRANSFER | COMPLETED ✓
  From → To: WH-01 Gudang Utama → Kitchen-01
  Requested by: Staff Gudang (Rina Setiawati)
  Approved by: Budi Santoso (Manager) — 09:35
  
  Item table: 3 items transferred
  Timeline: [Requested 09:31] → [Approved 09:35] → [Picked 09:39] → [Received 09:41]
  
  Action: "Cetak Dokumen" | "Lihat di Transfer" | Close ✕

ANIMATIONS:
- Filter apply: table rows fade + shimmer loading → new rows fade in
- Chart: bars grow from bottom on load
- Summary numbers: count up animation
- Table row hover: left border appears, background subtle tint
- Detail panel: slides in from right (x: 40→0, opacity: 0→1)
- Export button: brief loading spinner then "Berhasil diunduh ✓" state
```

---

## [07] SUPPLIER MANAGEMENT
### *Master data supplier dengan performance metrics*

```
Build the Supplier Management page for GARAGE WMS.

LAYOUT: Split — left sidebar list (35%) | right detail panel (65%)

LEFT SIDEBAR — SUPPLIER LIST:
Search: "Cari supplier..." 
Filter: [Semua] [Aktif] [Nonaktif] | Sort: [Rating ▼]
"+ Tambah Supplier" button (red, full width)

Supplier cards (list):
  
  Card 1 (SELECTED — highlighted red border):
    Logo placeholder (2 letters: KN) | "PT Kopi Nusantara Premium"
    ⭐⭐⭐⭐⭐ 4.8 | 12 produk | Active green dot
    "Terakhir supply: 3 hari lalu"

  Card 2:
    CV | "CV Dairy Fresh Indonesia"
    ⭐⭐⭐⭐ 4.2 | 5 produk | Active
    "Terakhir: 1 minggu lalu"

  Card 3:
    PT | "PT Packaging Indo Makmur"
    ⭐⭐⭐ 3.7 | 8 produk | Active
    "Terakhir: 5 hari lalu"

  Card 4 (INACTIVE — grayed):
    CV | "CV Sirup Jaya"
    ⭐⭐⭐ 3.1 | 3 produk | ⚫ Nonaktif

RIGHT DETAIL PANEL — PT KOPI NUSANTARA PREMIUM:

SUPPLIER HEADER:
  Large logo circle (KN, gradient red-dark) | "PT Kopi Nusantara Premium"
  Supplier code: SUP-0001 (mono)
  Status: Active (green) | Rating: ⭐ 4.8/5.0 (15 transaksi)
  Edit button | Nonaktifkan button

TABS: [Profil] [Produk] [Performance] [Riwayat]

TAB — PROFIL:
  Two columns info grid:
    Kontak PIC: Ahmad Fauzi | +62 811-2345-6789 | ahmad@kopinusantara.com
    Alamat: Jl. Kopi Raya No. 45, Medan, Sumatra Utara
    NPWP: 01.234.567.8-901.000
    
    Bank: Bank BCA | 1234-5678-90 | PT Kopi Nusantara Premium
    Payment Terms: Net 30 hari
    Lead Time: 2–3 hari kerja
    Min Order: Rp 500.000

TAB — PRODUK (show as active):
  List of products supplied:
  Grid of product chips: each shows product image + name + price + "Update Harga" link
  Products: Arabica Gayo 1kg (Rp 83.000/kg) | Robusta Lampung 1kg | Cascara Tea | Kopi Decaf

TAB — PERFORMANCE:
  Performance scorecard (4 KPI cards):
    On-time Delivery: 92% (green) — target: >90%
    Quality Pass Rate: 97.3% (green) — target: >95%  
    Avg Lead Time: 2.1 hari (green) — target: <3 hari
    Order Accuracy: 98.5% (green)
  
  Chart: Recharts LineChart showing performance trend 6 bulan (3 metrics)
  
  Recent issues log (if any): none for this supplier — show "Tidak ada catatan masalah ✓" in green

TAB — RIWAYAT:
  Table: receiving history with this supplier
  Doc# | Tanggal | Item | Total | Status | Rating given

ANIMATIONS:
- Sidebar card selection: red border slides in, detail panel cross-fades
- Tab switch: slide content
- Performance bars: animate fill on tab open
- Chart: draw animation
- Star rating: stars fill one by one on load (100ms each)
```

---

## [08] STOCK OPNAME PAGE
### *Physical counting workflow*

```
Build the Stock Opname (Physical Count) workflow page for GARAGE WMS.

SHOW TWO PANELS: Session Overview (left 35%) | Count Sheet (right 65%)

LEFT — OPNAME SESSION PANEL:
Current Session Card (red accent border):
  "SOP-20260629-001"
  Status: IN PROGRESS (blue pulsing dot)
  Warehouse: WH-01 Gudang Utama
  Mulai: 29 Jun 2026, 08:00
  Tim: Rina + Deni + Ahmad (avatars)
  
  Progress bar (animated): 
    47 / 120 item counted (39%)
    Red fill progress bar, smooth animation
    
  Variance summary (updates live):
    Sesuai: 38 item (green)
    Lebih: 4 item (blue, +)
    Kurang: 5 item (amber, -)
    Belum dihitung: 73 item (gray)

  Actions:
    "Pause Session" | "Selesaikan & Review" (red, disabled until 100%)

Previous Sessions (compact list):
  SOP-20260601-001 | 01 Jun | 120 item | Variance: -2.3% | APPROVED ✓
  SOP-20260501-001 | 01 Mei | 115 item | Variance: -1.1% | APPROVED ✓

RIGHT — COUNT SHEET:
Search + filter: [Semua] [Belum] [Sesuai] [Variance]
Sort: By location (rack order, for physical efficiency)

TABLE COLUMNS: 
Lokasi (Rack) | Produk | SKU | Expected Qty | Actual Qty (INPUT) | Variance | Status

ROW TYPES:

Row 1 — BELUM DIHITUNG (default, white):
  RAK A1 | Arabica Gayo 1kg | BVR-COF-0001-A | 5.5 kg | [____] | — | ○ Belum

Row 2 — SESUAI (light green bg):
  RAK A1 | Susu UHT 1L | BVR-MLK-0012-C | 20 ltr | 20 ✓ | 0 | ✓ Sesuai

Row 3 — VARIANCE LEBIH (light blue bg):
  RAK A2 | Gula Pasir 1kg | FNB-DRY-0005-B | 28 kg | 29.5 | +1.5 kg (+5.4%) | ↑ Lebih
  Note field appears: "Sisa dari receiving sebelumnya"

Row 4 — VARIANCE KURANG (light amber bg):
  RAK A2 | Sirup Hazelnut | BVR-SYP-0019-E | 12 btl | 10 | -2 btl (-16.7%) | ↓ Kurang ⚠️
  Flag: "Variance > 10% — perlu keterangan:"
  Note input: [Kemungkinan dipakai tanpa tercatat...]

Row 5 — IN PROGRESS (user typing):
  RAK A3 | Whip Cream 500ml | BVR-CRM-0008-D | 4 pcs | [3| ] (cursor) | — | ✏️ Input

BATCH SCAN MODE TOGGLE:
Toggle "Mode Scan" — when ON:
  Show camera icon button per row
  Click → opens scan overlay, scan fills Actual Qty automatically
  Row briefly highlights green on successful scan

REVIEW MODAL (after clicking Selesaikan):
Full-screen overlay, summary view:
  "Review Hasil Opname SOP-20260629-001"
  
  Summary table: only rows WITH variance
  Total adjustment value: Rp 89.500 (net)
  
  Variance breakdown:
    5 item lebih (+Rp 128.000)
    8 item kurang (-Rp 217.500)
    Net: -Rp 89.500
  
  Item needing notes (highlight amber): 3 item tanpa keterangan
  
  Buttons: "Kembali & Lengkapi" | "Submit untuk Approval" (red)

ANIMATIONS:
- Row input: on focus, row lifts slightly, border turns red
- On value entered: variance calc animates (number morphs)
- Variance color: bg color transitions smoothly (green/amber/blue)
- Progress bar: smooth fill animation as rows counted
- "Sesuai" rows: brief green flash on confirmation
- Scan mode: toggle animation, camera button slide in per row
```

---

## [BONUS] TOAST & NOTIFICATION SYSTEM

```
Build a complete notification system for GARAGE WMS — toasts, alerts, and notification center.

TOAST VARIANTS (show all, stacked in top-right):

1. SUCCESS TOAST:
  Green left bar | ✓ icon (animated checkmark draw)
  Title: "Transfer Berhasil"
  Message: "TRF-20260629-008 · 3 item ke Kitchen-01"
  Timestamp: "Baru saja"
  Auto-dismiss: 4s with progress bar at bottom
  Dismiss × button

2. WARNING TOAST:
  Amber | ⚠️
  Title: "Low Stock Alert"
  Message: "Susu UHT Full Cream — tersisa 3 ltr (min: 10 ltr)"
  Action button: "Lihat Inventory →"
  Auto-dismiss: 6s

3. ERROR TOAST:
  Red | ✗
  Title: "OUT OF STOCK"
  Message: "Arabica Gayo 1kg sudah habis di WH-01"
  Action: "Buat Receiving" | "Dismiss"
  Shake animation on entry

4. INFO TOAST:
  Blue | ℹ
  Title: "Transfer Menunggu Approval"
  Message: "TRF-20260629-009 dari Rina Setiawati"
  Action: "Approve Sekarang →"

NOTIFICATION CENTER PANEL:
Slide in from top-right (320px wide), triggered by bell icon
  Header: "Notifikasi" | "Tandai semua dibaca" link | ✕
  
  Today section:
    [RED] ● Out of Stock: Arabica Gayo 1kg — 09:41 (UNREAD, bold)
    [AMBER] ● Low Stock: Susu UHT (3 ltr) — 09:38 (UNREAD)
    [BLUE] ● Transfer TRF-240 menunggu approval Anda — 09:15 (UNREAD)
    [GREEN] ● Receiving RCV-003 selesai — 08:30 (READ, lighter)
    
  Yesterday:
    [ORANGE] ● Expiry Alert: Whip Cream 500ml (2 hari lagi) — 17:00 (READ)
  
  Bell icon in header: badge count (3) in red circle, pulsing

SCAN SUCCESS OVERLAY:
Full-screen brief flash for barcode scan success:
  0ms: screen edge flash green
  100ms: large animated checkmark scales in (0.3→1, spring)
  200ms: product info card slides up from bottom
  2000ms: auto-dismiss
  
ANIMATIONS:
  Toasts: slide in from right (x: 40→0), spring physics
  Stack: each new toast pushes others down with layout animation
  Dismiss: slide out to right + fade + collapse height smoothly
  Progress bar: linear fill over N seconds
  Bell badge: pop animation (scale 0→1.3→1) when new notification
  Notification panel: y: -20→0 + fade, content stagger-reveals
```

---

> **Tips Pengerjaan di Claude Design:**
> - Kerjakan urut dari [00] → [01] → [02] → dst
> - Setelah [00] selesai, upload hasilnya sebagai konteks sebelum prompt berikutnya
> - Selalu tambahkan: *"Gunakan design tokens dari design system yang sudah dibuat sebelumnya"*
> - Untuk konsistensi: simpan warna, font, radius sebagai CSS variables di `:root`

---

*GARAGE WMS Prompt Suite v1.0 · Juni 2026 · Surya / GARAGE Coffee & Motor*
