---
name: garage-menu-v5
description: Wajib dipakai setiap kali membangun atau mengubah UI menu digital pelanggan Garage Coffee (/order, kartu menu, quick view, daftar pilihan, AYA, search/filter, state). Hasil HARUS mirip papan referensi Digital Menu V5 di docs/design-references/menu-digital-v5/. Berisi spesifikasi, alur kemiripan, dan daftar konflik dengan data/aturan repo.
---

# Garage Menu V5: kemiripan dengan referensi adalah syarat

Owner (Nov 2026): konsep Digital Menu V5 harus **mirip** papan referensinya. Jangan menafsir ulang gaya, jangan
mengganti arah visual, jangan "menyederhanakan". Selisih dari referensi hanya boleh bila perlu (data, aturan, aksesibilitas)
dan harus disebut ke owner sebelum dibuat.

## Sumber acuan (baca gambarnya, jangan mengandalkan ingatan)

- `docs/design-references/menu-digital-v5/boards/` : 00 overview, 01 product card, 02 quick view, 03 daftar pilihan,
  04 AYA, 05 search/filter/nav, 06 state/feedback (WebP, 1448x1086).
- `docs/design-references/menu-digital-v5/{smartphone,tablet,desktop}.webp` : tata letak layar penuh.
- `SPEC.md` di folder skill ini: angka dan state yang terbaca dari papan.
- `docs/design-references/menu-digital-v5/DIRECTION.md`: apa yang diambil dan tidak boleh disalin.

## Alur wajib untuk setiap komponen

1. Buka papan yang relevan dengan Read (gambar) dan baca bagian SPEC.md-nya.
2. Cari bahan lebih dulu: `shadcn` MCP, komponen `src/components/ds/`, komponen `src/components/garage/order/`.
3. Bangun dengan token `--garage-*`/`--gos-*`; tambah token baru (bukan hex liar) bila papan memerlukannya.
4. Pasang gerak lewat skill `animate`/`motion-design` memakai nilai papan (hover 120 ms ease-out, pressed 80 ms
   ease-in, pop-in 180 ms ease-out, success pulse 300 ms, loading pulse 1,2 s). Hormati `prefers-reduced-motion`.
5. Verifikasi dengan `playwright`: tangkap layar di 390x844, 768x1024, 1366x900, bandingkan berdampingan dengan papan,
   lalu tulis daftar selisih (ada / mirip / berbeda + alasan). Perbaiki sampai mirip.
6. Lint, tsc, build sesuai bagian Verification di CLAUDE.md.

## Yang tidak boleh disalin dari gambar (lihat DIRECTION.md)

Logo (pakai `public/garage-brand/garage-coffee-logo.png`), maskot AYA (pakai aset resmi repo), harga dan nama menu
(selalu dari data), foto minuman AI (foto asli atau placeholder), alamat dan akun sosial (dari Pengaturan/Owner).

## Konflik yang HARUS diputuskan Owner sebelum dibangun

Jangan memilih sendiri. Tanyakan dulu, catat jawabannya di `DIRECTION.md`.
1. Alur: papan 03 menampilkan "Daftar Pilihan, bukan checkout, Panggil Waiter". `/order` sekarang = pelanggan memesan
   dan membayar sendiri. Pilihan: hanya tampilan / Daftar Pilihan + waiter / dua mode.
2. Palet: papan 00 memakai Garage Red #D43A3A, Charcoal #0E0E0E, Steel Gray #2A2A2A, Smoke #4A4A4A, Metal Silver
   #C8C8C8, Cream #EDE6DC. Repo: merah #d11a2a, bg #0a0a0c, tidak ada Cream. Pakai palet papan atau token repo?
3. AYA: papan 04 menggambar robot berhelm; render lain menggambar gadis berheadphone; repo punya `aya/v2/*.svg`.
   Mana yang resmi?
4. Opsi yang tidak ada di data: ukuran S/M/L, level gula, rating bintang, urut "Terpopuler", filter/subkategori
   "Cold Brew/Manual Brew", Favorit, tab Akun, toggle efek suara. Data menu hanya punya varian (mis. Hot/Cold),
   catatan per baris dan status ready/limited/sold_out. Tambah fitur atau lewati?
