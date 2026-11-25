# Audit Bug & Konsep POS Garage yang Lebih Baik (Laptop/PC, keyboard-first, offline)

Tanggal: 24 Nov 2026 · Kode yang diaudit: `main` @ fd6fe88 · Status: **laporan & rencana, belum ada perubahan kode**.
Perbaikan dikerjakan per fase (bagian G) setelah Owner menyetujui fase tersebut.

## Context
Owner minta: (1) cek bug & kekurangan POS, (2) ide/konsep POS yang lebih baik — tampilan + alur kasir yang
mudah, lancar, tidak membingungkan, memakai prinsip anti-slop. Keputusan Owner (24 Nov 2026):
- **Tahap ini = ide & rencana saja**, belum ubah kode. Implementasi menunggu persetujuan per fase.
- Prioritas: **semua** (kecepatan, stabilitas/bug, tampilan, laporan/insight).
- Perangkat kasir: **Laptop/PC** (mouse + keyboard, kemungkinan scanner barcode) → desain **keyboard-first**.
- **Mode jual offline: masuk rencana.**

Sumber: audit kode `main` @ fd6fe88 (3 penjelajah: logika klien, alur server order/bayar, UI/UX), skill
`garage-pos`, `garage-kas` (invarian uang), `design-taste-frontend` (anti-slop), audit lama
`docs/pos-v6/GOD-PLUS-PLUS-AUDIT.md` (F-01..F-06 sebagian sudah diperbaiki 5 Nov).

## A. Bug yang ditemukan — sisi server (order & pembayaran)
(semua dari membaca kode, belum dijalankan; "terkonfirmasi" = alur dibaca lengkap)

| # | Sev | Lokasi | Masalah | Skenario nyata |
|---|---|---|---|---|
| S1 | **Tinggi** | `garage-service.ts:16307` `splitCustomerOrder` | Pisah bill tidak mengunci baris order (`findOutletOrder` tanpa `forUpdate`) | Waiter pisah bill bersamaan kasir Final Bayar → pelanggan tertagih dua kali untuk item yang dipindah; dua split bersamaan memindah qty yang sama 2× |
| S2 | **Tinggi** | `garage-service.ts:11189–11240` + `revertOrderPayment` 23912 | Setelah "kembalikan ke Pending", Final Bayar hanya menangkap SATU baris pembayaran split | Split Tunai 30rb + QRIS 20rb → revert → bayar ulang Tunai: order "Lunas", laci hanya +30rb/+20rb, satu baris tetap pending, QRIS bisa berlabel Tunai |
| S3 | **Tinggi** | `garage-service.ts:11119–11133` | Final Bayar tunai tidak memeriksa uang diterima < total (planTender hanya untuk non-tunai) | `cashReceived: 10000` untuk bill 50rb diterima, laci dicatat +50rb yang tidak pernah diterima |
| S4 | Sedang | `garage-service.ts:11754`, `api/orders/route.ts` | Kunci idempotensi POS dipakai ulang dengan isi berbeda → diam-diam mengembalikan order lama | Bug klien memakai kunci lama untuk keranjang baru → penjualan baru tidak tercatat padahal kasir lihat "sukses" (event checkout sudah punya fingerprint — tiru) |
| S5 | Sedang | `api/orders/open-bill/route.ts` | Bayar nanti tidak atomik (create & accept beda transaksi), idempotensi hanya di memori | Accept gagal → order nyangkut `pending_cashier`; retry/restart server → order dobel |
| S6 | Sedang | `garage-service.ts:24172` `deleteUnpaidInvoice` | Cek "belum bayar" di luar transaksi | Final Bayar masuk di sela cek → invoice LUNAS ikut terhapus lewat jalur "Hapus invoice" |
| S7 | Sedang | `garage-service.ts:12368` (+10957) | Potong stok baca `onHand` tanpa `FOR UPDATE`, tulis nilai absolut | Dua penjualan bersamaan bahan sama: 10→9 padahal harusnya 8 |
| S8 | Sedang | route orders/confirm/revert/open-bill/split/status | Semua error dikirim apa adanya sebagai 400 | Pesan DB (SQL/nama constraint) bisa sampai ke layar; error server jadi 400 bukan 500/409 |
| S9 | Sedang | `api/orders/route.ts` orderSchema | Tanpa batas: qty max, jumlah item, panjang `paymentMethod`/`tableLabel`; metode = string bebas | Qty 100.000 → overflow int4 `line_total`; metode "Cashless" terbaca tunai (cocok substring) |
| S10 | Rendah | `orders/[id]/payment/confirm|revert` | Cache 60 dtk per order id | Konfirmasi → revert → konfirmasi < 60 dtk: layar "Lunas", DB "Pending" |
| S11 | Rendah | `garage-service.ts:10566` | Aturan "delivery = QRIS saja" lolos bila metode tidak dikirim | Delivery tercatat Tunai |

Sudah aman (tidak perlu diubah): dua Final Bayar bersamaan (FOR UPDATE 10429), laci hanya lewat `postDrawerCash`
(bagian tunai saja), Owner tanpa shift ditolak tunai, split tender harus pas, harga dari server, harga bundle final.

## B. Bug sisi klien (`pos-view.tsx` kecuali disebut lain)
Tidak ada yang kritis: semua aturan tunai tetap ditolak server walau klien meloloskan.

| # | Sev | Lokasi | Masalah | Skenario nyata |
|---|---|---|---|---|
| K1 | **Tinggi** | 1281, 1329 | Batas maksimal diskon voucher (`voucherMaxDiscountPct`) tidak diterapkan di POS (server & menu member menerapkan) | Voucher 50% dengan batas 30%: layar total lebih kecil dari tagihan server → "Uang pas" ditolak "uang kurang"; untuk QRIS kasir menagih lebih kecil dari yang tercatat |
| K2 | **Tinggi** | `api/orders/open-bill` (=S5) | Bayar nanti anti-dobel hanya di memori 60 dtk | Respons hilang + retry setelah 60 dtk / instance lain → bill & tiket dapur dobel |
| K3 | Sedang-Tinggi | 8782–8787 → `submitOrder` 3950 | Bayar 1-tap "Uang pas" mengirim state lama (reset + ganti takeaway baru berlaku render berikutnya) | Setelah order dine-in, 1-tap take away mencetak chit "dine-in" + mengumumkan meja → dapur menyajikan di piring, bukan dibungkus; member/voucher lama ikut terkirim |
| K4 | Sedang | 8330, `pos-quick-retail.tsx:75`, dialog Final Bayar 5599 | Owner tanpa shift tetap ditawari Tunai (default) di Penjualan Langsung & Final Bayar | Kasir sudah menghitung uang lalu ditolak server — membingungkan |
| K5 | Sedang | 2672–2682 | Dialog Final Bayar ditutup sebelum request selesai; error muncul di panel lain; tanpa kunci idempotensi | Bayar gagal → nominal yang diketik hilang, kasir tidak melihat errornya di layar Belum Bayar |
| K6 | Sedang | `idempotency-client.ts:27`, 4026 | Retry setelah "status belum pasti" memakai kunci lama walau metode diganti, sukses tidak dicek metodenya | Percobaan Tunai sebenarnya tersimpan, kasir ganti QRIS → layar sukses, pelanggan bisa bayar dua kali |
| K7 | Sedang | 3826 | Bayar nanti di mode member hanya kirim nama (tanpa id/telepon); voucher/diskon dihapus diam-diam | Member tidak dapat poin |
| K8 | Rendah-Sedang | `pos/pos-event-bundles.tsx:162` | Paket Event tidak menandai gagal "belum pasti" | Ganti paket setelah error jaringan → bill dobel |
| K9 | Rendah | 2732, 2740 | Tunai waiter: kosong = uang pas | Bertentangan dengan aturan "nominal wajib" |
| K10 | Rendah | 4113; `pos-quick-retail.tsx:225` | Kerja setelah sukses ada di dalam `try` pembayaran | Bila refresh gagal, layar menyatakan bayar gagal padahal sudah lunas |
| K11 | Rendah | 3349; `pending-v6:457` | Gagal cetak slip kas ditelan; QRIS bisa dikonfirmasi tanpa gambar QRIS terpasang | — |
| K12 | Rendah | `pos-offline-*` | Antrean offline POS = kode mati + bug laten (item `syncing` yatim, 1 order/30 dtk, 409 retry selamanya) | Lihat F (konsep offline) |

Sudah aman: tombol Bayar/Uang pas/Penjualan Langsung anti dobel-klik, rumus total klien = server (service→PB1→
pembulatan, harga promo), shortcut keyboard tidak bocor ke input/dialog, semua akses localStorage ber-try/catch,
blind count untuk Kasir (perlu cek runtime: `expectedCash` shift terbuka masih terkirim ke klien).

Tambahan temuan saya: panel saran "sering dibeli bersama" berbasis data nyata (`pos-upsell-panel.tsx`) **tidak
dipasang**; label/strip "Bestseller" berasal dari **tag manual**, bukan data penjualan (melanggar prinsip anti-slop:
badge harus dari data).

Celah tes: perhitungan total klien (voucher/diskon/poin) belum diekstrak ke fungsi murni & dibandingkan dengan
server (akan menangkap K1), logika override 1-tap, idempotensi open-bill, alur Final Bayar, modul offline.

Diverifikasi sendiri: K1 benar — server memakai `capVoucherDiscountBySettings` (`src/lib/garage-billing.ts:77`),
POS (`pos-view.tsx:1281`) memakai diskon mentah.

## C. Kekurangan UI/UX & performa
| # | Sev | Lokasi | Masalah → arah perbaikan |
|---|---|---|---|
| U1 | **Tinggi (uang tampil salah)** | `pos-view.tsx:8708–8713` | Baris **"Pembulatan" tercetak dua kali** (terselip di dalam baris Pajak + lagi di 8716) — **terverifikasi**. Hapus blok bersarang |
| U2 | Tinggi | `pos-view.tsx:5907` | Pesan aksi (mis. "item HABIS") disembunyikan jadi ikon `title` di layar < 1200px, tanpa `aria-live` → klik terasa tidak terjadi apa-apa. Ganti toast `role="status"` |
| U3 | Tinggi | `pos-view.tsx:503–9625` | Satu komponen 9.100 baris: 192 `useState`, 31 `useEffect`; seluruh layar render ulang tiap 10–12 dtk (polling 4 endpoint + `setTableLiveUpdatedAt`) → lambat di laptop kasir. Pecah panel + memo, setState hanya bila data berubah |
| U4 | Sedang | alur dine-in | Dine-in tunai ±8 klik (Bayar → Lanjut → meja → pelanggan → pembayaran → nominal → final), tidak bisa lompat walau meja sudah dipilih; Bayar nanti tersembunyi di langkah pembayaran; split di langkah 1 wizard |
| U5 | Sedang | `pos-view.tsx:8308`, `pos-dialogs.tsx:1076` | Scanner/keyboard: Enter diabaikan saat pencarian belum "settle"; fokus tidak kembali ke kolom cari setelah dialog varian (scan berikutnya hilang); barcode tak dikenal bisa menambah item salah (cocok substring) |
| U6 | Sedang | `pos-view.tsx:3367,1147` | Strip Favorit berpindah urutan tiap klik (tombol bergeser di bawah kursor) |
| U7 | Sedang | `pos-dialogs.tsx:1160` | Riwayat struk tanpa kolom cari → void/cetak ulang harus scroll |
| U8 | Sedang | keranjang `:8608–8672` | Baris keranjang ±130px → di layar 768px tinggi hanya ±2 item terlihat; tombol keranjang 28–36px (kecil untuk mouse/sentuh) |
| U9 | Sedang | `pos-v6.css` (288 `!important`), `:720–755` | Remap tema pakai selector substring kelas (`[class*="text-white"]`) — rapuh & berat; masih ada hex lama, hijau/biru generik (`#22c55e`, `#3b82f6`) di luar palet Garage |
| U10 | Sedang | `--pos-fs` hanya di 11 aturan | Preferensi ukuran teks hampir tidak berlaku (keranjang, dialog bayar, Belum Bayar pakai px tetap) |
| U11 | Sedang | bundle | Dialog bayar, laporan, chat, printer, tema dimuat sekaligus; foto menu ukuran penuh tanpa thumbnail |
| U12 | Rendah | beberapa | Tombol "Ringkasan" (kembali) tidak berfungsi (`:9225`); empty state menu menyesatkan; status titik nav hanya warna; tombol QC `contents` (fokus tak terlihat) |

## D. Konsep POS baru — "Kasir Lancar" (anti-slop, keyboard-first, laptop/PC)
Prinsip (dari skill anti-slop, disesuaikan untuk alat operasional): **satu aksi utama per keadaan**, tombol
menyebut persis apa yang terjadi ("Terima Rp100.000 · kembali Rp12.000"), bahasa kasir yang lugas (tanpa
"Konfirmasi" generik), **tidak ada angka/badge yang tidak berasal dari data**, tanpa dekorasi/animasi yang
tidak membantu, satu sistem token (palet Garage: aspal, chrome, merah, amber).

Tata letak laptop (1366×768 / 1920×1080) — satu layar, tanpa wizard untuk kasus umum:
```
┌──────────────────────────────────────────────┬─────────────────────────────┐
│ [F1] Cari / scan / kode singkat ________  ⏎  │ KERANJANG  Take away · [F2] │
│ Kategori: Semua Bar Dapur Lainnya            │ 2× Coffee Latte Cold  44.000│
│ Favorit (urutan beku per shift)              │ 1× Nasi Goreng        30.000│
│ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐         │ ── Subtotal / Layanan / Pajak│
│ │item││item││item││item││item││item│ grid    │ TOTAL           Rp 82.500   │
│ └────┘└────┘└────┘└────┘└────┘└────┘         │ [1]Tunai [2]QRIS [3]Transfer │
│ (↑↓←→ pilih, ⏎ tambah, 3*cl = 3 Coffee Latte)│ Uang: [ 100.000 ] Pas 50k 100k│
│                                              │ ▶ Terima Rp100.000 · kembali │
│ toast: "Coffee Latte ditambahkan"            │   Rp17.500  (⏎)   [F8] Nanti │
└──────────────────────────────────────────────┴─────────────────────────────┘
```
Ide utama:
1. **Cari selalu fokus** (F1/Esc kembali ke cari): nama, kode singkat, barcode → ⏎ tambah; `3*cl` = qty 3;
   panah untuk memilih hasil; `+`/`−` ubah qty baris terakhir; barcode tak dikenal = pesan "kode tidak dikenal".
2. **Pembayaran menyatu di panel keranjang** (bukan wizard 4 langkah): F9 fokus ke panel bayar, angka 1–4 pilih
   metode, ketik nominal atau tombol pecahan cepat, ⏎ selesai. Meja (F2) & pelanggan (F3) dipilih kapan saja,
   tidak memblok. Dine-in tunai: 8 klik → ±3 tombol.
3. **Bayar nanti (F8) & Pisah bill** tampil sebagai aksi sekunder di footer keranjang.
4. **Toast jelas** untuk setiap aksi + kilatan singkat pada baris yang baru ditambah; peringatan habis/error
   tidak pernah tersembunyi.
5. **Lembar pintasan** (`?`) + label tombol berisi tombolnya (F9 Bayar, F6 Belum Bayar) — dipelajari tanpa
   training.
6. **Riwayat struk dengan cari** (no order / nama / nominal) untuk cetak ulang & ajukan void cepat.
7. **Keranjang ringkas**: satu baris per item (qty di samping nama, catatan di balik ikon), target klik ≥ 40px.
8. **Tampilan bersih**: hapus hack selector substring & sebagian besar `!important`, semua warna dari token
   `--pos-*`, tanpa hijau/biru generik, ukuran teks preferensi berlaku di seluruh layar.
9. **Cepat**: pecah `PosView` jadi panel ber-memo (Katalog, Keranjang, PanelBayar, TopBar), polling dipindah ke
   panel yang memakainya, dialog & modul jarang dipakai di-lazy-load, thumbnail foto.

## E. Ide laporan & insight (hanya dari data nyata)
- **Bestseller dari penjualan nyata** 7 hari (ganti tag manual), dihitung server, label "Terlaris minggu ini".
- **Pasang panel "sering dibeli bersama"** (`pos-upsell-panel.tsx`, sudah ada, berbasis `pairCount`) di keranjang.
- **Ringkasan shift untuk kasir** (tanpa angka laci — blind count tetap): jumlah transaksi, item terjual,
  belum bayar, rata-rata waktu per transaksi.
- **Insight Owner**: jam sibuk per hari, nilai rata-rata transaksi, item sering habis, kecepatan kasir
  (detik per transaksi), tingkat void/refund per kasir dengan kata netral (bukan tuduhan) — memakai laporan yang
  sudah ada (`sales-report.tsx`, `cashier-shift-report.tsx`) sebagai dasar, bukan modul baru.

## F. Konsep Mode Jual Offline (diminta Owner)
Yang sudah ada: `src/lib/pos-offline-queue.ts` (IndexedDB, maks 50, kunci idempotensi per order),
`pos-offline-sync.ts` (worker retry), `pos-offline-banner.tsx` — **tidak dipasang** di POS. Pola yang sudah
berjalan di Waiter (`waiter-offline-queue/sync` + `waiter-offline-banner` di `waiter-view.tsx`) dipakai sebagai
contoh.

Aturan yang diusulkan (uang tetap aman, sesuai `garage-kas`):
1. **Hanya Tunai saat offline.** QRIS/Transfer/E-Wallet, voucher, poin member, diskon manual ber-approval,
   Bayar nanti, split bill, void/refund → nonaktif dengan alasan yang jelas ("butuh koneksi").
2. **Harga dari snapshot menu terakhir** (disimpan di perangkat + versi harga). Saat sinkron, server memakai
   harga snapshot itu (penjualan sudah terjadi, uang sudah diterima); selisih dengan harga terkini dicatat
   untuk ditinjau, tidak ditolak.
3. **Nomor sementara** `OFF-<perangkat>-<urut>` di struk + tulisan "Struk sementara — nomor resmi menyusul".
   Nomor resmi `POS-…` dibuat server saat sinkron; struk resmi bisa dicetak ulang / dikirim via QR invoice.
4. **Tiket Bar/Dapur saat offline** dicetak lokal (print server laptop `scripts/thermal-print-server.js` /
   cetak browser), karena layar Production tidak menerima order tanpa server. Tiket di layar Production muncul
   setelah sinkron dengan tanda "offline, sudah dicetak" agar tidak dibuat dua kali.
5. **Server: endpoint impor penjualan offline** (bukan `createOrder` biasa): terima `soldAt`, `offlineNo`,
   snapshot harga, `cashSessionId` saat jual; lewati cek stok/ketersediaan (barang sudah diserahkan), tetap
   `postDrawerCash` ke shift tempat penjualan terjadi, potong stok via pipa yang sama, audit `offline_sale`.
   Idempotensi pakai kunci + **sidik isi** (perbaikan S4) — tidak pernah dobel.
6. **Tutup shift diblok** selama antrean offline di perangkat itu belum kosong (pesan: "N penjualan offline
   belum terkirim").
7. Batas: maks 50 order / 8 jam offline; banner merah tetap tampil dengan jumlah antrean; Owner dapat
   notifikasi bila ada penjualan offline gagal sinkron.
8. Gagal sinkron permanen (data rusak) → tampil di panel "Perlu ditinjau" Owner/Manajer, tidak hilang.

Keputusan Owner yang dibutuhkan: batas jam/jumlah offline, boleh QRIS statis dengan cek manual atau tidak.

## G. Urutan kerja (tiap fase = PR terpisah, dikerjakan hanya setelah Owner bilang "lanjut fase X")
Tahap sekarang: **ide & rencana saja** (permintaan Owner). Dokumen ini adalah hasil tahap tersebut; belum ada
perubahan kode. Fase berikut dikerjakan hanya setelah Owner bilang "lanjut fase X".

**Fase 1 — Bug uang & stabilitas (paling penting, kecil-kecil, aman):**
U1 Pembulatan dobel · K1 batas voucher (pakai `capVoucherDiscountBySettings`) · S3 Final Bayar tunai < total
ditolak (pakai `planTender`/`tender-guard.ts`) · S2 bayar ulang setelah revert menangkap semua baris · S1 kunci
baris di `splitCustomerOrder` (`findOutletOrder(..., { forUpdate: true })`) · S6 cek "belum bayar" di dalam
transaksi · S7 potong stok `FOR UPDATE`/update relatif · S4+K2+S5 idempotensi dengan sidik isi (tiru
`eventCheckoutFingerprint`) + simpan `clientRequestKey` di open-bill + create&accept satu transaksi · K3 1-tap
pakai nilai efektif (bukan state lama) · K5/K6 dialog Final Bayar tetap terbuka sampai sukses + kunci + cek metode
hasil · K4 Owner tanpa shift tidak ditawari Tunai · S8 error klien tanpa SQL, kode 409/500 tepat · S9 batas
Zod (qty/item/panjang, metode = enum) · S10 cache konfirmasi per versi status · S11 · K7–K11.
Setiap bug: tes yang gagal dulu → perbaikan → tes lulus (vitest PGlite integrasi + property test yang ada).

**Fase 2 — Alur kasir keyboard-first (konsep D.1–D.6):** cari selalu fokus, Enter andal, scanner, pembayaran
menyatu di keranjang, F8 Bayar nanti, toast, lembar pintasan, cari riwayat struk, favorit beku per shift.
Logika transaksi tetap di `pos-view.tsx` (aturan POS V6: tidak ada logika transaksi kedua).

**Fase 3 — Tampilan anti-slop & performa (D.7–D.9):** pecah `PosView`, keranjang ringkas, bersihkan token/
`!important`, ukuran teks berlaku penuh, lazy-load, thumbnail. Tidak mengubah alur uang.

**Fase 4 — Mode jual offline (bagian F):** perbaiki bug laten antrean (K12), endpoint impor penjualan offline,
pasang di POS, blokir tutup shift bila antrean belum kosong.

**Fase 5 — Insight & laporan (bagian E).**

## H. Keputusan Owner yang dibutuhkan sebelum fase terkait
1. Peta tombol keyboard final (usulan di D) — boleh mengubah F-key yang sudah dihafal kasir?
2. Ganti "Bestseller" manual → otomatis dari data penjualan?
3. Offline: batas jam & jumlah order; QRIS statis dengan cek manual boleh/tidak.
4. "Uang pas" 1-tap tetap dipertahankan (keputusan Owner 5 Nov) — tetap?

## I. Verifikasi (per fase)
- `npx vitest run <file terkait>` untuk tiap bug (repro gagal dulu, lalu lulus), plus
  `src/lib/pos-financial-invariants.property.test.ts` & tes integrasi PGlite yang ada.
- Tes baru: perhitungan total klien diekstrak ke fungsi murni dan dibandingkan dengan `calculateOrderBilling`
  (menangkap K1), override 1-tap, idempotensi open-bill (restart = memori kosong), split vs Final Bayar
  bersamaan, revert → konfirmasi pada split tender.
- E2E Playwright: perluas `e2e/pos-guardian.spec.ts` & `pos-pending.spec.ts` dengan alur keyboard penuh
  (cari → Enter → F9 → nominal → Enter) dan offline (`context.setOffline(true)` → jual tunai → online → tidak
  dobel).
- `node scripts/ui-check.mjs /pos` di 1366×768, 1920×1080 (laptop kasir) + 390; `npm run lint`,
  `npm run db:generate`, `npm run build`, `scripts/release-check.sh` sebelum PR.
