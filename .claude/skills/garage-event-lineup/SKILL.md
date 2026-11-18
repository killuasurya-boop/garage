---
name: garage-event-lineup
description: Aturan WAJIB modul Lineup & Panitia Event (band/stand-up, rundown, panitia, tugas) dan lineup GIGS di website. Muat sebelum mengubah /control/lineup, /api/event-lineup, atau lineup di beranda.
---

# garage-event-lineup

- Lineup & Panitia (owner 16 Nov 2026, migration 0196): Owner only, human login (`assertOwnerHuman`, Manajer and agent keys
  refused), UI `/control/lineup` (`components/ceo/lineup/LineupPanel.tsx`), API `/api/event-lineup/**`
  (`event-lineup-service.ts`, errors `LineupError` via `lineupRoute`). Tables `event_performers`, `event_crew`,
  `event_crew_tasks`. Events are keyed by NAME text (GIGS lives on the separate platform `garage-event`), same as Sponsor Event.
- No money in this module (no fee/ledger). Performers are never deleted: `batal` needs `cancelReason`; crew is
  deactivated, not deleted. Every write → `audit_logs` (`metadata.module = 'event-lineup'`, before/after). Audit is written
  AFTER a transaction, never inside (PGlite single connection deadlocks).
- Pure rules `event-lineup-rules.ts`: kinds = `gigs-lineup.ts` (`band`, `standup`, `akustik`, `dj`, `kreator`; one label set
  for screen + website), `buildRundown` (slot order, end = start + minutes, overlap/gap flagged, never auto-moved),
  `isTaskOverdue` (WIB date), `eventReadiness` (checklist from real data only), WhatsApp schedule text. Phones → `08…`.
- Website: `src/app/page.tsx` replaces the GIGS platform lineup with confirmed + `showOnWebsite` performers whose event name
  matches the GIGS promo name (case-insensitive, `publicLineupFor`), logo taken from the platform by name (`mergeLineup`).
  No Garage OS data → platform lineup unchanged. Public output carries name + kind only (no contact/notes).
- Website set time (owner 17 Nov 2026): `publicLineupFor` returns `{ name, kind, time }`; `time` = `publicSetTime(buildRundown(...))`
  ("20.00–20.45", null when no set time), shown on the GIGS card as "… WIB". Still no contact/notes in public output.
- Crew task reminders (owner 17 Nov 2026): pure `taskReminders(tasks, todayWib)` → stage `h-1`, `hari-h`, `terlambat-1/3/7`
  (only `todo`/`proses` with a due date; `tinggi` or overdue = warning). `sweepLineupTaskReminders` sends `notifyStaff`
  kind `lineup_task_reminder` to every active Owner, dedupKey `lineup-task:{taskId}:{stage}:{ownerUserId}`, url
  `/control/lineup?eventId=…&tab=tugas` (`?event=nama` hanya untuk data lama tanpa master; page reads `eventId`/`event`/`tab`). Runs every 15 min (minute % 15 === 8) via
  `runMonitoredJob("event_lineup_tasks")`. No automatic WhatsApp to crew (crew are not accounts; no messaging provider).

## GIGS EO (Owner 17 Nov 2026) — acuan kerja `docs/gigs-eo/00-CHECKLIST.md`
- Kerjakan per fase (PR bertumpuk), **jangan merge/deploy sebelum Owner menyuruh**. Centang item di checklist dalam PR yang sama.
- Master event = tabel `events` (`src/lib/event-master.ts`). Sponsor, penampil, panitia, tugas punya `event_id`; tulis baru
  lewat `resolveEventRef` (eventId → nama = judul master; nama sama persis dengan satu master ikut ditautkan; selain itu nama
  lama tanpa master). Ubah judul event → `renameEventReferences` dalam tx `updateEvent`. Event baru dibuat di menu Event,
  bukan dengan mengetik nama di Lineup/Sponsor.
- **Identitas event = `event_id`, bukan judul** (judul master boleh dobel). Papan Lineup (`getLineupBoard({ eventId })`),
  cek PIC tugas (`assertCrewInEvent`), dan urut lineup membandingkan `event_id`; nama hanya untuk baris lama `event_id IS
  NULL`. Event arsip tetap bisa dibuka/diedit lewat ID-nya (form Sponsor menambah opsi "event saat ini").
- `events.platform_slug` (unik bila diisi) = slug event di platform GIGS; `publicLineupFor({ slug, name })` mencari master via
  slug dulu, lalu nama.
- `/api/website-events` hanya event `published` yang belum selesai dari master; tidak pernah data contoh.
- Keuangan Event (Fase 2, `/control/event-finance`, `event-finance-service.ts` + `-rules.ts`, migrasi 0198): Owner manusia
  saja. Pos anggaran (`event_budget_lines`, kategori tetap, honor bisa menunjuk penampil event yang sama; arsip, tidak
  dihapus) dan pembayaran (`event_expense_payments`, idempoten): bank → baris buku kas `event_expense` dalam tx yang sama,
  `external` (uang pribadi Owner) tanpa baris kas; batal = status void + `event_expense_void`. Laba rugi: kategori
  `Biaya Event` (non_operating) dibaca dari tabel pembayaran per tanggal bayar/batal (`EVENT_COST_CATEGORY`).
- Hari-H (Fase 3, `/event-day` HP panitia, `event-day-service.ts` + `-rules.ts`, migrasi 0199): Owner & Manajer (login
  langsung; Manajer hanya event outletnya). Check-in `event_checkins` append-only (batal = status + alasan): QR undangan =
  tautan `/undangan/<token>` (`extractInvitationToken`), total pax per undangan ≤ `maxPax`, total aktif ≤ `events.capacity`,
  advisory lock per event; walk-in tanpa undangan. Mode stage: `actual_start/actual_end` (mulai baru menutup yang tampil),
  rencana tidak diubah; telat > 12 jam dianggap di luar hari event (tidak dihitung). Beranda `live` = sudah mulai & belum
  selesai. "Salin rundown ke agenda" (Owner) mengisi `events.agenda` dari rundown terkonfirmasi. Manajer di Lineup: baca papan +
  ubah STATUS tugas saja (`assertCrewHuman`); data penampil/panitia/uang tetap Owner.
- Fase 4 (migrasi 0200): penampil `hospitality`, `contract_url` (https saja), `schedule_sent_at` (tombol "Kirim jadwal" menandai;
  pengingat H-1/hari H `scheduleReminders` untuk yang belum). Papan Lineup: `honor` per penampil (Owner saja, dari pos
  anggaran honor tertaut) dan `sponsorNotes` (kewajiban sponsor ber-`slot_performer_id`, harus penampil event sponsor itu).
  Checklist operasional `event_ops_checks` (10 item bawaan `OPS_CHECK_TEMPLATE`, Owner/Manajer centang, tambah item Owner)
  masuk kesiapan sebagai item "operasional". Evaluasi `event_reviews` (1 per event, upsert) + banding antar event di
  Keuangan Event. Laporan ke sponsor: `/control/sponsors/report/[id]` (cetak/PDF). E2E `e2e/gigs-eo.spec.ts`.

## Kustom kartu talent & sponsor di website (Owner 17 Nov 2026, migrasi 0201)
- Penampil: `tagline` (≤40, baris kecil di bawah nama, mis. "Heavy / Metallic Roster") + `logo_url` (unggah
  `POST/DELETE /api/event-lineup/performers/[id]/logo`, webp ≤200 KB di `/garage-uploads/event-lineup`, `setPerformerLogo`,
  diaudit). `publicLineupFor` mengirim `{ name, kind, time, live, logo, tagline }`; `mergeLineup`: logo Garage OS dulu,
  lalu logo platform untuk nama sama. Hapus logo → kembali ke logo platform.
- Sponsor: `logo_url` (`POST/DELETE /api/sponsors/[id]/logo`, `setSponsorLogo`), `website_url` (https saja, Zod),
  `show_on_website` (default **false**, Owner mencentang). `publicSponsorsFor({slug,name})` = nama, logo, tautan, paket
  saja (TIDAK PERNAH nilai uang/kontak/catatan), sponsor `batal` tidak tampil. Beranda: bagian "Didukung oleh" di
  `gigs-spotlight.tsx` (`promo.partners`). Tidak menyentuh buku kas.
- Instagram (Owner 17 Nov 2026): akun Instagram penampil (`instagram`, sudah ada) dan sponsor (`event_sponsors.instagram`,
  migrasi 0201) ikut data publik — akun IG adalah profil publik, bukan kontak. Normalisasi murni `parseInstagramHandle`
  (`@akun` / tautan instagram.com → `akun`), tautan hanya lewat `instagramUrl` (akun valid saja). Website: seluruh kartu
  penampil = tautan ke Instagram (tab baru); kartu sponsor → Instagram dulu, lalu `website_url`. Nomor WA tetap tidak publik.
- Impor lineup platform (Owner 17 Nov 2026, "jangan kerja 2x"): tombol "Impor dari platform GIGS" di tab Lineup →
  `POST /api/event-lineup/import-platform` (`importPlatformLineup`, `fetchPlatformLineup` di `gigs-promo.ts`: event platform
  dicocokkan `events.platform_slug` dulu, lalu nama). Nama baru → penampil `konfirmasi` + tampil website + logo platform
  (hanya jalur `/event/...`), urutan di belakang. Nama yang sudah ada (tanpa peduli huruf) TIDAK ditimpa; hanya logo kosong
  diisi. Setelah impor semua bebas diubah. Satu audit per impor. Sponsor belum bisa diimpor: API platform hanya kirim jumlah.
- Arah "1 kontrol 1 komando" (saran ke Owner, menunggu repo platform `garage-event`): Garage OS = master data event, lineup,
  sponsor, panitia, uang; platform GIGS = etalase + form pendaftaran yang membuat data `calon` di Garage OS.
- Impor RAB platform (Owner 17 Nov 2026): tombol "Impor RAB dari platform GIGS" di Keuangan Event →
  `POST /api/event-finance/import-platform` (`importPlatformBudget`, `fetchPlatformBudget` membaca
  `/event/<slug>/api/public/config`). Pos baru = RENCANA saja (tanpa buku kas); judul yang ada tidak ditimpa; pos cadangan
  (`isReserveBudgetLine`: "Save Money", "bukan biaya") dilewati karena bukan biaya; kategori dari nama (`platformBudgetCategory`).
- Data platform GIGS AKHIR TAHUN 2026 (dibaca 17 Nov 2026, publik): slug `gigs-akhir-tahun-2026`, 31 Des 2026 19.00 WIB,
  4 talent (LOST SIDE, SURAI, DIVISIVE, STAND OUT; tagline hanya di app.js halaman, tidak di API), RAB 9 pos = Rp21.300.000
  (termasuk Save Money Rp1.500.000), 1 sponsor berkomitmen tanpa nama publik. Nama resmi = **SURAI** (Owner 17 Nov 2026);
  kartu website platform masih menulis "SURAU" dan slot panitia "SURAI HC" → perbaiki di repo platform. "LOSTSIDE" di slot
  panitia = ejaan lain LOST SIDE.
- Impor lineup mengingat nama asli platform (`event_performers.platform_name`, migrasi 0201): dicocokkan lewat
  `platform_name` dulu, lalu nama sekarang, jadi talent yang diganti nama (SURAU → SURAI) tidak dibuat dobel saat impor ulang.
- Tempel daftar (Owner 17 Nov 2026): `src/lib/paste-list.ts` (murni; tab/;/|/" - "/, judul & nomor diabaikan, jam/rupiah/WA/IG/
  jenis/jabatan dikenali, tidak menebak) + `PasteListDialog`. `POST /api/event-lineup/bulk` (`bulkPaste`, kind performer|crew) &
  `POST /api/sponsors/bulk` (`bulkCreateSponsors`): validasi semua baris dulu (satu salah = tidak ada yang disimpan), nama yang
  ada dilewati, simpan lewat create* biasa (audit per baris). Sponsor = kesepakatan saja, tanpa buku kas. Owner saja.
- Ruang Panitia (Owner 17 Nov 2026, migrasi 0202): `event_crew.user_id` = akun staf AKTIF yang ditautkan Owner (form panitia,
  `crewAccountOrThrow`). `/panitia` + `/api/panitia/**` (`event-panitia-service.ts`, peran staf apa pun, agent key ditolak):
  hanya event tempat akun itu panitia aktif. Semua: rundown terkonfirmasi tanpa kontak + ubah status tugas SENDIRI.
  Ketua/Sekretaris: buat tugas (PIC harus panitia aktif event yang sama) + ubah status semua tugas event. Ketua/Bendahara:
  ringkasan anggaran vs dibayar (baca saja). Tidak ada aksi uang, kontak sponsor/talent, atau data Owner lain. Audit `via=panitia`.
  Nonaktifkan panitia = akses hilang seketika. Papan Owner `/api/event-lineup` tetap Owner/Manajer.
- Peran **Panitia** (Owner 18 Nov 2026): akun yang HANYA membuka Ruang Panitia. `Role` + "Panitia" (tanpa modul/izin,
  `protectedRoleRank` 10). `roles` (garage-data) tetap = peran staf kafe (dipakai rute AI sebagai "semua staf"); `accountRoles`
  (dengan Panitia) hanya untuk Kelola Staff. `requireGarageSession` menolak Panitia TERPUSAT (`PANITIA_ONLY`) kecuali `allowedRoles`
  menyebut "Panitia" secara eksplisit — JANGAN tambahkan "Panitia" ke rute lain tanpa izin Owner. `/os` (page-access) mengalihkan
  Panitia ke `/panitia`; `/panitia` tujuan login yang sah. `attachAbsenIdentity` melewati Panitia (tidak absen/gaji/fee).
- Meja pintu Hari-H (Owner 18 Nov 2026, dari PR #219 yang ditutup karena bentrok tabel `event_checkins`): Kasir & Waiter boleh
  membuka `/event-day` (+ `GET /api/event-day`, `POST /api/event-day/checkins`, `GET /api/event-day/checkins/search`) lewat
  `assertCheckinDesk` — hanya tab Check-in (respons `stage: null`, panel menyembunyikan Panggung/Tugas/Kesiapan dan tombol
  Batalkan). Batal check-in, panggung, agenda, checklist tetap `assertEventCrew` (Owner/Manajer). Selain Owner: event outlet sendiri.
  Cari tamu `searchCheckinGuests` (nama ilike / ≥5 digit HP, maks 20, undangan dicabut & tamu arsip tidak ikut) TIDAK pernah
  mengirim nomor HP; check-in dari hasil cari memakai `invitationId` (wajib undangan event yang sama). Halaman undangan:
  `getPublicInvitation().checkedIn` → "Sudah masuk pukul … · n orang"; QR disembunyikan bila semua kuota sudah masuk. Tanpa migrasi.
- Nama resmi talent di sisi Garage (Owner 18 Nov 2026, "semua jadi SURAI"): `OFFICIAL_LINEUP_NAMES` + `officialLineupName`
  (`gigs-lineup.ts`) dipakai `parsePlatformLineup`/`getGigsPromo` (beranda, ticker live) dan impor. Item yang dikoreksi membawa
  `platformName` (ejaan asli platform); impor mencocokkan nama resmi DAN ejaan asli, `platform_name` menyimpan ejaan asli → tidak
  dobel. Halaman `/event/*` = container lain (`garage-event-platform`, Caddyfile), kodenya TIDAK di repo ini → ejaan di sana
  diperbaiki lewat admin/repo platform. Tambah koreksi nama baru di `OFFICIAL_LINEUP_NAMES` (kunci huruf kecil).

- SATU pintu lineup GIGS (Owner 18 Nov 2026): **Kontrol → Lineup (Garage OS) = sumber tunggal** untuk beranda DAN halaman
  event platform `/event/<slug>`. Slot dashboard panitia platform TIDAK dipakai tampilan publik (hanya cadangan bila Lineup
  Garage kosong). Caddy meneruskan HANYA dua GET ke Garage OS (blok sebelum `/event`):
  - `/event/<slug>/api/public/lineup` → `/api/public/gigs/[slug]/lineup`: `garageLineupAsEventSlots(publicLineupFor)` (performer =
    nama resmi, baris kecil = tagline/"Official Lineup", jam rundown, logo Garage lalu promo platform); Lineup kosong →
    `enrichSlotsForEventPage(fetchRawPlatformSlots)`. Bentuk respons = milik platform `{ slots }` (dibaca app.js platform).
  - `/event/<slug>/public/app.js` → `/api/public/gigs/[slug]/app-js`: file asli platform + `patchGigsAppJs`
    (`gigs-event-page-patch.ts`): (1) bug platform — lineup dirender ulang setelah pengamat animasi dipasang, kartu baru
    transparan → panggil `setupRevealObserver(); revealActiveScreenImmediate();` setelah `renderLineups()`; (2) `name: 'SURAU'` →
    `'SURAI'` (semua). Jangkar tidak cocok → koreksi dilewati (log warn), file asli tetap jalan. Cache memori 60 detik.
  Kedua route publik (rateLimit, `public-routes.ts`). Perbaikan sebenarnya tetap di repo platform `garage-event` bila tersedia.
- Banner "Sedang tampil" halaman event = mode panggung Garage (Owner 18 Nov 2026): Caddy `@gigsLineup` juga meneruskan
  `/event/<slug>/api/public/live` → `/api/public/gigs/[slug]/live` (`publicStageForPlatform` di `event-day-service.ts`: master
  via slug/nama, penampil konfirmasi + tampil website, `stageState`; bentuk platform `{ current, since, next }`; tanpa data
  Garage → data platform apa adanya).
- Akun **Panitia** di Hari-H (Owner 18 Nov 2026): `/event-day` + `GET /api/event-day`, check-in, cari tamu, `POST slots/[id]`
  mengizinkan "Panitia"; `loadEvent`/`setSlotState` mewajibkan panitia AKTIF event itu (`event_crew.user_id`, data lama via
  judul); Panitia melihat tab Check-in + Panggung saja (tanpa batal check-in, tugas, kesiapan, agenda). Ruang Panitia punya
  tombol "Hari-H". Tombol "Login Panitia" (`/login?next=/panitia`) di beranda GIGS dan menu halaman event (tambalan app.js
  `PANITIA_LOGIN_SNIPPET`, sekali).
