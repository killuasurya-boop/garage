# Video promo member Garage Coffee (Remotion)

Package terpisah dari aplikasi Next.js (tidak ikut build/lint/tsc/vitest root — `video/` dikecualikan).

## Isi (15 dtk, 30 fps)
1. Laser + logo resmi dengan sapuan kilau (0–2,5 dtk)
2. "Lebih dari Sekadar Ngopi." + kartu Silver / Gold / Platinum (CSS 3D, tanpa chip/NFC)
3. Keuntungan nyata program member: Poin setiap order · Voucher & promo member · Riwayat transaksi
4. CTA foto es kopi asli + "Daftar gratis sekarang." + `garagecoffee.id/member-login`

Komposisi: `MemberPromoVertical` (1080×1920, Reels/TikTok/Status WA) dan `MemberPromoWide` (1920×1080, layar/website).
Aset hanya dari `public/` (salinan logo dan foto resmi). Tidak ada angka poin/voucher karangan.

## Pakai
```bash
cd video/member-promo
npm i
npm run dev      # Remotion Studio (preview + edit)
npm run render   # MP4 ke out/ (di container cloud: tambah --browser-executable=/opt/pw-browsers/chromium)
npm run lint
```

## Lisensi Remotion
Remotion gratis untuk individu dan perusahaan dengan maksimal 3 orang. Di atas itu wajib Company License
(https://remotion.pro). Keputusan lisensi = Owner. Font Montserrat & Inter (Google Fonts, OFL).
