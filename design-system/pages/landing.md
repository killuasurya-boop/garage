# Landing Page (Website Publik) — Page Rules

> Override MASTER.md untuk halaman publik `/` ([src/app/page.tsx](../../src/app/page.tsx) → [garage-website.tsx](../../src/components/garage-website/garage-website.tsx)).
> MASTER section 1 menyatakan app ini "internal, bukan website" — **dokumen ini adalah pengecualian resmi**: sejak 2026-06 ada landing page publik untuk pelanggan (menu digital, cek meja, reservasi WA, membership, event). Aturan landing di sini menang atas larangan hero/landing di MASTER.

---

## 1. Tujuan halaman

Untuk **pelanggan**, bukan operator. Prioritas konten (urutan kepentingan):
1. Menu & harga
2. Cek meja kosong / status live (pembeda utama)
3. Lokasi, jam buka, cara pesan (order digital + WA)
4. Sekunder: cerita brand, event, membership, testimoni, galeri

## 2. Visual — tetap ikut palet Garage

- Black asphalt + chrome/silver + red accent + amber. **Tidak** ada hijau/biru SaaS generik.
- Font: Anton (display), Space Grotesk (body), JetBrains Mono (label/angka).
- Boleh pakai pola landing yang dilarang di app internal: hero besar, loader sinematik, mega-menu, parallax ringan — **selama** lulus policy motion CLAUDE.md (`prefers-reduced-motion` wajib, ringan untuk HP).

## 3. Aturan gambar (PENTING)

- **Hanya aset ber-brand GARAGE.** JANGAN pakai foto referensi yang memuat brand lain (mis. folder `I:\My Drive\GR DESIGN\POST` punya jpg ber-brand "COLIN'S", "KOKEU SAYA", "minumkopi." — DILARANG tampil di situs).
- Sumber aman: poster produk seri Garage (`Sanger.png`, `Burger Garage.png`, `Taro Milk.png`, dst — background dark, logo Garage).
- **Format wajib WebP** (atau SVG untuk vektor) demi ringan & responsif. Konversi via `sharp`:
  - resize lebar maks ~900px untuk tile grid, `quality: 78–80`.
  - Output ke `public/garage-website/showcase/` (atau subffolder fungsional).
- `next/image` dengan `fill` + `sizes` + `loading="lazy"` untuk gambar non-hero. Hero boleh `preload`/`priority`.
- Selalu beri overlay gradient gelap di bawah gambar bila ada teks di atasnya (readability).
- Gambar dekoratif: `alt` deskriptif; murni hiasan: `aria-hidden`.

### Lokasi gambar yang sudah dipakai
- **Atmosphere** (`#atmosphere`, eyebrow "03 / Signature") → grid 6 poster produk dari `public/garage-website/showcase/*.webp`. Tile tengah bisa di-override foto hero editable (`landingHero`).
- **MenuGallery** (`#galeri`) → dinamis dari foto produk DB (`/api/customer/menu`), tampil hanya bila ≥3 foto.
- **JANGAN** taruh gambar baru di header/nav (permintaan owner).

## 4. Ikon

- **SVG lucide-react saja** — JANGAN emoji/karakter unicode sebagai ikon (anti-pattern MASTER 5.1). Mega-menu kategori sudah pakai lucide (`Coffee`, `Sparkles`, `Snowflake`, `UtensilsCrossed`, `Sandwich`, `Cookie`).

## 5. Tipografi & angka

- Body ≥ 14px desktop / ≥ 16px mobile. Paragraf konten gunakan `--fg-dim` (jangan `--fg-mute` untuk body panjang).
- Label mono uppercase (`.mono`, eyebrow) boleh 10–11px — pengecualian micro-label yang disengaja.
- Semua angka harga/jumlah/jam: `font-variant-numeric: tabular-nums` (sudah di `.mono` global + harga MenuRow).
- Harga format `RP {n}K`; unit "RP"/"K" pakai mono kecil tapi ≥10px dengan warna `--fg-dim`.

## 6. Hutang teknis diketahui (TODO)

- `garage-website.tsx` masih `@ts-nocheck` + `eslint-disable` (file ~6.3k baris). Rencana: pecah per-seksi & lepas `@ts-nocheck` bertahap. **Jangan** lepas sekaligus (akan memunculkan ratusan implicit-any).
- Konten agak padat/duplikatif: 3 blok produk (`Menu` + `FeaturedMenu` + `PromoProducts`), 2 testimoni (`Testimonials` + `LiveTestimonials`), 3 blok cerita (`About` + `Atmosphere` + `Experience`). Pertimbangkan konsolidasi — butuh keputusan owner blok mana yang dipertahankan.

## 7. Changelog

- `2026-06-14` — Dibuat. Atmosphere diisi 6 poster produk WebP (ganti placeholder kosong), emoji mega-menu → lucide SVG, tabular-nums untuk harga, artifact loader "DISABLED" → "MEMUAT".
