# Garage Coffee & Motor OS — Design System MASTER

> Source of truth untuk visual & UX rules.
> Generated 2026-06-03 dari skill `ui-ux-pro-max` (v2.5.0) + audit `src/app/globals.css` + `CLAUDE.md` policies.
> Page-specific overrides di `design-system/pages/<page>.md`.

---

## 1. Product Profile

Garage Coffee & Motor OS adalah **internal operational app** (bukan landing/marketing) yang menggabungkan:

| Aspek | Match kategori `ui-ux-pro-max` | Implikasi |
|---|---|---|
| Sektor | **Automotive/Car Dealership** (row 54) | Dark Mode (OLED) + brand colors + metallic accents + action red |
| Cabang lain | **Coffee Shop** (row 67) | Warm brown + cream + warm accents *(sudah → preset `warm-light`)* |
| Workflow POS | **Restaurant/Food Service** (row 36) | Vibrant block-based + warm + menu-led ordering |
| Pattern utama | **Data-Dense Dashboard** + **Real-Time Monitoring** + **Drill-Down Analytics** | Tabel padat, kanban antrian, drilldown approval/audit |

**Decision**: aplikasi ini **app-style internal**, bukan website. Pattern landing/hero tidak dipakai. Pakai **dashboard-first patterns** dengan POS sebagai sub-pattern hybrid.

---

## 2. Core Design Tokens (current — VERIFIED ✓)

Sumber: [src/app/globals.css](src/app/globals.css). Token ini **sudah konsisten** dengan rekomendasi skill (Automotive + Coffee). Pertahankan, jangan tulis ulang.

### 2.1 Color — Garage Default (dark asphalt)

```
asphalt        #100808  → --garage-bg-0      (canvas)
surface        #1a1111  → --garage-bg-1      (sidebar / popover)
panel          #221818  → --garage-bg-2      (cards)
panel-soft     #2e2020  → --garage-bg-3      (raised / secondary)
line           #443434  → --garage-line      (borders default)
line-bright    #5a4040  → --garage-line-2
fg             #f4f4f5  → --garage-fg
fg-dim         #d0d0d6  → --garage-dim       (muted prominent)
fg-mute        #9696a1  → --garage-mute      (muted secondary)
chrome silver  #d4d4d8  → --garage-silver    (chrome wordmark gradient)

red            #c41a1a  → --garage-red       (primary CTA)
red-bright     #e83030  → --garage-red-bright (danger / hover)
red-deep       #7a0f0f  → --garage-red-deep
amber          #e8883a  → --garage-amber     (focus ring / accent / warning)
success        #22c55e
```

### 2.2 Color — POS Light Themes (sudah ada)

| Preset | Use case | CTA |
|---|---|---|
| `garage-default` | Default kasir, full Garage feel | red `#e63946` |
| `garage-clear` | Square/Stripe vibe, terang netral | slate-900 `#0f172a` |
| `warm-light` | Coffee branch — paper aesthetic | espresso `#573320` |
| `focus-blue` | Linear/iPad calm professional | blue `#2563eb` |

### 2.3 Typography (current — VERIFIED ✓)

```
display    Anton          → --font-heading  (uppercase, weight 900)
body       Space Grotesk  → --font-sans     (body weight 600)
mono       JetBrains Mono → --font-mono     (angka, kode, receipts)
```

Skill mencocokkan dengan style **"Brutalist Raw"** + **"Minimal Swiss"**. Anton untuk display = brutalist industrial = **sesuai brief** "garage industrial". JetBrains Mono untuk angka POS/finance = **best practice** (tabular nums).

### 2.4 Spacing & Radius (current)

```
--radius: 0.35rem   (radius lg)
--radius-sm: 0.21rem
--radius-xl: 0.473rem
```

Radius kecil = **konsisten dengan industrial/automotive** (hindari pill/rounded-full untuk surface utama). Pertahankan.

---

## 3. Style Rule Set (per modul)

Map style ke modul operasional:

| Modul | Pattern utama | Style sekunder | Notes |
|---|---|---|---|
| **Dashboard** | Executive Dashboard | Bento Grid | Ringkas, KPI cards 4-6 di atas, chart compact |
| **POS** | Real-Time Monitoring + Hero-Centric | Soft UI Evolution (light themes) | Cart selalu reachable. Tablet-first. Tabular nums untuk harga |
| **Kitchen** | Real-Time Monitoring | Status-driven (kanban) | Big chips, big text, jam masuk visible |
| **Inventory** | Data-Dense Dashboard | Drill-Down | Tabel padat, status low/watch/safe pakai chip warna |
| **Finance** | Financial Dashboard | Data-Dense | Tabular nums wajib, success/danger jelas |
| **CRM** | Drill-Down Analytics | List + Detail | Avatar/inisial, last-visit timestamp visible |
| **Approvals** | Drill-Down (queue) | Action-driven | Tombol Approve/Reject ≥44×44, status warna kuat |
| **Audit** | Data-Dense + Timeline | Read-only | Mono untuk ID/hash, timestamp ISO |

---

## 4. Effects & Motion Policy

Dari skill + CLAUDE.md "Readability, Motion, And Scroll Policy":

| Allowed | Forbidden |
|---|---|
| Fade/slide entry 150–300ms | Parallax |
| Hover lift (`translateY(-1px)`) | Heavy blur (≥20px) di list |
| Active press feedback (90ms) | Infinite decorative motion |
| Selected state glow (red/amber tint) | Layout-shifting scale (`scale(1.05)` di card) |
| Drawer/dialog transition | Auto-rotate carousel di POS |
| `prefers-reduced-motion` respected | Loading spinner tanpa skeleton (long ops) |

Easing standar: `cubic-bezier(0.2, 0.8, 0.2, 1)` (sudah dipakai di POS).

---

## 5. Anti-Patterns — JANGAN dilakukan

### 5.1 General (dari skill)
- ❌ **Emoji sebagai icon** — pakai SVG (lucide-react sudah tersedia).
- ❌ **Hover scale** yang menggeser layout — pakai shadow/border color shift.
- ❌ **Glass card opacity < 50%** di light theme — invisible. Pakai `bg-white/80+` atau solid.
- ❌ **Border `border-white/10`** di light theme — invisible.
- ❌ **Cursor default** di element clickable.
- ❌ **Text < 14px** di body, `<16px` di mobile body.

### 5.2 Domain-spesifik (Automotive + POS)
- ❌ **AI purple/pink gradient** (anti-pattern fintech/banking/automotive).
- ❌ **Soft pastels** di operational screens (Kitchen/POS) — saturated/strong contrast.
- ❌ **Generic SaaS green/blue** untuk primary (CLAUDE.md explicit).
- ❌ **Pill button** untuk Approve di approval queue — boxy/rectangular lebih operational.
- ❌ **Carousel/auto-rotate** di POS menu — cashier butuh static & predictable.

### 5.3 Data-Dense Modules
- ❌ **Sparkline tanpa label angka** di KPI card.
- ❌ **Pie chart > 5 slice** di Finance — pakai bar/stacked bar.
- ❌ **Tabel tanpa sticky header** > 10 baris.
- ❌ **Money/totals dengan font proporsional** — wajib `tabular-nums`.
- ❌ **Color-only status** (e.g. cuma dot hijau/merah) — selalu pasangkan dengan label teks.

---

## 6. Pre-Delivery Checklist (per delivery)

Wajib check sebelum merge. Adopsi dari skill SKILL.md Pre-Delivery Checklist + CLAUDE.md policy.

### Visual Quality
- [ ] Tidak ada emoji sebagai icon (lucide-react SVG saja).
- [ ] Icon set konsisten (semua lucide, jangan campur dengan heroicons).
- [ ] Logo wide pakai `object-contain` dengan backing chrome/white di dark surface.
- [ ] Tabular numbers untuk semua harga, total, qty, stock (`font-variant-numeric: tabular-nums`).

### Readability (CLAUDE.md MANDATORY)
- [ ] Muted text minimal `--garage-dim` (#d0d0d6) di dark; jangan `text-white/40`.
- [ ] Money/totals/item names/customer names/timestamps **tidak terpotong** di card/button/cell.
- [ ] Body ≥ 14px desktop, ≥ 16px mobile.
- [ ] Line-height 1.5–1.75 untuk body, 1.1–1.25 untuk display Anton.

### Interaction
- [ ] Semua clickable punya `cursor-pointer`.
- [ ] Hover feedback: color / shadow / border shift (bukan scale).
- [ ] Transition 150–300ms.
- [ ] Focus ring visible (sudah ada `:focus-visible` outline 2px amber/red).
- [ ] Disabled state jelas (`opacity-60` + `cursor-not-allowed`).

### Touch & Tablet (POS-critical)
- [ ] Touch target ≥ 44×44px untuk POS/Kitchen/Approvals.
- [ ] Button loading state — disabled saat async, label "Memproses…".
- [ ] Error message dekat sumber (inline, jangan top toast saja).

### Layout & Responsive
- [ ] Desktop 1366×900 OK.
- [ ] Mobile 390×844 OK, one-column friendly, no horizontal scroll kecuali table data.
- [ ] Sticky header tidak menutup row pertama.
- [ ] Z-index scale: navbar 10, dropdown 20, drawer 30, dialog 50.

### Motion
- [ ] `@media (prefers-reduced-motion: reduce)` matikan transform & blur.
- [ ] Tidak ada layout-shifting animation.
- [ ] Skeleton untuk loading > 200ms, spinner untuk < 200ms.

### Accessibility
- [ ] Color contrast body ≥ 4.5:1 (verify dark + setiap POS preset).
- [ ] Icon-only button punya `aria-label`.
- [ ] Form input punya `<Label>` ter-link.
- [ ] Keyboard nav: tab order = visual order, semua action reachable.
- [ ] Status bukan hanya warna (chip hijau + teks "Open", chip merah + teks "Low").

### Performance
- [ ] Gambar pakai WebP / Next/Image dengan width-height eksplisit.
- [ ] Lazy load di list panjang (POS menu virtualization untuk > 100 items).
- [ ] Reserve space untuk async content (skeleton dengan dimensi sama).

---

## 7. Per-Module Audit & Action Items

Audit terhadap state saat ini (commit `5258c7f`). **Untuk action items detail, lihat `design-system/pages/<module>.md`** (akan dibuat saat kerja modul tertentu).

### 7.1 Dashboard
- ✅ KPI route fix (commit terbaru).
- ⚠️ Verify: KPI cards punya tabular-nums, label tidak ke-clip di tablet.
- ⚠️ Verify: trend sparkline punya label numeric (jangan visual only).

### 7.2 POS *(prioritas tertinggi — tablet-first)*
- ✅ Multi-theme sudah lengkap (garage-default + 3 light themes).
- ✅ POS polish CSS sudah ada (focus ring, tabular nums, hover lift).
- ⚠️ Verify: cart line tetap reachable di mobile 390px (sheet/drawer pattern?).
- ⚠️ Verify: variant picker (Cold/Hot, Sedang/Pedas, Barbeque/Balado/Campur) — touch target ≥44px.
- ⚠️ Verify: "Bayar" button disabled saat empty cart.

### 7.3 Kitchen
- ⚠️ Verify: status chip + label teks (bukan dot warna saja).
- ⚠️ Verify: jam masuk order visible & mono (tabular alignment).
- ⚠️ Verify: real-time refresh tidak bikin layout shift.

### 7.4 Inventory
- ⚠️ Verify: status `low | watch | safe` pakai chip (red/amber/green) + label teks.
- ⚠️ Verify: search/filter sticky di desktop, tidak menutup row.
- ⚠️ Verify: kolom angka (onHand, min) tabular-nums + right-align.

### 7.5 Finance
- ⚠️ Verify: semua angka rupiah pakai tabular-nums + format `Rp 1.234.567`.
- ⚠️ Verify: success/danger jelas (saldo positif #22c55e, negatif #e83030).
- ⚠️ Verify: chart pakai bar/stacked bar, hindari pie >5 slice.

### 7.6 CRM
- ⚠️ Verify: avatar fallback (inisial) konsisten warna.
- ⚠️ Verify: last-visit timestamp pakai relative + absolute on hover.

### 7.7 Approvals
- ⚠️ Verify: tombol Approve/Reject ≥44×44, warna jelas (red destructive, green success).
- ⚠️ Verify: pending count badge di nav visible & up-to-date.
- ⚠️ Verify: detail panel/dialog tidak menutup queue list.

### 7.8 Audit
- ⚠️ Verify: ID/hash pakai mono.
- ⚠️ Verify: timestamp ISO atau relative dengan tooltip absolute.
- ⚠️ Verify: filter by user/action/date range, sticky.

---

## 8. Stack Implementation Notes

### Next.js App Router
- Server components untuk data fetch (sudah dipakai).
- Lazy-load heavy modules (POS payment dialog, audit table) dengan `next/dynamic`.
- `next/image` wajib untuk QRIS, logo, foto produk (sudah ada `public/payments/qris-garage.png`).

### Tailwind v4 + shadcn/ui
- Pakai token CSS variable (`bg-primary`, `text-foreground`), **jangan hex literal** kecuali di POS theme overrides yang memang dibutuhkan.
- shadcn `data-slot` selectors sudah dimanfaatkan untuk theme remap di POS.

### Font loading
- Wajib `display=swap` (sudah).
- Preload Anton + Space Grotesk subset latin saja (size budget).

---

## 9. How to use this MASTER

1. **Start of feature**: baca section relevan (style rule + anti-pattern + checklist).
2. **Page-specific deviation**: buat `design-system/pages/<page>.md` — rules di sana override MASTER.
3. **PR review**: gunakan Pre-Delivery Checklist (section 6) sebagai gate.
4. **New theme/preset**: tambahkan di section 2.2 dulu sebelum implementasi.

---

## 10. Changelog

- `2026-06-03` — Initial generation dari skill ui-ux-pro-max v2.5.0 + audit globals.css commit `5258c7f`. Tokens & multi-theme POS VERIFIED ✓; audit items per modul = pending verify in-browser.
