# Desain: Header & Sidebar POS Ringkas (Owner 25 Nov 2026, pendekatan A "Sidebar ramping")
Status: disetujui Owner 25 Nov 2026 (pendekatan A "Sidebar ramping").

## Pendekatan yang dipertimbangkan
- **A. Sidebar ramping (dipilih):** 9 menu kerja berlabel + "Lainnya" berkelompok; topbar 1 baris. Kasir tetap mengenali menu, ruang bertambah, tanpa belajar ulang.
- B. Tanpa sidebar: tab di topbar; ruang paling luas tetapi kasir belajar ulang letak menu → ditolak.
- C. Rapikan saja: logo/ikon/duplikat diperbaiki, ±23 menu tetap → tidak menjawab "terlalu banyak menu" & "makan tempat".

## Maksud & alasan
Owner: header & sidebar POS terlalu banyak menu, makan tempat, kurang rapi/premium, info penting tidak terlihat →
harus lebih kompak. Pemakai: kasir di laptop 1366×768 (mouse+keyboard), Owner/Manajer sesekali. Skill: superpowers
(brainstorming → writing-plans → TDD → verification → requesting-code-review), design-taste-frontend (anti-slop),
ui-ux-pro-max, frontend-design, web-design-guidelines (audit), vercel-react-best-practices, garage-ui-tooling,
garage-pos, garage-motion (hanya bila ada gerak baru).

Kondisi sekarang (screenshot Signature 1366×768): sidebar ±23 menu/5 grup + swatch tema + Ringkas + Keluar → perlu
scroll (Riwayat & Kas, Lainnya, Keluar di bawah layar); wordmark GARAGE terpotong di pojok; menu ganda (Belum Bayar &
Shift di sidebar+topbar; 4 menu riwayat/laporan mirip); ikon kembar (QC=Stok Opname ClipboardCheck, Pesanan QR=Catatan
Kejadian ClipboardList, Petty Cash=Fee Wallet); label grup HURUF BESAR; topbar 2 baris ±110 px berisi "Garage OS POS
V6 · Point of Sale System" + badge V6 (generik), chip statis "Gudang Auto", tombol "Keluar" = keluar layar penuh
(bentrok dengan Keluar=logout).

## Tujuan
- Sidebar muat 768 px tanpa scroll; 8 menu kerja + "Lainnya". Lebar penuh 248 → 208 px; mode ikon 80 px tetap.
- Topbar 1 baris ±56 px di ≥1024 px; ±50 px lebih ruang vertikal untuk katalog/keranjang.
- Info penting terlihat & bisa diklik: status shift, koneksi, pesanan QR baru, tagihan belum bayar, chat tamu.
- Tampak rapi/premium khas Garage: logo utuh, satu set ikon unik per menu, label kalimat biasa, tanpa teks generik.

## Bukan tujuan / anti-tujuan
- Tidak mengubah alur transaksi, handler, tombol F (F1 Kasir, F2 Pesanan QR, F3 Meja, F4 Riwayat, F6 Belum Bayar,
  F8, F9, `[`), izin peran, atau blind count (tidak ada omzet/kas di topbar).
- Tidak menghapus fitur: setiap menu lama tetap terjangkau (paling jauh 2 klik).
- Tidak menyentuh katalog/keranjang/dialog bayar; tidak mengganti palet/tema; tidak menambah animasi dekoratif.
- Gagal bila: kasir kehilangan menu harian, angka/badge yang dulu terlihat jadi tersembunyi tanpa penanda, teks
  terpotong, atau tema terang/gelap rusak.

## Struktur sidebar (≥1280 px, `isCashierKiosk`)
Kepala: logo Garage utuh (object-contain, tidak terpotong) + tombol ciut `[`. Caption "POS V6 · perangkat" dihapus.
Menu kerja (urut, label + badge + tombol F):
1. Kasir F1 · 2. Pesanan QR F2 (jumlah menunggu) · 3. Meja F3 · 4. Belum Bayar F6 (jumlah; merah bila ada lewat
30 mnt) · 5. Riwayat Struk F4 · 6. Produksi Bar & Dapur (jumlah tiket) · 7. Atur Stok Habis (jumlah habis) ·
8. Shift (titik hijau "Shift aktif" / merah "Mulai shift") · 9. Kas Keluar / Masuk.
(9 item — Stok Habis dipakai harian; tetap di sini.)
Pemisah, lalu **Lainnya** (ikon `Ellipsis`/`LayoutGrid` unik) → membuka lembar (`Sheet` shadcn yang sudah ada, kiri)
berkelompok, judul grup kalimat biasa:
- Laporan & riwayat: Laporan shift saya (setCashierToolOpen reports), Riwayat penjualan, Riwayat & laporan shift,
  Petty cash, Catatan kejadian.
- Pelanggan: Kontak / member, Daftar member.
- Mitra (bila partnerHubEnabled): Pesanan mitra (badge perhatian), Penjualan mitra hari ini.
- Gudang & cek: QC kasir, Stok opname gudang (bila canQuickCount).
- Perangkat: Pengumuman suara, Mode tampilan (swatch tema pindah ke sini), Theme Studio, Pengaturan POS (bila
  canManagePosSettings), Muat ulang POS.
Badge "Lainnya" = jumlah perhatian di dalamnya (pesanan mitra perhatian); 0 = tanpa badge.
Kaki sidebar: dihapus (Ringkas sudah di kepala; Keluar & Fee di menu profil topbar).

## Topbar (satu baris)
Kiri: logo hanya bila sidebar tidak tampil (<1280); teks "Garage OS POS V6 / Point of Sale System" & badge V6 dihapus.
Tengah-kiri: chip Shift (titik + "Shift aktif · nama" → buka dialog shift), jam WIB, "N transaksi".
Kanan (urut): chip koneksi (Online/Offline → QC, testId `pos-qc-open` pindah ke sini), chip "Pesanan QR N" (hanya
bila N>0 → F2), chip "Tagih N" Belum Bayar (hanya bila N>0, amber/merah sesuai umur → F6), Chat tamu (ikon+badge;
label hanya bila ada pesan), lonceng notifikasi (kasir), status suara (ikon), layar penuh (ikon Maximize, aria
"Layar penuh"/"Keluar layar penuh", tanpa teks "Keluar"), profil ▾ (Absen, Fee saya, Menu kasir, Theme Studio,
Pengaturan, Keluar). Dihapus: chip "Gudang Auto", tombol Absen terpisah (ada di profil), tombol Shift ganda di xl.
<1280: tombol "Menu" (lembar menu kasir yang sudah ada) tetap; <640 tetap pola ikon satu baris yang sudah ada.

## Data & teknis
- Satu sumber daftar menu: `src/lib/pos-nav.ts` (fungsi murni `posNavModel(ctx)` → `{ primary[], more: groups[] }`
  dengan id, label, ikon-key, shortcut, badge, tone, visible) dipakai sidebar, lembar Lainnya, dan dicek tes;
  handler tetap di `pos-view.tsx` (map id → handler), sesuai aturan POS V6 (tanpa logika transaksi kedua).
- Komponen baru kecil `pos/pos-v6-more-sheet.tsx`; `PosV6Brand` tanpa judul generik; ikon unik dari lucide.
- Warna hanya token `--pos-*` (tes penjaga warna: file baru 0 kelas hex).

## Keputusan Owner (hasil cek pembangun, 25 Nov 2026)
1. **Layar <1280 px = satu daftar menu:** lembar "Menu" (yang sekarang, `pos-view.tsx` ±4868–5180) dibangun ulang dari
   `posNavModel` yang sama (menu kerja + grup Lainnya) → tidak ada menu hilang; item "Menu kasir" di profil membuka
   lembar yang sama (di ≥1280: membuka Lainnya). Tombol Menu di topbar membawa badge.
2. **Owner & Manajer memakai topbar ringkas yang sama** + tombol Menu (daftar sama); khusus mereka (non-kiosk)
   "Kembali ke dashboard" tetap tombol di topbar.
3. **Absen tetap tombol ikon (sidik jari) di topbar** (aturan NAV_ACTION_AUDIT §1.3 dipatuhi); tidak pindah ke profil.

## Diputuskan pembangun (dicek Owner saat membaca)
- Badge tombol Menu (<1280) = jumlah tiket Bar & Dapur aktif + perhatian mitra (yang tidak punya chip sendiri);
  chip QR & Tagih tetap muncul di topbar bila >0 di semua lebar.
- Ikon tepat per item (unik & bermakna, lucide), jarak/ukuran px, ikon "Lainnya", animasi buka lembar = bawaan Sheet.
- Lebar 1024–1279: topbar satu baris; bila tidak muat, chip berlabel menjadi ikon+angka (label di aria/tooltip).

## Verifikasi
- TDD `pos-nav.test.ts`: semua aksi lama ada (primary ∪ more) — daftar id tetap; tidak ada ikon kembar; tombol F
  tetap; item bersyarat (mitra, opname, pengaturan) muncul sesuai ctx; badge Lainnya = jumlah perhatian di dalamnya.
- Harness piksel 5 tema = before/after (perubahan disengaja) → periksa tiap gambar: tanpa teks terpotong/tabrakan;
  `node scripts/ui-check.mjs` 1366×768, 1366×900, 1024, 390; ukur tinggi topbar & tidak ada scroll sidebar di 768.
- Audit `web-design-guidelines` (fokus terlihat, aria-label tombol ikon, kontras AA, target ≥40 px) + checklist
  anti-slop (tanpa label HURUF BESAR, tanpa teks generik, satu set ikon).
- E2E diperbarui: `pos-v6-theme` (swatch lewat Lainnya), `pos-guardian` (QC via chip), `pos-pending`, lalu semua
  spec POS + critical-flows; vitest, tsc, lint, build; superpowers:requesting-code-review sebelum merge; deploy.

