# Garage Crystal V5 — 00 Audit desain (8 Nov 2026)

Sumber: prompt Owner "Ultimate Redesign V5" + 5 papan di `docs/design-references/crystal-v5/`.

## Keputusan Owner
- Self-order **tetap**: redesign tampilan saja; `digitalMenuMode` (self_order / waiter_list), keranjang & checkout tidak diubah.
- Login member: **Google + PIN** (tombol Google tampil hanya bila Client ID terpasang di server).
- Crystal V5 **menggantikan** kontrak desain member (`GARAGE_MEMBER_DESIGN_SYSTEM.md`) dan Menu V5 sebagai acuan visual.
  Logo resmi, AYA resmi, data/harga asli, reduced-motion tetap wajib. Tanpa dependensi baru (three, GSAP, framer-motion sudah ada).
- Meja: kolom **lantai** per meja (default 01–25 = Lantai 1, 26–50 = Lantai 2).

## Peta halaman & inkonsistensi
| Halaman | File | Kondisi sekarang | Inkonsistensi |
|---|---|---|---|
| Order landing / pilih layanan | `member-order-page.tsx`, `order/customer-table-picker.tsx` (`OrderTypeChooser`), `order/v5/welcome-v5.tsx` | Token `--menu-*` (merah #d43a3a), Montserrat | Kartu layanan polos, tanpa hero, beda dari papan 02/04 |
| Pilih meja | `order/customer-table-picker.tsx`, `order/v5/table-info-v5.tsx`, `lib/garage-table-status.ts` | 5 status (Kosong/Sedang dipilih/Terisi/Reserved/Perlu dibersihkan), grid 01–50 | Tanpa lantai, ringkasan okupansi, filter, cari, sheet detail |
| Menu digital | `order/v5/*` (`order-v5.css`, kelas `gm5-*`) | Board Menu V5 | Merah, radius & bayangan beda dari papan crystal |
| Login member | `member-auth/*` (`--gm-*`, merah #B92F35, Space Grotesk) | HP/email + PIN | Palet & tipografi beda; tanpa Google |
| Dashboard member | `member-dashboard.tsx`, `premium-membership-card.tsx` | Kartu + dompet + riwayat | Tanpa progres tier visual crystal |
| Website beranda | `garage-website/*` (`.garage-website` token sendiri, cinematic laser GSAP) | Paling dekat ke crystal | Token terpisah |
| Sidebar internal | `shell/garage-shell-chrome.tsx` (`ModuleNav`) | 72/276 px, grup statis, warna hex langsung | Tanpa accordion, search, indikator laser |

Empat set token merah berbeda (#d11a2a, #d43a3a, #B92F35, #e1252b) → disatukan di `--gc-*`.

## Data yang TIDAK ada (tidak dipalsukan)
- Kapasitas kursi per meja → status "Penuh" tidak ditampilkan.
- Katalog reward / penukaran poin oleh member → tidak dibuat (redeem tetap lewat kasir).
- Tabel consent marketing & email terverifikasi member → ditambah di Batch 4 (migrasi).
- Waktu tunggu meja → tidak ditampilkan.

## Batch
0 design system · 1 order landing · 2 smart table selector + lantai · 3 menu digital · 4 member Google + dashboard ·
5 navigasi publik + sidebar internal. Rincian: `/root/.claude/plans` (rencana sesi) dan `01-DESIGN-SYSTEM.md`.
