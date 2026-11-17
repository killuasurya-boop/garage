---
name: garage-event
description: Aturan WAJIB modul Event Garage OS: undangan & RSVP, halaman undangan publik, check-in tamu di pintu (/checkin), walk-in. Muat sebelum mengubah apa pun terkait event, undangan, atau check-in. (Uang sponsor = garage-kas, menu/bundle event = garage-pos.)
---

# garage-event

> Aturan Owner di sini mengikat penuh. Baca hanya bagian yang relevan.

- Event check-in (owner 16 Nov 2026, migration 0197, `docs/event-checkin/01-IMPLEMENTASI.md`): invitation page shows an entry QR
  (= its own invitation URL); door screen `/checkin` for every logged-in staff role (`requireStaffSession`, agent keys refused).
  One invitation = one active check-in (row lock + partial unique index); preview never writes; walk-ins idempotent via
  `client_key`; undo = Owner/Manajer + reason (`undone_at`, never deleted). Search returns no phone numbers. Rules pure in
  `event-checkin-rules.ts`, server `event-checkin-service.ts`.
