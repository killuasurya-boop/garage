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
