# GIGS / EO Profesional — Acuan Kerja & Checklist

Owner, 17 Nov 2026: "audit menyeluruh event system GIGS … susun menjadi plan checklist perbaikan … agar MVP sukses
EO profesional". Perintah Owner: **kerjakan sampai final, JANGAN deploy/merge sebelum Owner menyuruh.** Setiap fase =
satu PR (bertumpuk). Agent lain melanjutkan dari dokumen ini: ambil item `[ ]` paling atas di fase aktif, kerjakan di
branch fase itu (atau branch baru di atasnya), centang di sini dalam PR yang sama.

Aturan modul yang berlaku: skill `garage-event-lineup` (bagian "GIGS EO"), `garage-kas` (uang),
`garage-ops-deploy` (route API baru), `garage-website` (beranda). Invarian uang: setiap rupiah = baris
`cash_ledger_entries`, koreksi = pembalik.

## Peta sistem saat audit

| Bagian | Lokasi | Kunci event |
|---|---|---|
| Event & Undangan (Grand Opening) | modul OS "Undangan Digital", `event-service.ts`, `event-invitations.ts` | `events.id` / `slug` |
| Menu event / bundle + laporan penjualan | `event-menu-service.ts`, `event-sales-report.ts`, `orders.event_id` | `events.id` |
| Sponsor Event | `/control/sponsors`, `event-sponsor-service.ts` | teks `event_name` (+ `event_id` opsional, tak dipakai UI) |
| Lineup & Panitia | `/control/lineup`, `event-lineup-service.ts` | teks `event_name` |
| Platform GIGS (pendaftaran, tiket, transparansi, `live`) | stack terpisah `garage-event` di VPS (`/event`) | slug platform — **kode di luar repo ini** |
| Beranda GIGS | `gigs-promo.ts` (fetch platform) + `publicLineupFor` | cocok nama |

## Fase 1 — Fondasi data (PR `claude/gigs-eo-fase1`, base `main`)

- [x] **1. Satu master event.** *(selesai, PR fase1 — `src/lib/event-master.ts`, migrasi 0197)* `events` = sumber identitas. Kolom baru `events.platform_slug` (slug event di platform
  GIGS, unik bila diisi). Kolom `event_id` (FK `events`, `on delete set null`) di `event_performers`, `event_crew`,
  `event_crew_tasks` (sponsor sudah punya). `event_name` tetap disimpan (riwayat + kompatibel), tetapi:
  - Lineup & Sponsor memilih event dari daftar master (`GET /api/event-lineup` dan `/api/sponsors/options` mengirim
    `masterEvents`); tulis dengan `eventId` → server mengisi `event_name = events.title`.
  - Ubah judul event (`updateEvent`) → `event_name` di sponsor/lineup dengan `event_id` itu ikut diganti (satu tx).
  - Event baru TIDAK lagi dibuat dengan mengetik nama di Lineup/Sponsor: dibuat di menu Event (Undangan Digital).
  - Migrasi mengisi `event_id` untuk baris lama yang namanya sama (tanpa peduli huruf besar/kecil) dengan `events.title`.
  - Nama bebas (tanpa master) tetap boleh untuk data lama, ditandai "belum terhubung" di layar.
  - Beranda: `publicLineupFor` mencari event via `platform_slug = gigsPromo.slug` dulu, lalu nama (fallback).
- [x] **4. Hapus data palsu publik.** *(selesai, PR fase1)* `/api/website-events` (event contoh "Creative Supper Club", "Head Barista Ardi",
  memanggil `/api/admin/events` yang tidak ada) → kembalikan event `published` asli dari `events` (judul, tanggal,
  slug, tagline) tanpa fallback palsu; daftar kosong bila tidak ada.
- [ ] **5. Satu sumber angka dana sponsor** — *BLOKIR: kode platform GIGS tidak ada di repo ini.* Sisi Garage OS:
  ringkasan dana per event (`sponsorFundSummary(eventId)`: disepakati, masuk, sisa, barang) tersedia di layar Sponsor
  dan laporan event; integrasi ke halaman transparansi platform menunggu repo platform + keputusan Owner apakah angka
  publik.

## Fase 2 — Uang event (PR `claude/gigs-eo-fase2`, base fase1)

- [x] **2. Anggaran & biaya event.** *(selesai, PR fase2 — `event-finance-service.ts`, migrasi 0198, `/control/event-finance`)* Tabel `event_budget_lines` (kategori: honor, sound, venue, dekorasi, promosi,
  konsumsi, keamanan, perizinan, transport, lain), rencana (rupiah), catatan, penanggung jawab. Realisasi = pembayaran
  `event_expense_payments` yang **selalu** menulis satu baris buku kas (`event_expense`, akun asal pilih: rekening
  Jago / kas besar — ikuti akun yang sudah ada di `garage-kas`), foto bukti non-publik, idempotency key, pembatalan =
  baris pembalik (`event_expense_void`). Honor penampil = baris anggaran kategori honor yang menunjuk `performer_id`.
  Owner saja + login manusia. Laba rugi: biaya event = beban non-operasional (`nonOperating`) per `business_date`.
  *Implementasi:* sumber bayar `bank_jago` / `bank_bni` (baris buku kas `event_expense`) atau `external` (uang pribadi
  Owner, tanpa baris kas). Laba rugi membaca tabel pembayaran (bukan buku kas) supaya uang pribadi ikut: kategori
  `Biaya Event` (non_operating) pada tanggal bayar, pembatalan mengurangi pada tanggal batal. `ENGINE_VERSION` 7.
- [x] **3. Laporan untung/rugi per event.** *(selesai, PR fase2; tiket menunggu platform — lihat catatan)* Gabung: penjualan menu event (`event-sales-report`), uang sponsor masuk,
  tiket (input manual ringkasan dari platform sampai integrasi ada), biaya (realisasi), sponsor barang (info). Layar
  tab "Untung/Rugi" + PDF. Anggaran vs realisasi per kategori, selisih.
  *Implementasi:* `getEventFinance` — saat ini (uang masuk − keluar) & proyeksi (sponsor lunas, sisa anggaran dibayar);
  margin menu hanya bila HPP lengkap (kalau tidak, ditandai). PDF = "Cetak / PDF" (cetak browser, kontrol disembunyikan).
  **Tiket belum dihitung** (platform GIGS di luar repo) — tambahkan setelah repo platform tersedia.

## Fase 3 — Hari-H (PR `claude/gigs-eo-fase3`, base fase2)

- [x] **6. Check-in pintu.** *(selesai, PR fase3 — `/event-day`, `event-day-service.ts`, migrasi 0199; QR "Tiket masuk" di halaman undangan setelah RSVP hadir)* Undangan punya QR (token) → `POST /api/events/[id]/checkin` (scan / ketik kode) mencatat
  `event_checkins` (jumlah orang, waktu, petugas); tolak undangan dicabut/dobel melebihi pax; counter live + kapasitas
  (`events.capacity`). Layar HP panitia `/control/event-day?event=…` tab Check-in.
- [x] **7. Rundown tunggal.** *(selesai, PR fase3 — tombol "Salin rundown ke agenda undangan" di tab Panggung, Owner)* Rundown Lineup = sumber. `events.agenda` (undangan) bisa diisi otomatis dari rundown
  ("Salin dari rundown"); website "LIVE" memakai slot yang sedang berjalan (lihat 8).
- [x] **8. Mode stage manager.** *(selesai, PR fase3 — `actual_start/actual_end`, telat >12 jam diabaikan; beranda "Sedang tampil")* Tabel/kolom status slot (`actual_start`, `actual_end`, `delay_minutes`), tombol
  Mulai/Selesai, "sekarang / berikutnya", geser jadwal sisa (+N menit) tanpa mengubah jadwal rencana; publik: "Sedang
  tampil" di beranda.
- [x] **9. Akses panitia.** *(selesai, PR fase3 — Manajer: papan lineup baca, status tugas, check-in, panggung; uang tetap Owner)* Peran ringan untuk Ketua/Stage Manager: Manajer (login manusia) boleh baca board, ubah tugas
  & status slot, check-in; uang (sponsor/biaya/honor) tetap Owner. Diatur di guard service, bukan UI saja.

## Fase 4 — Penyempurnaan (PR `claude/gigs-eo-fase4`, base fase3)

- [x] **10. Data penampil lengkap:** *(selesai, PR fase4 — `hospitality`, `contract_url` (https), honor & status bayar di kartu Lineup dari Keuangan Event, Owner saja)* honor (lihat 2), status bayar, technical rider, hospitality, tautan kontrak.
- [x] **11. Checklist operasional & keselamatan** *(selesai, PR fase4 — `event_ops_checks`, 10 item bawaan, tab Kesiapan di `/event-day`, masuk skor kesiapan Lineup)* per event (izin keramaian, keamanan, P3K, kapasitas, listrik cadangan,
  rencana hujan, jalur evakuasi) — item bisa dicentang + PIC, masuk skor kesiapan.
- [x] **12. PDF laporan ke sponsor** *(selesai, PR fase4 — `/control/sponsors/report/[id]`, cetak/PDF, logo versi kertas putih)* (kewajiban terpenuhi + foto bukti, dukungan uang/barang).
- [x] **13. Kewajiban sponsor ↔ slot rundown** *(selesai, PR fase4 — `slot_performer_id`, tampil di tab Rundown)* (mis. "disebut MC 21.00" muncul di rundown MC).
- [x] **14. Pengingat jadwal penampil H-1** *(selesai, PR fase4 — `schedule_sent_at` ditandai tombol Kirim jadwal; `scheduleReminders` H-1 & hari H lewat sweeper tugas)* (daftar belum dikirimi jadwal → notifikasi Owner).
- [x] **15. Evaluasi pasca-event** *(selesai, PR fase4 — `event_reviews`, kartu Evaluasi + banding antar event di Keuangan Event)* (catatan insiden, evaluasi, banding event sebelumnya).
- [x] **16. E2E** *(selesai, PR fase4 — `e2e/gigs-eo.spec.ts`, ikut `release-check.sh`)* alur Sponsor, Lineup, Biaya, Check-in di `e2e/` + `release-check.sh`.
- [ ] **17. Audit platform GIGS** (pendaftaran, tiket, pembayaran, 21+, keamanan) — *BLOKIR: repo platform belum
  terhubung.*

## Log status

| Tanggal | Fase/Item | PR | Catatan |
|---|---|---|---|
| 18 Nov 2026 | Satu pintu (lineup, panggung, panitia, pendaftaran, transparansi) | #250 | Halaman event platform membaca Garage lewat Caddy (lineup, live, config, sponsor/summary, register, app.js tambalan). Migrasi 0204. Item 5 sebagian: angka transparansi kini diatur Owner di Garage (bebas, bukan buku kas). |
| 17 Nov 2026 | Dokumen acuan dibuat | fase1 | Belum ada yang di-merge/deploy (perintah Owner). |
| 17 Nov 2026 | Item 10–16 selesai | fase4 | Migrasi 0200. Tes `event-eo-fase4.integration.test.ts`, E2E `gigs-eo.spec.ts`. Sisa BLOKIR: 5, 17, tiket. |
| 17 Nov 2026 | Item 6–9 selesai | fase3 | Migrasi 0199 (`event_checkins`, `events.capacity`, jam tampil nyata). Tes `event-day*.test.ts`. |
| 17 Nov 2026 | Item 2 & 3 selesai | fase2 | Migrasi 0198 (2 tabel + kategori P&L). Tes `event-finance*.test.ts`. |
| 17 Nov 2026 | Item 1 & 4 selesai | fase1 | Migrasi 0197 (kolom saja + backfill nama sama). Tes `event-master.integration.test.ts`. |
