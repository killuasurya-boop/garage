# Garage OS POS V6 — Design System

Status: dibangun 5 Nov 2026 di branch pengembangan. Belum di-deploy; menunggu review Owner.
Referensi visual: 8 Component Design Board POS V6 (01 Sidebar, 02 Header, 03 Katalog, 04 Keranjang,
05 Pembayaran, 06 Operasional, 07 Shift, 08 Theme Studio) + 6 tangkapan layar POS V6 dari Owner.

## 1. Prinsip

1. **Keamanan transaksi dulu.** V6 hanya mengubah TAMPILAN. Semua aksi (bayar, shift, meja, split, park,
   void, QRIS) memanggil handler yang sama di `pos-view.tsx`. Tidak ada logika transaksi kedua.
2. **Satu design system, empat tema.** Struktur & tata letak identik di semua tema; tema hanya mengganti token warna.
3. **Data asli.** Harga, nama, kategori, foto, badge dari data Garage OS. Nominal di gambar referensi tidak dipakai.
4. **Blind count.** Topbar kasir tidak menampilkan omzet/kas seharusnya. Yang tampil: status shift, jam, jumlah transaksi shift.
5. **Kasir cepat.** Target sentuh ≥ 40–44 px, shortcut F1–F4/F9, katalog padat tapi terbaca.

## 2. Token warna (`--pos-*`)

Didefinisikan per tema di `src/app/globals.css` (selektor `.garage-shell[data-cashier-theme="…"]` dan
`[data-cashier-theme-scope="…"]` untuk dialog/lembar). Token lama `--cashier-*` tetap ada untuk komponen lama.

| Token | Fungsi |
|---|---|
| `--pos-chrome-bg` / `--pos-topbar-bg` / `--pos-chrome-solid` | latar sidebar / topbar (gradien) / warna padat untuk uji kontras |
| `--pos-chrome-fg` `--pos-chrome-muted` `--pos-chrome-line` `--pos-chrome-hover` `--pos-chrome-chip` | teks & garis di chrome |
| `--pos-chrome-active-bg` `--pos-chrome-active-fg` | item navigasi aktif |
| `--pos-accent` `--pos-accent-hover` `--pos-accent-soft` `--pos-accent-fg` | aksi utama (Bayar, +, kategori aktif) |
| `--pos-bg` `--pos-surface` `--pos-surface-muted` | kanvas, kartu/panel, permukaan sekunder |
| `--pos-text` `--pos-text-2` `--pos-muted` `--pos-border` | teks utama/sekunder/redup, garis |
| `--pos-price` `--pos-total-bg` | harga kartu, kotak Total Tagihan |
| `--pos-success(-soft)` `--pos-warning(-soft)` `--pos-info(-soft)` | status semantik (kembalian, peringatan, QRIS) |

| Tema | Kunci (`localStorage garage-cashier-theme`) | Chrome | Kanvas | Aksen |
|---|---|---|---|---|
| Garage Signature (utama) | `garage-signature` | charcoal `#211718` → merah gelap | `#F8F6F4` | `#B5121B` |
| Garage Clear | `garage-clear` | putih | `#F3F4F6` | `#B5121B` |
| Warm Coffee | `warm-light` | espresso `#3A2219` | krem `#F5EEE3` | `#B5121B` |
| Focus Blue | `focus-blue` | putih | `#EEF3F9` | `#1F5FD1` |
| Garage Dark (klasik, permintaan Owner) | `garage-default` | asphalt `#0B0B0E` | `#0A0A0D` | `#D4202A` |

Perangkat yang sudah memakai gelap klasik (`garage-default`) tetap gelap (Owner, 5 Nov 2026); perangkat baru = Garage Signature.
Tombol "⚡ Uang pas · Take away" (Bayar 1 tap) tetap langsung menyelesaikan transaksi (keputusan Owner 5 Nov 2026).
Status bahaya tetap merah di semua tema (Focus Blue tidak mengubah merah jadi biru).

**Kontras:** `src/components/garage/pos/pos-v6.test.ts` membaca token dari `globals.css` dan memeriksa
teks ≥ 7:1, teks redup/harga/tombol/total/kembalian ≥ 4,5:1 untuk keempat tema.

## 3. Tipografi, spasi, radius

- Font proyek (body). Angka uang: `font-variant-numeric: tabular-nums`, mono untuk input & ringkasan.
- Skala teks Theme Studio: Kecil 0,92 · Sedang 1 · Besar 1,12 (`--pos-fs`, atribut `data-pos-text-size`).
- Judul kartu 15 px/700, sub 12,5 px, harga 16,5 px/800, Total Tagihan 20–28 px (clamp), kembalian 36 px.
- Spasi kelipatan 4 px; gap grid 12 px (Visual) / 8 px (Ringkas/Daftar).
- Radius: kartu 14, panel keranjang 16, tombol/tab 10–12, badge 6–8.
- Bayangan lembut; tanpa glassmorphism di area operasional.

## 4. Komponen

| Papan | Komponen React | File | Status |
|---|---|---|---|
| 01 Sidebar | `PosV6NavItem` (badge, titik status, shortcut), `PosV6NavList`/`PosV6NavGroups`/`PosV6MoreSheet` (daftar dari `posNavModel`), `PosV6ThemeSwatches` (di lembar Lainnya) | `src/lib/pos-nav.ts`, `pos/pos-v6-nav.tsx`, `pos/pos-v6.tsx`, sidebar di `pos-view.tsx` | Selesai (Nov 2026): 9 menu kerja + "Lainnya" (lembar 5 grup), lebar 208 px, tanpa scroll di 1366x768; nama panjang turun baris; mode Penuh/Ikon saja |
| 02 Header | `PosV6Brand`, `PosV6ShiftChip`, `PosV6Clock`, `PosV6Kpi`, `PosV6TopbarChip` (QR, Tagih), `PosV6ConnectionChip` (buka QC), `PosV6TopbarButton`, `PosV6Profile` (menu akun: Menu Kasir, Absen, Fee, Shift, Theme Studio, Pengaturan, Keluar) | `pos-v6.tsx`, topbar di `pos-view.tsx` | Selesai (Nov 2026): satu baris ≤ 64 px; chip shift/QR/Tagih/koneksi bisa diklik; tombol Menu di bawah 1280 px (Owner/Manajer selalu); Absen ikon selalu tampak (≥ sm; di HP lewat menu akun) |
| 03 Katalog | `PosV6CategoryTile`, `PosV6ProductCard` (Visual/Ringkas/Daftar, Habis, Signature, Unggulan, Promo, Favorit) | `pos-v6.tsx` | Selesai |
| 04 Keranjang | tab Pesanan/Meja, thumbnail baris, Subtotal/Layanan/Pajak/Pembulatan, Total Tagihan, Bayar F9 | `pos-view.tsx` + `pos-v6.css` | Selesai (struktur baris lama dipertahankan) |
| 05 Pembayaran | Pemilih metode berikon; `CashPaymentPanel` (Uang Diterima, nominal cepat + Uang Pas, Kembalian); `QrisPaymentPanel` (QR + total + verifikasi + ref); `BankTransferPaymentPanel`/`EWalletPaymentPanel` (pilih akun, nomor bisa disalin, total) | `pos/pos-checkout-panels.tsx` | Selesai |
| 06 Operasional | Lembar Operasional QR, peta meja (palet status resmi Owner dipertahankan) | `pos-view.tsx` | Kontras tema terang diperbaiki; tata letak lama |
| 07 Shift | Layar "Shift Belum Dibuka" ber-header V6, `PosV6ShiftInfo` (kasir/perangkat/tanggal/jam), grid pecahan berwarna uang Rupiah, Tutup Shift (blind count tetap) | `pos-view.tsx`, `cash-denomination-grid.tsx` | Selesai (aturan keuangan tidak diubah) |
| Penjualan Langsung | Dialog Quick Retail ikut tema: cari/scan besar, tab kategori, kartu produk V6, keranjang + foto, Total Tagihan, Tunai/QRIS, kartu Kembalian | `pos/pos-quick-retail.tsx` | Selesai (logika bayar, idempotensi, tender guard tidak diubah) |
| 06 Order QR | Kartu order: badge meja aksen, garis status (kuning = menunggu, hijau = lunas), total berwarna harga, tombol 44 px | `pos-view.tsx` | Selesai |
| Belum Bayar | `PosV6PendingBills` (tab Cash pending / QRIS & Transfer / Lewat 30 mnt, cari), kartu ringkas (meja · nama · WA · isi · total · umur · metode), `PosV6PendingBillDetail` (popup detail), `PosV6FinalizeDialog` (tunai wajib isi) | `pos/pos-v6-pending.tsx`, logika `src/lib/pos-pending-bills.ts` | Selesai (Nov 2026) |
| Modul popup | `PosV6ModuleSheet`: Riwayat Penjualan, Riwayat/Laporan Shift, Petty Cash, Catatan Kejadian, PDF/halaman internal tanpa tab baru | `pos/pos-v6-module-sheet.tsx` | Selesai; wa.me tetap aplikasi luar |
| 08 Theme Studio | `PosV6ThemeStudio`, `CashierThemePresetGrid` (kartu pratinjau) | `pos/pos-v6-theme-studio.tsx`, `garage-app-pickers.tsx` | Selesai (preferensi perangkat) |

Badge kartu: **Promo** (harga promo dari data) > **Signature** (tag produk "Signature") > **Unggulan** (`featured`).
Hati di kartu = favorit perangkat ini (sudah sering ditap), bukan klaim terlaris.

## 5. State interaksi

- Hover 120 ms ease-out (angkat 2 px), tekan 80 ms ease-in (scale 0,97–0,98), fokus = outline 2 px aksen.
- Kartu Habis: foto grayscale + "Habis", harga redup, tombol + abu-abu, `aria-disabled`.
- Kategori aktif / tab aktif / nav aktif = isi aksen + teks putih.
- Bayar: disabled saat keranjang kosong; dialog pembayaran tetap memakai alur 5 langkah dan idempotency lama.
- Kurangi gerakan: preferensi POS (`data-pos-reduced-motion`) + `prefers-reduced-motion` perangkat.

### Sidebar & gerak (Owner, Nov 2026)
- Tombol ciut/lebar di kepala sidebar (shortcut `[`), lebar 208 ↔ 80 px beranimasi 220 ms; mode ciut = ikon modul 48 px + badge + tooltip.
- Garis merah tepi sidebar selalu menyala (background-position 5,5 dtk + napas opacity) — deviasi atas permintaan Owner; mati saat
  "Kurangi gerakan" / `prefers-reduced-motion`. Ikon modul: hover terangkat + kilau merah, aktif = denyut merah pelan, badge = pop.
- Layar penuh: tombol tetap di topbar, "Layar penuh otomatis" (Theme Studio, default nyala: sentuhan pertama), baris "Cek layar" di QC Kasir.

## 6. Responsif

| Lebar | Tata letak |
|---|---|
| ≥ 1280 (xl) | sidebar tetap (208 px atau 80 px ikon) + katalog + keranjang 372 px (420 px ≥ 1500) |
| 768–1279 | tanpa sidebar (menu lewat tombol Menu Kasir), katalog + keranjang kanan |
| < 768 | topbar ringkas (aksi sekunder di Menu Kasir), kategori geser, grid 2 kolom, bar total bawah + laci keranjang |

Diuji: 1920×1080, 1440×900, 1366×900, 1280×720, 1024×768, 768×1024, 390×844, 360×800 — tanpa scroll horizontal, tanpa error konsol.

## 7. Theme Studio (papan 08)

Per perangkat (`localStorage garage:pos:cashier-settings` + `garage-cashier-theme`), langsung diterapkan, tersimpan
otomatis: Tema, Ukuran teks, Katalog (Visual/Ringkas/Daftar), Posisi keranjang, Sidebar, Foto produk, Kurangi gerakan,
Layar penuh, Reset default. Tidak menyentuh keranjang/transaksi/server.
Lanjutan (Owner/Manajer saja): warna utama, latar, permukaan, garis, radius sudut, pratinjau, kembalikan ke warna tema.
Disimpan per perangkat (`garage:pos:theme-custom:v1`, `pos-v6-theme-custom.ts`), hanya tema terang; nilai yang gagal
kontras WCAG AA tidak bisa diterapkan. Belum ada: default tema per outlet (butuh keputusan Owner).

## 8. Aksesibilitas

- Semua kontrol V6 berlabel (`aria-label`, `aria-pressed`, `aria-checked`, `role="radiogroup"`).
- Status tidak hanya warna: badge berteks, titik shift + teks "Shift Aktif".
- Shortcut tidak aktif saat dialog terbuka; F-key tidak menyelesaikan pembayaran.

## 9. Checklist uji

- [x] `npx tsc --noEmit`, `npm run lint`, `vitest` (termasuk `pos-v6.test.ts`), `next build`
- [x] E2E 5 alur kritis (login, POS tunai/QRIS, tutup shift, laporan Owner, Kelola Staff)
- [x] Screenshot 4 tema + 8 ukuran layar + Theme Studio + pembayaran tunai/QRIS
- [ ] Uji perangkat nyata (tablet kasir, printer thermal) oleh Owner
- [x] E2E tema: `e2e/pos-v6-theme.spec.ts` (ganti tema tanpa mengubah keranjang, bertahan setelah refresh, F9 hanya membuka bayar)
- [ ] Visual regression berbasis piksel (belum ada baseline di repo)
