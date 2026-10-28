# Registri komponen Garage OS (U1 · PRD §24.6)

**Aturan governance (PRD §24.6):** sebelum membuat komponen baru → cek registri ini dan halaman hidup
`/control/design-system` (Owner) → pakai ulang / perluas / baru → tulis varian & keadaan → kontrak aksesibilitas →
uji 1366 / 1024 / 390 → daftarkan di sini. Tidak boleh ada komponen sama dengan gaya berbeda per modul.

## Token semantik (D-02: gelap semua)

Sumber: `src/lib/design-tokens.ts` → CSS `--gos-*` di `src/app/globals.css` (dijaga tes `design-tokens.test.ts`:
teks/status ≥ 4.5:1 dan batas kontrol ≥ 3:1 di **semua** latar, nilai CSS = nilai TS).

| Peran | Token | Catatan |
|---|---|---|
| Latar | `bg.app` → `bg.chrome` → `bg.surface` → `bg.raised` | Dari kanvas ke permukaan paling naik |
| Teks | `text.primary` · `text.secondary` · `text.muted` | `text.muted` = batas terendah untuk teks |
| Status | `status.success/warning/danger/info/neutral` | Selalu dengan ikon + label |
| Kontrol | `control.border` (≥3:1) · `control.focus` (amber) | Tepi input yang harus terlihat |
| Brand | `brand.primary` + `brand.on-primary` | Merah brand = **latar tombol**, bukan warna teks |

## Komponen dasar (`src/components/ds/`)

| Komponen | Kegunaan | Keadaan / aturan |
|---|---|---|
| `StatusPill` | Status operasional (Sesuai, Menunggu, Selisih, …) | 5 tone; ikon + teks wajib; tidak bergantung warna |
| `MoneyText` / `formatRupiah` | Semua angka uang | `Rp` IDR, tabular, `align="right"` di tabel, minus `−` eksplisit, `signed` untuk selisih, `null` → "—" |
| `StateView` | Keadaan layar kritis (§24.8) | loading · empty · filtered · error · offline · success · unauthorized · conflict · stale; `onRetry`, `compact` |
| `DesignSystemGallery` | Registri hidup | `/control/design-system` |

## Komponen yang sudah ada (pakai ulang, jangan duplikasi)

| Lokasi | Komponen |
|---|---|
| `src/components/ui/` (shadcn) | alert, alert-dialog, badge, button, card, dialog, dropdown-menu, input, progress, scroll-area, select, separator, sheet, skeleton, table, tabs, textarea, tooltip |
| `src/components/ceo/layout/` | `Panel`, `PageHeader`, `ControlDashboardRoute` |
| `src/components/ceo/ui/` | `Badge` (tone red/amber/success/chrome/muted/info) |
| `src/components/garage/` | `CashDenominationGrid` (pecahan uang), `pos-close-shift-form` (tutup shift) |
| `src/components/wms/pack-qty.tsx` | `PackQtyInput` / `PackQtyText` (kemasan bertingkat) |
| Member UI | `src/components/garage/member-auth/` — kontrak desain terkunci (CLAUDE.md) |

## Temuan kontras untuk pecahan U1 berikutnya (belum diubah — layar lama tetap sama)

| Pola | Kontras | Ganti dengan |
|---|---|---|
| `text-zinc-500/600` (170× di 34 file) | 3.2–3.9:1 ✗ | `text-[var(--gos-text-muted)]` |
| Teks warna `--garage-red` (41×) | 2.9–3.7:1 ✗ | `text-[var(--gos-status-danger)]` |
| `text-white/30–50` (7×) | < 4.5:1 ✗ | `text-[var(--gos-text-muted)]` |
| Tepi input `--garage-line` | 1.3–1.6:1 ✗ (batas kontrol) | `border-[var(--gos-control-border)]` |
