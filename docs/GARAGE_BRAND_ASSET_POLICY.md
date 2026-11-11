# Garage Coffee — Kebijakan Logo Resmi

Berlaku untuk website `garagecoffee.id`, Garage OS, menu digital, order, member, invoice, dashboard, landing page, desain promosi, animasi, dan media sosial.

## Master aset
- Wordmark pada latar gelap: `public/garage-brand/garage-coffee-logo.png`
- Logo untuk dokumen / latar terang: `public/garage-brand/garage-coffee-logo-dark.png`
- Ikon: `public/garage-brand/garage-coffee-icon.png`
- Referensi kode terpusat: `src/lib/garage-brand-assets.ts`

Ketiganya adalah aset yang ditetapkan sebagai resmi dalam `CLAUDE.md`. Apabila file Library resmi memiliki versi master yang berbeda, verifikasi dengan Owner sebelum mengganti aset di repository.

## Aturan
1. Jangan menggambar ulang, membuat logo generatif, atau mengganti desain huruf A merah, tipografi, warna maupun proporsi.
2. Gunakan aset asli langsung, dengan `object-fit: contain`; tidak boleh crop, stretch, recolor, SVG tracing, ataupun pemotongan.
3. Motion hanya boleh menggerakkan lapisan pembungkus (posisi, opacity, transform), tidak mengubah isi logo.
4. Pada semua komponen baru, impor path dari `GARAGE_BRAND_ASSETS`, bukan membuat logo baru atau menambahkan duplikat path literal.
5. Lakukan QA desktop/mobile di halaman utama, menu digital, member, invoice dan seluruh shell Garage OS; uji juga latar terang serta gambar fallback.
6. Jangan mengubah harga, order, POS, auth, database, atau infrastruktur dalam pekerjaan branding ini.

## Status
Penerapan ini adalah penyatuan sumber kode dan dokumentasi. Bukan bukti bahwa versi produksi di VPS sudah terdeploy.
