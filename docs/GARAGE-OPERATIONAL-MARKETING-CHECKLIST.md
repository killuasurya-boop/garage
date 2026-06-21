# GARAGE Operational Marketing Checklist

Dokumen ini dipakai untuk membuat GARAGE siap operasional sekaligus siap dipasarkan. Prinsip utamanya: jangan kirim traffic besar sebelum alur order, pembayaran, produksi, dan follow-up customer terbukti stabil.

Mulai dari `docs/GARAGE-OPERATIONAL-MARKETING-START-HERE.md` untuk urutan eksekusi lintas tim.

## Cara Pakai

- Checklist ini adalah dokumen kerja lintas tim: owner, operasional, kasir, kitchen/barista, marketing, dan developer.
- Status hanya boleh diubah menjadi selesai jika ada evidence: screenshot, command output, foto, URL, hasil smoke test, atau sign-off owner.
- Jika ada gap teknis atau operasional, catat di `docs/PILOT-ISSUE-LOG.md`.
- Jika gap berdampak ke campaign, jangan jalankan traffic berbayar sampai status kembali `GO`.
- Review checklist ini setiap hari selama soft launch 14 hari.

## Current Execution Board

| Area | Status | Owner | Evidence | Next Action |
| --- | --- | --- | --- | --- |
| Positioning | Draft | Owner + Marketing | Dokumen ini | Kunci angle utama dan kalimat janji GARAGE |
| Landing Page | In Progress | Marketing + Developer | `design-system/pages/landing.md`, current worktree | Verifikasi CTA, menu, Maps, WA, mobile screenshot |
| Google Maps | Draft | Marketing | `docs/GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md` | Lengkapi profile, foto, jam buka, link order, dan smoke test dari HP |
| WhatsApp Order | Draft | Marketing + Kasir | `docs/GARAGE-WHATSAPP-ORDER-SOP.md` | Isi nomor final, link Maps, payment, dan test chat order |
| POS/QR Flow | Needs Re-Verification | Operasional + Developer | `docs/FINAL-GO-LIVE-SIGNOFF.md` lama | Smoke test ulang walk-in, QR, WA, promo, closing |
| Promo Profit | Draft | Owner + Marketing | `docs/GARAGE-PROMO-PROFIT-WORKSHEET.md` | Isi HPP/base cost, margin, periode, limit, dan approval owner |
| Content Engine | Draft | Marketing | `docs/GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md` | Isi foto/menu final dan mulai produksi aset |
| Staff SOP | Draft | Operasional | `docs/GARAGE-STAFF-SOFT-LAUNCH-TRAINING-CHECKLIST.md` | Jalankan simulasi role dan isi sign-off staff |
| Dashboard Profit | Draft | Owner + Developer | `docs/GARAGE-DAILY-OWNER-REPORT-TEMPLATE.md` | Isi laporan harian dari data POS/WA/Maps/promo saat soft launch |

Status yang dipakai:

- `Not Started`: belum ada pekerjaan nyata.
- `Draft`: konsep sudah ada, belum diuji.
- `In Progress`: sedang dikerjakan.
- `Needs Re-Verification`: pernah ada bukti lama, perlu dicek ulang sebelum campaign.
- `Blocked`: tidak bisa lanjut tanpa keputusan/fix.
- `GO`: sudah terbukti dan aman dipakai operasional-marketing.

## RACI Ringkas

| Workstream | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| Positioning dan offer | Marketing | Owner | Operasional | Staff |
| Landing page | Developer + Marketing | Owner | Product/design | Staff |
| Google Maps dan local SEO | Marketing | Owner | Kasir | Staff |
| WhatsApp order | Marketing + Kasir | Manager Operasional | Owner | Kitchen |
| POS/QR/payment | Developer + Operasional | Owner | Kasir, Kitchen | Marketing |
| Staff SOP | Manager Operasional | Owner | Developer | Semua staff |
| Dashboard profit | Developer + Owner | Owner | Finance/Kasir | Marketing |
| Soft launch review | Manager Operasional | Owner | Semua lead | Semua staff |

## Aksi 72 Jam Pertama

### Hari 1: Kunci Fondasi

- [ ] Owner memilih positioning utama: Daily Coffee, Work Spot, Signature Coffee & Food, atau kombinasi terbatas.
- [ ] Owner memilih 3 menu signature yang aman dipromosikan.
- [ ] Marketing mengumpulkan foto/aset GARAGE yang boleh dipakai.
- [ ] Developer/marketing verifikasi landing page mobile dan desktop.
- [ ] Kasir dan operasional test 3 order: walk-in, QR meja, takeaway manual.
- [ ] Semua issue masuk ke `docs/PILOT-ISSUE-LOG.md`.

### Hari 2: Rapikan Channel Jualan

- [ ] WhatsApp Business diisi lengkap.
- [ ] Template order, konfirmasi, siap ambil, dan komplain disiapkan.
- [ ] Google Maps dicek: alamat, jam, nomor, link, foto, kategori.
- [ ] Landing page CTA dicek: menu, WhatsApp, Maps.
- [ ] Promo pembuka dihitung margin dan tanggalnya.
- [ ] Staff latihan menjawab pertanyaan customer.

### Hari 3: Simulasi Campaign Kecil

- [ ] Jalankan simulasi 10 order campuran.
- [ ] Test stok habis dan menu unavailable.
- [ ] Test promo di POS.
- [ ] Test closing dan laporan harian owner.
- [ ] Publish konten soft-launch pertama jika gate aman.
- [ ] Putuskan status: `GO`, `CONDITIONAL`, atau `NO-GO`.

## Evidence Log

Isi log ini setiap kali checklist dinaikkan status.

| Tanggal | Area | Evidence | Hasil | Catatan |
| --- | --- | --- | --- | --- |
| 2026-06-16 | Operational Marketing Checklist | Dokumen dibuat | Draft | Perlu verifikasi lapangan dan runtime sebelum GO |

## 0. Definition of Ready

GARAGE boleh dinyatakan siap operasional-marketing jika semua gate berikut hijau:

- [ ] Customer bisa menemukan GARAGE dari Google Maps, landing page, QR, Instagram, dan WhatsApp.
- [ ] Customer bisa melihat menu, harga, jam buka, lokasi, dan cara pesan tanpa bertanya manual.
- [ ] Customer bisa order dari QR/meja/WA/walk-in dengan alur yang jelas.
- [ ] Kasir bisa menerima, mengubah, membayar, membatalkan, dan menutup order.
- [ ] Barista/kitchen menerima ticket dan mengubah status sampai selesai.
- [ ] Owner/manager bisa melihat omzet, transaksi, menu terlaris, channel order, dan masalah harian.
- [ ] Promo aktif punya aturan jelas dan tidak merusak margin.
- [ ] Staff tahu SOP soft launch, komplain, refund, order salah, dan stok habis.
- [ ] Landing page, Google Maps, WhatsApp, dan media sosial mengarah ke aksi yang sama.

## 1. Positioning Utama

Pilih satu posisi utama agar marketing tidak kabur.

- [ ] Angle utama dipilih: `Daily Coffee`, `Work Spot`, `Signature Coffee & Food`, atau kombinasi terbatas.
- [ ] Audience utama ditentukan: pekerja sekitar, mahasiswa, komunitas motor, keluarga, atau customer takeaway.
- [ ] Momen beli utama ditentukan: pagi, lunch break, sore, malam, meeting kecil, atau nongkrong.
- [ ] Janji utama ditulis dalam satu kalimat.
- [ ] Bukti nyata disiapkan: menu signature, foto tempat, review, fasilitas, jam buka, lokasi, atau promo.
- [ ] Hal yang tidak boleh diklaim dicatat.

Rekomendasi awal:

```txt
GARAGE = Daily Coffee + Work Spot.
Janji: tempat ngopi harian yang praktis untuk order cepat, kerja ringan, dan nongkrong santai.
```

## 2. Landing Page Public

Rujukan desain: `design-system/pages/landing.md`.

- [ ] Hero menampilkan brand GARAGE sebagai sinyal pertama.
- [ ] Hero memakai foto/aset GARAGE, bukan gambar brand lain.
- [ ] Headline jelas: `GARAGE Coffee` atau penawaran literal.
- [ ] Subcopy menjelaskan momen: ngopi harian, meeting kecil, order cepat, atau signature menu.
- [ ] CTA utama maksimal 2: `Lihat Menu`, `Pesan via WhatsApp`, `Buka Maps`, atau `Reservasi`.
- [ ] Menu unggulan hanya 6-8 item untuk halaman depan.
- [ ] Setiap item unggulan punya nama, harga, kategori, dan status promo/rekomendasi.
- [ ] Jam buka, alamat, Google Maps, dan kontak terlihat tanpa scroll terlalu jauh.
- [ ] Section meja/QR/order digital menjelaskan cara pesan.
- [ ] Testimoni atau review tampil jika sudah ada sumber nyata.
- [ ] Semua gambar dikonversi ke WebP dan disimpan di folder publik yang stabil.
- [ ] Mobile 390x844 aman: tidak ada text clipping, overflow, tombol tumpang tindih.
- [ ] Desktop 1366x900 aman.

Evidence wajib:

- [ ] Screenshot desktop.
- [ ] Screenshot mobile.
- [ ] Smoke test CTA WhatsApp.
- [ ] Smoke test CTA Maps.
- [ ] Smoke test menu dari customer view.

## 3. Google Maps dan Local SEO

Google Maps harus diperlakukan sebagai landing page kedua.

- [ ] Nama bisnis konsisten dengan brand.
- [ ] Kategori utama benar.
- [ ] Alamat final benar.
- [ ] Pin lokasi benar.
- [ ] Jam buka final.
- [ ] Nomor WhatsApp aktif.
- [ ] Link landing page aktif.
- [ ] Foto exterior/interior/menu/produk minimal 12 foto.
- [ ] Menu atau katalog dasar tersedia.
- [ ] Deskripsi bisnis memuat keyword lokal yang natural.
- [ ] Template minta review setelah transaksi tersedia.
- [ ] SOP respon review positif/negatif tersedia.

Target 30 hari:

- [ ] Minimal 30 review nyata.
- [ ] Rating dijaga minimal 4.6.
- [ ] Semua review negatif dibalas maksimal 24 jam.

## 4. WhatsApp Order System

- [ ] Nomor WA bisnis final.
- [ ] Profil WA Business lengkap: alamat, jam, katalog, link website.
- [ ] Auto-reply jam buka dan cara order.
- [ ] Template order dine-in/takeaway.
- [ ] Template konfirmasi pembayaran.
- [ ] Template order siap/diambil.
- [ ] Template komplain/refund.
- [ ] Link CTA landing page langsung membuka pesan order yang rapi.
- [ ] Staff tahu siapa yang menjawab WA saat jam ramai.

Template awal CTA:

```txt
Halo GARAGE, saya mau pesan:
Nama:
Order:
Dine-in/Takeaway:
Jam ambil:
Catatan:
```

## 5. Offer dan Promo Profit

Promo harus menaikkan transaksi atau repeat, bukan hanya ramai.

- [ ] 3 menu signature dipilih.
- [ ] 1 paket pagi dibuat.
- [ ] 1 paket lunch/kerja dibuat.
- [ ] 1 promo repeat dibuat.
- [ ] Aturan promo jelas: tanggal, jam, item, limit, margin minimum.
- [ ] Staff tahu cara input promo di POS.
- [ ] Promo muncul di landing page, WA, Google Maps post, dan Instagram.
- [ ] Promo dihentikan jika margin turun di bawah batas.

Offer awal yang disarankan:

- [ ] Morning Set: coffee + snack.
- [ ] Work Break Set: coffee + light meal.
- [ ] Signature Trio: 3 menu unggulan untuk konten dan landing page.
- [ ] Repeat Card: beli 5 gratis 1 atau reward member.

## 6. Content Engine 30 Hari

Konten harus mendukung transaksi, bukan sekadar ramai feed.

- [ ] Kalender konten 30 hari dibuat.
- [ ] 3 pillar konten dipilih: produk, suasana, bukti/customer.
- [ ] 12 foto produk siap.
- [ ] 8 foto suasana siap.
- [ ] 6 video pendek proses/menu siap.
- [ ] 4 konten promo siap.
- [ ] 4 konten review/customer moment siap.
- [ ] 4 konten lokasi/jam/akses siap.
- [ ] Semua konten mengarah ke CTA yang sama.

Ritme minimal:

- [ ] Instagram feed 3x per minggu.
- [ ] Story harian saat buka.
- [ ] Reels 2x per minggu.
- [ ] Google Maps post 1x per minggu.

## 7. POS, QR, dan Order Flow

Rujukan: `docs/GO-LIVE-FINAL-CHECKLIST.md` dan `docs/PILOT_LAUNCH_CHECKLIST.md`.

- [ ] Menu aktif di POS sama dengan menu publik.
- [ ] Harga POS sama dengan landing page.
- [ ] QR meja mengarah ke halaman customer yang benar.
- [ ] Order QR masuk ke kasir.
- [ ] Kasir bisa accept/reject order QR.
- [ ] Order masuk ke kitchen/barista.
- [ ] Status order jelas: received, processing, ready, done/cancelled.
- [ ] Payment cash berjalan.
- [ ] Payment QRIS/manual transfer punya SOP konfirmasi.
- [ ] Receipt atau bukti order bisa diberikan.
- [ ] Closing shift berhasil.
- [ ] Audit log mencatat aksi kritis.

Smoke test wajib sebelum campaign:

- [ ] Walk-in cash order.
- [ ] Dine-in QR order.
- [ ] Takeaway WA order.
- [ ] Promo order.
- [ ] Order dibatalkan.
- [ ] Item out-of-stock.
- [ ] Closing kasir.

## 8. Staff SOP dan Training

- [ ] Role staff final: owner, manager, kasir, barista/kitchen, waiter, inventory, marketing.
- [ ] Akun staff dibuat.
- [ ] Password default diganti.
- [ ] Kasir latihan open shift, order, payment, void, closing.
- [ ] Barista/kitchen latihan accept ticket, ready, delivered.
- [ ] Marketing tahu menu yang boleh dipromosikan.
- [ ] Staff tahu jawaban standar untuk pertanyaan harga, jam, lokasi, promo.
- [ ] SOP komplain ditulis.
- [ ] SOP refund/void ditulis.
- [ ] SOP stok habis ditulis.
- [ ] SOP internet/printer/server bermasalah ditulis.

## 9. Dashboard Profit Harian

Setiap hari owner harus melihat angka ini.

- [ ] Omzet harian.
- [ ] Jumlah transaksi.
- [ ] Average order value.
- [ ] Menu terlaris.
- [ ] Jam ramai.
- [ ] Channel order: walk-in, QR, WA, delivery/manual.
- [ ] Promo terpakai.
- [ ] Payment split: cash, QRIS, transfer.
- [ ] Void/refund.
- [ ] Stok kritis.
- [ ] Komplain.
- [ ] Repeat customer/member.

Target awal:

- [ ] Laporan harian dikirim ke owner setiap closing.
- [ ] Laporan mingguan membandingkan omzet, transaksi, promo, dan menu.
- [ ] Keputusan promo minggu berikutnya berdasarkan data, bukan feeling.

## 10. Soft Launch 14 Hari

### Hari 1-3: Operational Audit

- [ ] Audit POS.
- [ ] Audit QR order.
- [ ] Audit menu dan harga.
- [ ] Audit pembayaran.
- [ ] Audit landing page.
- [ ] Audit Google Maps.
- [ ] Audit WhatsApp.
- [ ] Catat blocker di issue log.

### Hari 4-6: Fix dan Setup Marketing

- [ ] Fix blocker POS/QR/payment.
- [ ] Rapikan landing page.
- [ ] Upload foto final.
- [ ] Setup WA template.
- [ ] Setup Google Maps.
- [ ] Pilih menu signature.
- [ ] Buat promo pembuka.

### Hari 7-10: Internal UAT

- [ ] Simulasi 20 order campuran.
- [ ] Simulasi jam ramai.
- [ ] Simulasi stok habis.
- [ ] Simulasi komplain.
- [ ] Simulasi refund/void.
- [ ] Simulasi closing.
- [ ] Semua temuan dicatat dan diberi owner.

### Hari 11-14: Soft Launch Public

- [ ] Publish landing page.
- [ ] Publish Google Maps update.
- [ ] Publish promo.
- [ ] Jalankan konten harian.
- [ ] Minta review customer.
- [ ] Evaluasi angka harian.
- [ ] Putuskan GO/NO-GO campaign lebih besar.

## 11. Go / No-Go Marketing

GO jika:

- [ ] Landing page dan CTA berjalan.
- [ ] Google Maps siap.
- [ ] WA order siap.
- [ ] POS dan QR order stabil.
- [ ] Staff bisa handle order tanpa owner turun tangan terus.
- [ ] Menu dan harga konsisten.
- [ ] Promo punya margin aman.
- [ ] Dashboard harian tersedia.

NO-GO jika:

- [ ] QR salah meja atau order tidak masuk.
- [ ] Payment tidak jelas.
- [ ] Staff belum paham alur.
- [ ] Menu publik tidak sama dengan POS.
- [ ] Landing page CTA rusak.
- [ ] Google Maps belum benar.
- [ ] Tidak ada SOP komplain.
- [ ] Owner tidak bisa melihat angka harian.

## 12. Output yang Harus Ada

- [ ] Landing page public final.
- [ ] Google Maps profile final.
- [ ] WhatsApp Business profile final.
- [ ] Menu signature list.
- [ ] Promo 30 hari.
- [ ] Content calendar 30 hari.
- [ ] SOP order dan komplain.
- [ ] Staff training checklist.
- [ ] Daily owner dashboard.
- [ ] Pilot issue log.
- [ ] Final go-live signoff.

## 13. Rujukan Internal

- `design-system/pages/landing.md`
- `docs/GARAGE-OPERATIONAL-MARKETING-MANIFEST.md`
- `docs/GARAGE-OPERATIONAL-MARKETING-START-HERE.md`
- `docs/GO-LIVE-FINAL-CHECKLIST.md`
- `docs/PILOT_LAUNCH_CHECKLIST.md`
- `docs/PILOT-ISSUE-LOG.md`
- `docs/FINAL-GO-LIVE-SIGNOFF.md`
- `docs/GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md`
- `docs/GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md`
- `docs/GARAGE-PROMO-PROFIT-WORKSHEET.md`
- `docs/GARAGE-STAFF-SOFT-LAUNCH-TRAINING-CHECKLIST.md`
- `docs/GARAGE-DAILY-OWNER-REPORT-TEMPLATE.md`
- `docs/GARAGE-WHATSAPP-ORDER-SOP.md`
- `GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md`
