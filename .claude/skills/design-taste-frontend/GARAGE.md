# design-taste-frontend untuk garagecoffee.id (homepage / landing)

Skill anti-slop ini dipakai di homepage `src/app/page.tsx` → `src/components/garage-website/` dan halaman publik
lain lewat skill `garage-website` (langkah 2b). Jenis halaman menurut tabel skill ini: **place** (cafe/bar).

## Yang DIAMBIL dari skill ini
- Tells AI slop (`references/copy-tells.md`, `references/copy.md`, `copy-voice.md`): kalimat basa-basi, tiga
  kartu fitur generik, superlatif kosong, judul "Elevate/Unlock/Experience", em dash berderet, emoji ikon.
- Struktur halaman place (`references/sections.md`, `layout-v4.md`): hero satu layar, kunjungan (alamat + jam)
  di layar kedua, lalu menu/penawaran, tempat, pesan/booking. Satu aksi utama per layar.
- Satu section = satu atau dua layar (1440x900), tepi kiri-kanan sama, tidak ada judul section berikutnya yang
  mengintip, tidak ada caption di bawah foto.
- Foto memimpin (12–20 foto di halaman penuh) — memakai foto ASLI Garage, bukan foto AI.
- Micro-interaction hover/press (`references/motion.md`) dan satu "moment" per halaman, sejalan dengan skill
  `garage-motion` (wajib `prefers-reduced-motion`).
- Performa (`references/perf.md`): gambar dioptimasi, LCP hero ringan.

## Yang DIGANTI aturan Garage (selalu menang)
| Skill ini bilang | Garage |
|---|---|
| Palet & font "dealt by trade" (`start.mjs deal`) | Garage Crystal V5 (`docs/crystal-v5/01-DESIGN-SYSTEM.md`, token `--gc-*`, Montserrat + Inter), asphalt hitam, chrome, merah, amber |
| Foto stand-in berlisensi / pencarian foto | Hanya foto asli Garage (`imageUrl` menu, aset `public/`); tanpa foto = placeholder gelap ber-emblem, tidak ada foto palsu |
| Kontak `.example`, tanpa nomor telepon, alamat tanpa nomor | Data nyata dari Pengaturan/DB (alamat, jam, WhatsApp resmi) — jangan dikarang, jangan disamarkan |
| "Cafe = tanpa efek/scene" | Homepage Garage boleh Cinematic Laser UI yang sudah ada (`cinematic/`, GSAP 3.15.0) sesuai `garage-motion`; jangan tambah shader baru tanpa persetujuan Owner |
| Halaman statis `index.html` + `gate.mjs` | Next.js App Router; verifikasi = `node scripts/ui-check.mjs /` + Playwright 390/768/1366 + lint/tsc/build |
| Logo/brand | Logo resmi `public/garage-brand/*` (`object-contain`), brand "Garage Coffee"; logo sponsor BLACK hanya `/grand-opening` |

## Checklist anti-slop sebelum PR homepage
1. Tidak ada kalimat yang bisa dipakai cafe mana pun ("tempat nongkrong terbaik", "pengalaman tak terlupakan").
2. Tidak ada angka/rating/testimoni/badge yang tidak berasal dari data.
3. Hero: nama + apa yang dijual + satu CTA (Pesan / Lihat Menu), foto asli, satu animasi masuk.
4. Layar kedua: alamat, jam buka hari ini, tombol arah/WhatsApp.
5. Tidak ada tiga kartu ikon generik berjajar; tiap section komposisi berbeda.
6. Teks body ≥ 16px di mobile, kontras AA, tidak ada teks terpotong di 390.
7. Hover lift 2px / zoom foto 1.02, tombol press; semua mati saat reduced-motion.
