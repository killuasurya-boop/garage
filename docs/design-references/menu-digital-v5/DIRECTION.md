# Menu Digital V5: arah visual dari referensi (4 Nov 2026)

Referensi: `smartphone.webp` (887x1774), `tablet.webp` dan `desktop.webp` (1672x941), render ChatGPT dari prompt
"Garage Digital Menu V5". **Referensi visual saja**: bukan sumber data, logo, foto, atau perilaku.

## Yang kita ambil (alasan kenapa terasa premium)

1. **Kedalaman, bukan hitam datar.** Latar hitam hangat dengan glow merah di belakang hero, vignette, dan lapisan kartu
   bergradasi tipis dengan garis 1px bertinta merah. Kartu terpilih mendapat glow merah.
2. **Hero bercerita.** Produk di atas batu dengan biji kopi, uap, dan segitiga "A" merah besar di belakang. Satu titik
   fokus, headline tebal miring, satu tombol.
3. **Dua tingkat kategori.** Ubin ikon besar (Coffee, Non-Coffee, Makanan, Cemilan) lalu pil filter (Semua, Signature,
   Best Seller, Rekomendasi). Di desktop: sidebar bersarang dan ubin berfoto.
4. **Kartu produk padat.** Mobile: foto kiri, nama + varian + harga + stepper kanan. Badge Best Seller/Signature, hati
   favorit, stepper merah.
5. **AYA sebagai dock.** Mobile: bar bawah dengan mic dan gelombang suara. Desktop: panel kanan. Tablet: pojok kiri bawah.
6. **Bottom nav** dengan tab aktif berupa ubin merah dan lencana jumlah. Tablet/desktop: panel kanan Daftar Pilihan
   dengan estimasi total.
7. **Tata letak per layar.** Mobile 1 kolom; tablet 3 kolom (nav, konten, daftar); desktop sidebar + konten + panel kanan.

## Yang TIDAK boleh disalin

| Di render | Masalah | Aturan |
|---|---|---|
| Logo "GARAGE COFFEE" | Digambar ulang AI (segitiga A berbeda) | Pakai `public/garage-brand/garage-coffee-logo.png`, `object-contain` |
| Maskot AYA | Digambar ulang | Pakai `public/garage-brand/aya/v2/*.svg` |
| Semua harga | Karangan, tidak cocok data | Selalu dari `src/lib/garage-data.ts` / API menu (tabel di bawah) |
| Foto minuman, gelas berlogo | Hasil AI, bukan produk nyata | Foto asli produk; placeholder sampai ada |
| Teks "Digital Menu V5", "Smart - Interactive - Responsif" | Label internal | Jangan tampil di UI |
| Alamat "Jl. Sutomo No. 87", IG "@garagecoffee.id" | Tidak ada di repo (repo: `garage_tbt.id`) | Tanya Owner / ambil dari Pengaturan |
| "Hot / Cold" dengan stepper langsung | Varian harus dipilih | Kartu multi-varian membuka pemilih varian |
| Teks kecil abu-abu ("Hot / Cold", "Lihat Semua") | Risiko kontras AA | Uji dengan token `--gos-*` |

Harga di render vs data nyata:

| Menu | Render | Data (`garage-data.ts`) |
|---|---|---|
| Americano | 18.000 | 15.000 (Hot/Cold) |
| Latte (Coffee Latte) | 26.000 | Cold 20.000 / Hot 18.000 |
| Matcha | 26.000 | Cold 22.000 / Hot 20.000 |
| Choco Cloud | 34.000 | 26.000 (Cold) |
| Spanish Latte | 34.000 | 26.000 (Cold) |
| Caramel Macchiato | 36.000 | 28.000 (Cold) |
| Lemon Tea | 20.000 | 15.000 (Hot/Cold) |
| Nasi Goreng | 20.000 | 15.000 |
| Kentang Ori | 16.000 | 12.000 |
| Mix Plater | 23.000 | 18.000 |

## Konflik produk yang harus diputuskan Owner

Prompt V5: "pelanggan hanya menyusun daftar pilihan, bukan checkout; pesanan resmi dibuat waiter" (tombol
"Tunjukkan ke Waiter"). `/order` saat ini: pelanggan membuat pesanan sendiri (meja, bukti bayar, take away) dan ada mode
waiter "Pesankan". Dua hal itu tidak sama. Lihat keputusan di sesi, lalu catat di sini.

## Peta ke komponen yang ada (`src/components/garage/order/`)

`hero-rail.tsx` (hero), `category-nav.tsx` (kategori), `menu-card.tsx` (kartu), `order-cart-bar.tsx` (keranjang),
`aya-order-guide.tsx` + `aya-greeting.tsx` (AYA), `order-header.tsx` (header), `order-help-sheet.tsx` (bantuan).
Gunakan token `--garage-*`/`--gos-*`; jangan tambah hex baru kecuali glow/gradasi yang didefinisikan sebagai token.

## Fase

1. Token kedalaman (glow, vignette, gradasi kartu) + hero + kartu produk, mobile 390x844.
2. Kategori dua tingkat + pil filter + bottom nav.
3. Tablet dan desktop (panel kanan, sidebar).
4. Pemilih varian / quick view, favorit, AYA dock.
5. State: loading, kosong, error, sukses; toast.
6. Gerak sinematik (skill `animate`), lalu QA di 1366x900, 390x844, 768x1024.

## Catatan 4 Nov 2026 (setelah tujuh papan komponen)

Owner: papan komponen (`boards/`) adalah desain komponennya sendiri; ikuti detailnya. Lihat skill
`.claude/skills/garage-menu-v5/` (keputusan, SPEC) dan jangan memakai tabel "Yang TIDAK boleh disalin" untuk menolak
gaya, hanya untuk teks/data/logo (harga, nama menu, logo, alamat tetap dari sumber resmi).
