# Warna POS: 3 lapis pemetaan (U9, 25 Nov 2026)

Owner memilih **versi aman**: tampilan POS tidak diubah. Yang dipasang hanya pengaman (tes penjaga dan harness
piksel) dan dokumen ini. Penggantian massal kelas warna ditunda sampai bisa dibuktikan aman per preset.

## Kenapa warna POS rumit

Komponen POS lama ditulis untuk tema gelap dengan kelas hex Tailwind, misalnya `bg-[#111116]`, `border-[#34343c]`,
`text-[#b8b8bf]` dan `text-white`. Warna akhirnya ditentukan tiga lapis selector substring `[class*="…"]` yang
bertumpuk. Semua lapis memakai `!important`.

| Lapis | Berlaku saat | Lokasi | Isi |
|---|---|---|---|
| 1. Preset tema OS | Selalu: `.garage-shell[data-garage-preset]`, juga di Garage Dark | `src/app/globals.css` ±1715–1840 | Border dan latar gelap → `--garage-line`, `--garage-bg-1` milik preset OS (Pengaturan → tema) |
| 2. Tema kasir lama | `.garage-shell[data-cashier-theme] …`; sebagian juga `:not(garage-default)` | `src/app/globals.css` ±990–1330 | Teks abu → `--cashier-muted`, teks putih di tombol merah, dll. |
| 3. Remap POS V6 | Tema kasir ≠ `garage-default` (Signature, Clear, Warm Coffee, Focus Blue) | `src/components/garage/pos/pos-v6.css` ±715–756 dan 958–1030 | Latar, border dan teks hex → token `--pos-*` per tema (`globals.css` ±401–770) |

Akibatnya, satu kelas hex bisa tampil berbeda menurut kombinasi **preset OS × tema kasir**. Hasilnya juga bisa salah
kalau sebuah kelas hex tidak ada di daftar salah satu lapis. Misalnya kelas hex baru bisa membuat teks putih tampil
di atas latar putih pada tema terang.

## Aturan untuk kode baru (wajib)

- **Warna baru di file POS memakai token `--pos-*`, bukan hex.** Contoh: `bg-[var(--pos-surface)]`,
  `text-[var(--pos-text)]`, `text-[var(--pos-muted)]`, `border-[var(--pos-border)]`, `bg-[var(--pos-accent)]`. Daftar
  token ada di `globals.css`; kontras AA-nya dites di `pos-v6.test.ts`.
- Penjaga: `src/components/garage/pos/pos-color-classes.test.ts` menghitung kelas warna hex per file POS.
  - Jumlahnya **tidak boleh naik**. File POS baru wajib 0.
  - Kalau angkanya turun karena migrasi, perbarui `BASELINE` di tes itu.
- Status bermakna (lunas = hijau, habis/bahaya = merah, peringatan = amber) memakai token `--pos-success`,
  `--pos-accent`, `--pos-warning`.

## Harness piksel (bukti "tampilan tidak berubah")

`e2e/pos-theme-visual.spec.ts` memotret 6 layar di 5 tema kasir, jadi 30 gambar. Layarnya: katalog + keranjang,
dialog Bayar, Belum Bayar, Meja, Riwayat Struk, dan katalog HP 390. Saat memotret, jam dibekukan, sedangkan maskot
AYA dan indikator dev disembunyikan. Dua run tanpa perubahan kode menghasilkan **0 piksel beda**.

```bash
# folder di luar .e2e-data (server E2E menghapus .e2e-data tiap start)
POS_VISUAL_DIR=/tmp/pos-visual/before npx playwright test e2e/pos-theme-visual.spec.ts --project=desktop-1366 --trace off
# … ubah kode …
POS_VISUAL_DIR=/tmp/pos-visual/after npx playwright test e2e/pos-theme-visual.spec.ts --project=desktop-1366 --trace off
node scripts/pos-visual-diff.mjs /tmp/pos-visual/before /tmp/pos-visual/after   # gambar diff → /tmp/pos-visual/after/_diff
```

Batasan harness: harness hanya memakai preset OS bawaan (default akun seed). Preset OS lain dan dialog dari
komponen bersama (Kas Keluar/Masuk, Tutup Shift, laporan) belum dipotret.

## Rencana migrasi bertahap (belum dikerjakan)

1. Untuk tiap peran warna, buat token yang nilai gelapnya sama dengan hex asli dan nilai terangnya sama dengan target
   remap sekarang. Contoh: `--pos-l-line` (#34343c), `--pos-l-panel-deep` (#111116), `--pos-l-dim` (#b8b8bf).
2. Migrasi satu file kecil per PR, dimulai dari `pos-quick-retail.tsx` (25) dan `pos-event-bundles.tsx` (39).
   Kerjakan latar solid, border dan teks abu lebih dulu. `text-white`, warna aksen dan kelas ber-opacity punya
   pengecualian konteks, jadi digarap paling akhir.
3. Setiap PR wajib membawa harness piksel 5 tema dengan 0 selisih. Tambahkan pemotretan dengan minimal satu preset OS
   terang, lalu turunkan `BASELINE` di tes penjaga.
4. Hapus kelas dari daftar remap lapis 3 hanya setelah kelas itu tidak dipakai lagi di file POS **dan** komponen
   bersama.
