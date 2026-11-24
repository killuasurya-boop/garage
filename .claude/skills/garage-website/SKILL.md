---
name: garage-website
description: Alur WAJIB membuat atau merombak website/halaman/komponen web Garage Coffee (homepage, landing, halaman publik seperti /mitra /events /franchise /recruitment /undangan /grand-opening, section baru, atau halaman internal baru). Menggabungkan 4 skill — UI UX Pro Max + Frontend Design (utama), Web Design Guidelines + Vercel React Best Practices (wajib) — dalam satu urutan kerja hemat token, plus aturan brand, SEO, dan QA Garage.
---

# Garage Website — pembuatan website end-to-end

Satu pintu untuk semua pekerjaan website. Skill lain dibuka HANYA pada langkah yang menyebutnya, dan hanya
bagian yang ditunjuk (hemat token). Aturan Garage di bawah selalu menang atas output skill mana pun.

## 0. Aturan Garage yang tidak bisa ditawar
- Brand **Garage Coffee** (bukan "& Motor"). Logo resmi saja, `object-contain`:
  `public/garage-brand/garage-coffee-logo.png` (permukaan gelap), `-logo-dark.png` (kertas/terang),
  `-icon.png` (ikon). Logo sponsor BLACK hanya di `/grand-opening` (di balik age gate 21+), tidak di homepage.
- Visual: permukaan publik (homepage, `/order`, member, `/mitra`) = **Garage Crystal V5**
  (`docs/crystal-v5/01-DESIGN-SYSTEM.md`, token `--gc-*`, komponen `src/components/crystal/`, Montserrat display +
  Inter body). Layar internal/operasional = `design-system/MASTER.md` (asphalt, chrome, merah, amber).
  Tidak ada SaaS hijau/biru generik, blob dekoratif, glassmorphism berat, atau gambar otomotif di UI member.
- Data nyata saja: jam buka, alamat, menu, harga, foto, promo dari DB/`garage-service`. Jangan mengarang
  testimoni, rating, angka, fitur, atau badge. Teks/harga/logo tidak boleh ditanam di dalam gambar.
- Next.js di repo ini punya breaking changes: cek `node_modules/next/dist/docs/` atau context7 sebelum memakai API Next.
- Halaman/route baru: API dengan guard (`KNOWN_ROUTE_GUARDS`) atau terdaftar di `src/lib/public-routes.ts`
  dengan alasan + abuse guard (skill `garage-ops-deploy`). Endpoint publik tidak pernah membuka HPP/kontak internal.
- Motion: muat `garage-motion`. Website boleh sinematik (Cinematic Laser UI di
  `src/components/garage-website/cinematic/`, GSAP 3.15.0), wajib `prefers-reduced-motion`, SFX default OFF.

## 1. Pahami & petakan (sebelum desain)
- Tujuan halaman, audiens (pelanggan / calon mitra / pelamar / staf), satu aksi utama (CTA).
- Cari yang sudah ada dulu (Grep, jangan Read utuh):
  - Homepage: `src/app/page.tsx` → `src/components/garage-website/garage-website.tsx` (+ `.css`),
    section `partner-showcase.tsx`, `gigs-*.tsx`, `grand-opening-banner.tsx`, `cinematic/`.
  - Halaman publik lain di `src/app/<route>/`; referensi visual di `docs/design-references/<nama>/`.
  - Komponen: `src/components/crystal/`, `src/components/ds/` (`StatusPill`, `MoneyText`, `StateView`), shadcn
    (`components.json` style `radix-nova`; cari registry shadcn dulu sebelum menulis komponen baru).
- Fitur yang menyentuh modul (menu/order → `garage-meja-menu` + `garage-menu-v5`, member → `garage-member-cx`,
  mitra → `garage-partner-hub`): muat skill modul itu.

## 2. Arah desain — UTAMA: UI UX Pro Max + Frontend Design
1. Design system dari UI UX Pro Max (satu perintah, baca ringkasannya saja):
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<jenis halaman> coffee shop <kata kunci>" --design-system -p "Garage Coffee"
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<topik>" --stack nextjs   # bila perlu pola implementasi
   ```
   Ambil pola layout, hierarki, CTA, anti-pattern. **Abaikan** palet/font yang bertentangan dengan Crystal V5/MASTER.
2. Frontend Design (`.claude/skills/frontend-design/SKILL.md`): tetapkan satu ide visual yang khas Garage
   (asphalt + chrome + laser merah, tipografi tegas, komposisi berani tapi rapi) supaya tidak terlihat "AI generik".
   Bukan rebrand.
3. Tulis arah singkat (5–8 baris): tujuan, struktur section, CTA, token yang dipakai, motion, deviasi dari sistem
   (bila ada → sebutkan ke Owner SEBELUM membangun).

## 2b. Anti AI slop — WAJIB untuk homepage & landing publik (`design-taste-frontend`)
- Muat skill `design-taste-frontend` (Taste Skill, repo GitHub anti-slop berbintang terbanyak, Nov 2026), tapi
  baca **`GARAGE.md`-nya dulu**: yang diambil = tells AI slop (`references/copy-tells.md`), satu section per layar,
  micro-interaction; yang diganti = palet/font (tetap Crystal V5), foto stand-in (hanya foto asli), kontak palsu
  (data nyata). Aturan bagian 0 tetap menang.
- Struktur *place* (kunjungan di layar 2, foto memimpin) HANYA untuk homepage cafe. Halaman publik lain pilih
  tipe halaman yang cocok di tabel skill: `/mitra` = service (ajakan kerja sama), `/recruitment` = service
  (lowongan), `/franchise` = service, `/events` & `/grand-opening` = place/event; jangan pasang blok kunjungan
  cafe di sana.
- Jalankan checklist anti-slop di `GARAGE.md` sebelum PR homepage. Skill dipasang tanpa hook/skrip, jadi cek
  visual tetap lewat `node scripts/ui-check.mjs /` + Playwright.
- Keputusan Owner 24 Nov 2026 (audit anti-slop, PR homepage A): **Lokasi & Jam = section ke-2** tepat di bawah hero,
  di desktop (urutan DOM di `garage-website.tsx`) DAN HP (`section#location { order: 1 }` di blok "Kenyamanan HP",
  ada 2 salinan di `garage-website.css`); hero **maksimal 2 aksi** (Pesan + Cek Meja; Mitra lewat menu); chip GIGS di
  HP baru muncul setelah layar pertama digulir (tidak menutupi jam/QR/rating).
- Judul hero = **"LEBIH DARI SEKEDAR KOPI."** dengan ejaan "SEKEDAR" (permintaan Owner 5 Nov 2026, ditegaskan lagi
  24 Nov 2026 walau ejaan KBBI "sekadar"). Gambar `sekedar-kopi-*.webp`, `aria-label` dan teks sr-only ikut "sekedar";
  jangan "perbaiki" ejaannya tanpa Owner. Section SURYA.dev tetap seperti sekarang (Owner 24 Nov 2026). Foto hero =
  unggahan Owner di Pengaturan Website → "Upload / Ganti Hero" (slot `landing_hero`), tidak ada foto bawaan.
- Rating Google (Owner 24 Nov 2026) = `businessInfo.googleRating` + `googleReviewCount` (app_settings `site.businessInfo`,
  form Pengaturan Website, `PUT /api/site/business-info`), BUKAN `GARAGE_LOCATION.rating` (itu hanya nilai awal). Keduanya
  berpasangan; kosong = rating disembunyikan di hero, blok Lokasi, footer, dan JSON-LD `aggregateRating` (helper
  `googleRatingOf(biz)` di `garage-website.tsx`). Tidak ada API Google; Owner menyalin angka dari profil Google Maps.

## 3. Bangun
- Server Component default; `"use client"` hanya untuk bagian interaktif. Data lewat `garage-service`/API yang ada.
- Pakai token & komponen yang ada; jangan duplikasi style. Teks tidak boleh terpotong/overflow; angka uang
  `tabular-nums`; target sentuh ≥ 44 px; satu kolom di mobile.
- Gambar: `next/image` dengan `sizes`, prioritas hanya untuk hero; aset dari `public/` atau upload resmi.
- SEO halaman publik: `metadata` (title, description, OG/Twitter image), heading berurutan, teks alt bermakna,
  update `src/app/sitemap.ts` bila route publik baru. Bahasa Indonesia yang natural.
- Saat menulis, cek rule Vercel React yang relevan (lihat langkah 4) — jangan baca semuanya.

## 4. Audit — WAJIB: Vercel React Best Practices + Web Design Guidelines
1. **Vercel React Best Practices** (`.claude/skills/vercel-react-best-practices/SKILL.md`): baca daftar rule, lalu
   buka HANYA `rules/<id>.md` yang cocok. Minimal periksa: `async-*` (waterfall data), `bundle-*` (barrel import,
   dynamic import untuk Three.js/GSAP/komponen berat), `server-*` (serialisasi, cache), `rerender-*` di bagian client.
2. **Web Design Guidelines** (`.claude/skills/web-design-guidelines/SKILL.md` + `guidelines.md`): audit file yang
   diubah, output `file:line`. Fokus a11y (kontras AA, fokus keyboard, label, alt), form, state kosong/loading/error,
   motion, tipografi.
3. Perbaiki temuan; temuan yang sengaja tidak diikuti → sebutkan alasannya.

## 5. Verifikasi (output dipotong, lihat `hemat-token`)
```bash
npm run lint 2>&1 | grep -E "error|warning" | head -40
npx vitest run <test terkait> --reporter=dot 2>&1 | tail -20      # bila ada test terkait
node scripts/ui-check.mjs / /<route-baru>                          # 1366×900 + 390×844: error, overflow, teks terpotong
npm run build 2>&1 | tail -30                                      # sebelum PR
```
- Lihat screenshot (`--shots=<scratchpad>`) hanya bila ada temuan atau untuk cek akhir hero.
- Untuk halaman member: QA viewport lengkap sesuai kontrak member (1440, 1920, 1366, 1024, 768, 390, 360).

## 6. Selesai bila
- [ ] Arah desain tercatat dan sesuai Crystal V5/MASTER; deviasi sudah disetujui Owner.
- [ ] Data nyata, logo resmi, tanpa klaim palsu.
- [ ] Audit React + Web Design Guidelines bersih atau temuan dijelaskan.
- [ ] `ui-check` bersih di desktop & mobile, reduced motion berfungsi.
- [ ] Lint + build hijau; route publik baru terdaftar dengan guard; sitemap/metadata diperbarui.
