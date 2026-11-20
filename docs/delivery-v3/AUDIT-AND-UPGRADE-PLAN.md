# Garage Delivery V3 — audit dan rencana upgrade

Status: audit selesai; implementasi lintas modul menunggu persetujuan rencana Owner.
Basis: `main` commit `380956c8011d323c7a88428aaf59b6b8a642bbf5`, 20 November 2026.
Cakupan audit: sumber, kontrak endpoint, skema, dan pengujian PGlite terisolasi. Tidak mengakses database atau akun produksi.
Dokumen ini bukan klaim bahwa V3 sudah dibangun atau diterapkan.

## Ringkasan keputusan

Bangun di atas orders, payments, kitchen_tickets, WMS, dan notifikasi yang sudah ada.
Jangan membuat checkout, transaksi, ledger, atau mesin status kedua.
Urutan yang direkomendasikan: **keamanan dan konsistensi → monitoring Owner/QC → rekomendasi dispatch dan AYA → otomatisasi → integrasi pembayaran lanjutan**.

Temuan paling mendesak adalah batas akses outlet dan ketidaksamaan aturan transisi antara API kurir dengan API status order lama. Keduanya berhasil direproduksi pada database uji.

## Peta kemampuan saat ini

| Area V3 | Sudah ada, beserta sumber | Kekurangan yang perlu ditangani |
|---|---|---|
| Smart Order | Validasi delivery QRIS, alamat/WA, minimum order, ongkir/radius (`garage-service.ts:9926`, `garage-delivery-rules.ts:180`); pembayaran mendahului produksi | Tarif adalah jarak garis lurus, bukan jarak jalan; fallback flat bila GPS tidak tersedia. Keputusan bisnis ini harus terlihat pada quote, bukan diganti diam-diam |
| POS, Bar/Dapur, inventory | Pelunasan dikunci per order; jalur tiket dan pengurangan resep yang sama (`garage-service.ts:10424`, `10898`) | Pertahankan satu jalur mutasi dan buktikan retry tidak menggandakan tiket, stok, atau pembayaran |
| Dispatch | Availability, assign manual, self-claim; kunci order dan profil kurir; satu pekerjaan aktif (`garage-courier.ts:194`, `206`, `367`) | Belum ada pemeringkatan jarak/kapasitas/prioritas. GPS kurir hanya ada pada order yang sedang dibawa, bukan lokasi idle yang dapat dipakai untuk ranking |
| Live tracking | GPS kira-kira 15 detik, invoice polling 8 detik, peta serta umur posisi, notifikasi progress (`courier-view.tsx:151`, `invoice-live-tracker.tsx:42`, `order-progress.tsx:168`) | Belum ada ETA perjalanan berbasis rute atau kontrak freshness yang menonaktifkan rekomendasi ketika posisi basi |
| Realtime staf | Event bus produksi + fallback polling 20/60 detik (`production-events.ts`, `courier-view.tsx:118`) | Bus hanya dalam satu proses. Tidak menjamin distribusi lintas worker/container; polling harus tetap bekerja dan kesehatan sinkronisasi harus terlihat |
| Dashboard Owner | Board antaran, daftar kurir, detail order pada POS | Belum ditemukan satu dashboard delivery khusus dengan agregat pembayaran, keterlambatan per tahap, omzet/ongkir terpisah, dan performa kurir |
| AYA | Panduan order delivery dan infrastruktur tool/AI sudah ada | Belum ditemukan mesin indikator delivery dengan data pendukung, alasan rekomendasi, deduplikasi peringatan dan evaluasi ETA |
| Pembayaran | Delivery QRIS dan validasi kasir; ongkir terpisah pada laporan (`garage-delivery.integration.test.ts:409`) | COD saat ini sengaja ditolak. Rekonsiliasi kas kurir baru relevan jika Owner menyetujui perubahan kebijakan tersebut |
| Customer experience | Infrastruktur member, voucher, points, invoice/tracking, pesan pelanggan | Repeat delivery harus menjadi draft pesanan dari katalog/harga/stok terbaru; promo ongkir perlu aturan dan snapshot agar tidak dihitung dua kali |
| Quality control | Pickup memeriksa kesiapan produksi; arrive kurir mewajibkan foto | Belum ada checklist produk/kemasan/serah terima yang terversi; jalur status lama dapat melewati syarat tersebut |

Catatan: tidak ditemukannya fitur pada audit terarah bukan bukti bahwa tidak ada integrasi di luar repository. Provider pembayaran, konfigurasi VPS, volume nyata, dan kebijakan operasional memerlukan verifikasi saat staging.

## Temuan dengan prioritas dan bukti

### DLV-01 — Tinggi: pembatasan outlet belum konsisten (direproduksi)

- Board manajemen/kasir pada `src/lib/garage-courier.ts:493` memfilter jenis/status order tetapi tidak memfilter outlet. Daftar pilihan kurir justru memakai outlet sesi.
- `lockDeliveryOrder` (`:194`) mencari berdasarkan ID saja; `assignCourier` (`:206`) tidak memeriksa outlet pemanggil terhadap order. Melepas assignment dengan kurir `null` melewati pencarian kurir outlet.
- Reproduksi: buat delivery lunas pada outlet A; pakai sesi kasir dengan active outlet B; board memuat order A dan `assignCourier(id, null, sesiB)` berhasil.
- Dampak: staf outlet lain yang terautentikasi dapat melihat data pelanggan/order dan memengaruhi penugasan. Ini tidak mengasumsikan akses anonim.
- Perbaikan: predicate outlet pada pembacaan dan mutasi; central helper untuk scope order. Tentukan perlakuan order legacy tanpa outlet secara eksplisit. Jangan mengubah role atau permission Owner; akses lintas outlet Owner tetap melalui mekanisme yang sudah diizinkan.
- Acceptance: kasir/kurir outlet lain ditolak tanpa perubahan data; switching outlet Owner tetap bekerja; null-outlet legacy memiliki aturan terdokumentasi.

### DLV-02 — Tinggi: jalur status lama dapat melewati bukti dan kesiapan (direproduksi)

- Jalur kurir `courierDeliveryAction` (`garage-courier.ts:307`) memvalidasi urutan, kesiapan Bar/Dapur, serta foto bukti sebelum delivered.
- Jalur `delivery_status` pada `garage-service.ts:10472` hanya memeriksa jenis order, lunas, dan enum status, kemudian langsung menulis status.
- Endpoint `src/app/api/customer/orders/[id]/status/route.ts` menerima aksi tersebut dari sesi kasir.
- Reproduksi: delivery lunas dengan tiket queue/cooking dan tanpa foto dapat ditandai `delivered` melalui jalur lama.
- Perbaikan: satu aturan transisi dan satu kontrak serah terima untuk kedua jalur, dengan audit aktor dan alasan. Jangan hilangkan tombol/alur staf yang masih dipakai; berikan domain rejection yang jelas bila syarat belum terpenuhi.
- Acceptance: semua jalur menolak delivered tanpa bukti; pickup tidak mendahului readiness; retry transisi yang sama tidak menggandakan efek; koreksi status bukan perpindahan mundur tanpa audit.

### DLV-03 — Tinggi: isolasi pembacaan foto bukti (inspeksi sumber, belum direproduksi)

`src/app/api/courier/proof/[file]/route.ts` memeriksa sesi staf dan format nama file, lalu membaca file. Tidak ada lookup order/outlet/kepemilikan sebelum file dikirim. Nama file yang diketahui tidak boleh menjadi otorisasi.
Perlu lookup referensi bukti dan guard outlet/pemilik yang sama dengan order; respons aman untuk file yang bukan hak pengguna. Jangan mengirim URL foto privat melalui API tracking publik tanpa kontrak otorisasi baru.

### DLV-04 — Sedang: kejujuran status dan race GPS (inspeksi sumber)

- `courier-view.tsx:156` menelan setiap kegagalan POST lokasi, lalu tetap menandai GPS terkirim. Indikator dapat terlihat berhasil saat server menolak/putus.
- `garage-courier.ts:440` membaca status, lalu update hanya berdasarkan ID. Request GPS yang tertunda dapat menulis posisi setelah transaksi delivered menghapusnya.
- Perbaikan: timestamp sukses berasal dari respons server; partial/total failure terlihat; conditional update atau locking memeriksa kurir, outlet, status aktif pada saat write. Uji race deliver vs location dan jangan menampilkan lokasi basi sebagai live.

### DLV-05 — Sedang: order aktif dapat hilang dari board (inspeksi sumber)

`getCourierBoard` mengurutkan createdAt terbaru lalu limit 60 sebelum memisahkan active/done. Banyak antaran selesai yang baru dapat menggeser order aktif lama. Tidak ada penanda truncation.
Perbaikan: prioritas query order aktif terpisah dari riwayat, pagination riwayat, counts dan indikator batas; backlog aktif tidak boleh diam-diam hilang.

### DLV-06 — Sedang: idempotensi checkout delivery belum tahan restart (inspeksi sumber)

`src/app/api/customer/orders/route.ts:119` memakai cache proses 60 detik untuk order reguler; key bisa tidak disertakan. Event order sudah memakai durable request key + fingerprint. `src/lib/idempotency.ts` tidak menyimpan cache antar-proses/restart.
Risiko retry setelah timeout/restart harus diuji; ini bukan klaim bahwa duplikasi sudah terjadi di produksi.
Perbaikan tahap berikut: gunakan mekanisme durable yang sudah tersedia dengan namespace, fingerprint, unique constraint, dan respons replay yang konsisten untuk order reguler. Jangan menambah jalur transaksi baru.

## Bukti pengujian audit

- Baseline: `garage-delivery.integration.test.ts` dan `garage-delivery-tariff.test.ts`: 17 tes lulus.
- Ditambah satu tes observasional isolasi: total 18 lulus pada tiga file, 15,26 detik.
- Reproduksi diperluas untuk jalur delivered tanpa bukti/readiness: satu tes observasional lulus, 8,27 detik.
- Semua data berada pada PGlite sementara melalui harness repository; tidak ada pengujian terhadap akun atau DB produksi.
- Tes observasional sengaja mengonfirmasi perilaku bermasalah, bukan acceptance test yang boleh dipertahankan setelah perbaikan.
- Sumber reproduksi disimpan di `reproduce-current-gaps.test.ts.txt` agar tidak ikut suite normal atau build.

Cara mengulang dari checkout basis dengan dependency yang cocok:

```bash
cp docs/delivery-v3/reproduce-current-gaps.test.ts.txt src/lib/delivery-v3-audit-reproduction.test.ts
npx vitest run src/lib/delivery-v3-audit-reproduction.test.ts --reporter=dot
rm src/lib/delivery-v3-audit-reproduction.test.ts
```

Pada implementasi, ganti assertion observasional menjadi penolakan/preservasi data yang diharapkan. Jangan mengeksploitasi temuan ini pada produksi.

## Tahapan implementasi yang diusulkan

| Tahap | Hasil konkret | Gate penerimaan |
|---|---|---|
| 1 — Keamanan dan konsistensi | DLV-01 sampai DLV-05; scope outlet/pemilik bukti, satu transisi delivery, GPS jujur dan race-safe, board aktif tidak hilang | Tes antar-outlet/role, readiness+proof pada semua jalur, replay/race, stale/offline dan >60 order. Tidak mengubah harga, akun Owner, checkout, atau ledger |
| 2 — Smart operations | Dashboard Owner khusus delivery, QC produk/kemasan/serah terima, milestone SLA/ETA sebagai perkiraan | Angka cocok dengan orders/payments yang sama; QC punya aktor/waktu/versi; metrik kosong dinyatakan belum tersedia, bukan angka buatan |
| 3 — Rekomendasi dispatch dan AYA | Ranking deterministik berdasarkan availability, jarak yang valid, kapasitas dan prioritas; mode rekomendasi dulu | Dispatch tidak mengalokasikan dua order ke kapasitas yang sama; alasan dan freshness lokasi terlihat; operator dapat menolak/override dengan audit |
| 4 — Otomatisasi andal | Durable idempotency order reguler, outbox event/notifikasi dedup, dispatch otomatis opt-in, pemulihan retry | Retry setelah restart/two workers tidak menggandakan order, pembayaran, stok atau pesan. Kill switch, dry run dan fallback manual diuji |
| 5 — Payment dan CX | Adapter rekonsiliasi pembayaran/provider yang disetujui, draft repeat order, promo ongkir dan riwayat CRM | Ledger tetap tunggal dan immutable; nominal/fee direkonsiliasi. COD, provider berbayar dan messaging eksternal hanya setelah keputusan bisnis tersendiri |

### Lingkup detail tahap 1 untuk persetujuan

1. Tambahkan helper scope outlet/order di service delivery; gunakan pada board, assign, claim, lokasi, action dan bukti. Bukan perubahan role/permission Owner.
2. Ekstrak aturan transisi delivery yang dipakai jalur kurir dan jalur status legacy; preserve API compatibility sambil menegakkan kesiapan dan bukti.
3. Jadikan write GPS atomik terhadap status; indikator sukses hanya setelah server menerima lokasi, dengan retry/backoff ringan.
4. Pisahkan backlog aktif dan riwayat pada query board; tetapkan pagination/truncation yang terlihat.
5. Ubah reproduksi DLV-01/02 menjadi tes regresi yang menolak perilaku salah, tambahkan proof scope, GPS race, dan backlog fixtures.
6. Jalankan tes relevan → lint/TypeScript → build → staging dan UAT kasir/kurir/Owner. Tidak deploy otomatis dari PR implementasi tanpa persetujuan penerapan Owner.

Tahap 1 direncanakan tanpa migrasi ledger atau kebijakan pembayaran. Jika perbaikan ternyata memerlukan skema baru, sertakan rencana migrasi additive dan tinjau kembali sebelum dilanjutkan.

## Kontrak arsitektur dan UX

- Satu order ID dan payment ID end-to-end. Dispatch/QC/event mereferensikan order yang sama, bukan membuat penjualan turunan.
- Pembayaran diterima bukan sekadar QRIS dipilih atau bukti diunggah. Delivery tetap QRIS/lunas dahulu menurut kebijakan saat ini.
- WMS tetap ledger fisik tunggal; pickup/dispatch tidak memotong stok kedua kali. Koreksi uang melalui reversal, bukan UPDATE/DELETE ledger.
- Buat query/projection untuk dashboard, bukan menambah efek transaksi saat dashboard dibaca.
- Dashboard Owner: ringkasan order aktif, menunggu kurir, terlambat per tahap, pembayaran terverifikasi/pending, ongkir dan penjualan terpisah; board, roster kurir, detail, dan panel rekomendasi AYA dalam satu layar.
- Liquid Glass mengikuti Garage: logo asli, asphalt/chrome/red, lapisan transparan ringan, border jelas, kontras AA. Kurangi blur pada perangkat lambat; hormati reduced-motion. Owner dashboard dapat ringkas di desktop, bertumpuk di mobile; jangan bocorkan saldo laci ke Kasir.
- ETA ditulis sebagai perkiraan/rentang dengan sumber dan timestamp. GPS ditahan ketika offline/basi; jangan menjanjikan tracking background pada browser HP.
- Rekomendasi AYA berisi fakta, aturan, confidence/keterbatasan, dan satu tindakan. AI tidak mengesahkan pembayaran/refund, menulis stok, atau mengubah permission Owner.
- Gunakan notifikasi Garage yang ada dan dedup per order/milestone. Jangan mengklaim pesan terkirim tanpa bukti provider.
- Gunakan SSE yang ada + polling adaptif untuk VPS single-process; peningkatan lintas proses dievaluasi dari topologi terverifikasi, bukan langsung menambah broker.
- Untuk rank lokasi idle, butuh heartbeat lokasi kurir ketika siap antar dengan indikator persetujuan/freshness/retensi. Jangan menggunakan posisi pelanggan atau GPS delivery lama sebagai posisi kurir idle.

## Keputusan bisnis sebelum tahap lanjutan

- Kapasitas kurir: tetap satu antaran aktif dahulu; multi-drop perlu kapasitas dan urutan rute yang disetujui.
- SLA: pisahkan diterima→produksi, ready→pickup, perjalanan dan serah terima. Nilai ambang ditetapkan Owner sebelum notifikasi keterlambatan aktif.
- Tarif: pertahankan tarif sekarang sampai perubahan minimum, pembulatan, radius, zona atau promosi disetujui. Routing/ETA provider harus dipilih beserta batas biaya dan fallback.
- Smart Payment tidak otomatis berarti COD atau payment gateway baru. Verifikasi provider, rekening tujuan, metode settlement, dan kewenangan kas sebelum implementasi.
- Jangan mengubah Daftar Pilihan menjadi self checkout; ulang-pesan hanya menyiapkan draft dalam alur yang diizinkan saat ini.

## Strategi rilis dan rollback

Setiap tahap memiliki PR terpisah, pengujian dan bukti UAT. Gunakan feature flag/default aman untuk kemampuan baru; staging data terisolasi/anonymized, bukan testing transaksi produksi.
Sebelum produksi: persetujuan Owner untuk tahap dan penerapan, CI hijau, backup terverifikasi, migrasi additive bila diperlukan, smoke health/otorisasi dan rencana rollback image. Deploy ke main memicu workflow produksi; jangan merge PR implementasi sebagai pengganti persetujuan deploy.
Pantau error API, umur data sinkronisasi, p95 board, konflik assignment, retry, orphan proof, dan rekonsiliasi order/payment/ledger. Ambang performa ditetapkan dari baseline staging dengan jumlah order realistis, bukan klaim benchmark dari audit sumber.
