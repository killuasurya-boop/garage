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

## Keputusan Owner (Nov 2026)

Owner menyatakan papan ini adalah **desain komponennya sendiri** untuk UI menu. Baca detailnya dan ikuti, bukan
sekadar terinspirasi. Konsekuensinya:
1. **Gaya dan palet = papan.** Warna papan (Garage Red #D43A3A, Charcoal #0E0E0E, Steel Gray #2A2A2A, Smoke #4A4A4A,
   Metal Silver #C8C8C8, Cream #EDE6DC) dipasang sebagai token menu baru; token operasional (POS, Dapur) tidak diubah.
2. **Semua komponen dibangun seperti papan**, termasuk Favorit, Quick View, Daftar Pilihan, Panggil Waiter, AYA,
   filter/urut, bottom nav, FAB, toast, dan toggle efek suara.
3. **Opsi yang belum ada di data** (ukuran S/M/L, level gula, subkategori, rating): UI dibuat sesuai papan dan hanya
   tampil bila produk punya datanya. Menambah data/harga/resep/tiket dapur untuk opsi itu adalah pekerjaan terpisah
   dan butuh rencana yang disetujui Owner dulu (menyentuh harga, HPP, dapur).
4. **Teks harus dari data**, bukan dari papan: nama menu, harga, kategori (Coffee/Non-Coffee/Makanan/Cemilan),
   bagian menu, label varian. Ejaan "Camilan" di papan adalah typo dari "Cemilan" di data.
5. **Istilah**: papan memakai "Keranjang" (00, 05, 06) dan "Daftar Pilihan" (03, layar penuh). Pakai satu: "Daftar
   Pilihan"/"Tambah ke Daftar", kecuali Owner menyatakan lain.

Masih perlu konfirmasi Owner (satu kali, lalu catat di DIRECTION.md):
- Perilaku "Panggil Waiter": hanya memanggil waiter dengan daftar terlampir (permintaan layanan meja), atau membuat
  pesanan? Papan: "Ini bukan proses checkout... staf kami akan datang untuk mengonfirmasi pesanan." `/order` sekarang
  = pelanggan memesan dan membayar sendiri; keduanya tidak bisa sama-sama jadi alur utama tanpa mode.
- AYA: papan 04 = robot berhelm dengan "A" merah; repo punya `public/garage-brand/aya/v2/*.svg` (maskot lain).
