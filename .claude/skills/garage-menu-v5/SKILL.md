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

Keputusan Owner 4 Nov 2026 (final):
- **Mode menu**: menu pelanggan = lihat menu + Daftar Pilihan, pesanan resmi dicatat waiter ("Tunjukkan ke Waiter"),
  lalu masuk POS dan Bar/Dapur. Alur pesan + bayar sendiri yang sekarang **disimpan sebagai mode** (bukan dihapus),
  dipilih per outlet lewat Pengaturan. Default saat rilis = perilaku sekarang sampai Owner mengganti modenya
  (supaya deploy tidak mematikan pemesanan tanpa sengaja).
- **Merah utama menu = #D43A3A** (Garage Red papan). Dipasang sebagai token menu/AYA; token operasional tidak diubah
  tanpa keputusan terpisah.
- **AYA = robot berhelm V5 di SEMUA layar** (menu pelanggan, staf, POS), menggantikan maskot v2. Sumber aset:
  `docs/design-references/aya-v5/` (5 state, 3 FAB, layer badan/kepala/wajah). Panel chat, quick prompts, kartu
  bantuan di paket itu = gambar statis, bangun sebagai UI React. AYA boleh berjalan/berlari (kaki & tangan dipisah
  jadi grup), selalu di jalur aman, tidak menutupi harga/tombol, diam saat reduced-motion.

Keputusan Owner 4 Nov 2026 (sisa, "pakai usulan Claude"):
- Logo "A" di AYA: pakai versi paket V5 dulu; diganti vektor resmi bila Owner memberikannya.
- Tombol "+" pada kartu multi-varian membuka Quick View untuk memilih varian; angka di kartu = total semua varian.
- Harga kartu: "mulai Rp X" hanya bila harga varian berbeda; harga tunggal bila sama.
- Font judul miring tebal: Montserrat 800 italic (next/font/google), khusus judul/hero menu; teks lain tetap.
- Foto produk: pakai `imageUrl` asli; tanpa foto = placeholder gelap ber-emblem kategori, bukan foto AI palsu.
  Foto baru lewat alur handoff (ChatGPT/mcp-image) setelah Owner setuju.
- Default saat rilis = perilaku `/order` sekarang; Owner mengganti mode di Pengaturan.
- AYA berlari/berjalan hanya di jalur aman, berhenti saat pelanggan menggulir/mengetik/membuka Quick View.

Status 4 Nov 2026: F1 (AYA V5 + token + font), F2 (layout) dan F3 (Quick View, Daftar Pilihan, mode outlet
`digitalMenuMode`, Tunjukkan ke Waiter + QR prefill Pesankan) selesai. Berikutnya F4 (AYA chat/voice/quick prompts) dan
F5 (state, toast, efek suara, QA penuh). Ukuran S/M/L & level gula masih menunggu data produk.

Rencana fase: F1 fondasi (token #D43A3A, font, AYA V5 di semua layar + rig jalan/lari) -> F2 layout menu
(header, sidebar, hero, ubin, chip, kartu, panel kanan, bottom nav) -> F3 Quick View + Daftar Pilihan + mode outlet
+ Tunjukkan ke Waiter -> F4 AYA chat/voice/quick prompts -> F5 state, toast, efek suara, QA penuh.

Catatan lama (sudah dijawab di atas):
Masih perlu konfirmasi Owner (satu kali, lalu catat di DIRECTION.md):
- Perilaku "Panggil Waiter": hanya memanggil waiter dengan daftar terlampir (permintaan layanan meja), atau membuat
  pesanan? Papan: "Ini bukan proses checkout... staf kami akan datang untuk mengonfirmasi pesanan." `/order` sekarang
  = pelanggan memesan dan membayar sendiri; keduanya tidak bisa sama-sama jadi alur utama tanpa mode.
- AYA: papan 04 = robot berhelm dengan "A" merah; repo punya `public/garage-brand/aya/v2/*.svg` (maskot lain).
