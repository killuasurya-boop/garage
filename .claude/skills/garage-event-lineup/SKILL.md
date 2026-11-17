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
