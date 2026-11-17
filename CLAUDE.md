# Garage Coffee & Motor OS

## Project Context

Garage Coffee & Motor OS is an internal operational app for a coffee and food business. It now has a backend foundation using Next.js API Route Handlers, Drizzle ORM, PostgreSQL/Neon, and Better Auth.

Primary modules:
- Dashboard
- POS
- Kitchen
- Inventory
- Finance
- CRM
- Approvals
- Audit
- **Payroll V2** (behind flag `PAYROLL_V2_ENABLED`) — Absensi PIN+Selfie+GPS,
  Wallet Gaji (upah harian + lembur), Wallet Fee (Rp 200/produk pool split
  proporsional jam), cron finalisasi 23:59. Lihat `docs/PAYROLL_DESIGN.md`.

Current backend scope is internal route handlers + PostgreSQL persistence only. Do not add payment gateways, email providers, external ERP sync, production messaging integrations, or unrelated infrastructure unless explicitly requested.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- lucide-react icons
- Better Auth email/password
- Drizzle ORM with PostgreSQL/Neon
- Seed data derived from the existing Garage mock/menu/inventory sources

Important files:
- `src/components/garage/garage-app.tsx` - main app shell and module screens
- `src/lib/garage-data.ts` - seed/source data for menu, inventory, orders, finance, CRM, approvals, audit
- `src/db/schema.ts` - Drizzle schema for auth and Garage domains
- `src/lib/auth.ts` - Better Auth server setup
- `src/lib/garage-service.ts` - server-side data/query/mutation layer
- `src/app/globals.css` - Garage theme tokens and global UI styling
- `src/app/layout.tsx` - app metadata and font setup
- `design-system/MASTER.md` - design tokens, anti-patterns, per-module UI/UX checklist (source of truth for UI work; check before editing components)
- `design-system/COMPONENTS.md` + `src/lib/design-tokens.ts` - U1 semantic tokens `--gos-*` (WCAG AA tested) and base components in
  `src/components/ds/` (`StatusPill`, `MoneyText`, `StateView`); live registry `/control/design-system`. Check before adding a component.

## Design Direction

The UI must feel like Garage Coffee & Motor operations:
- black asphalt / dark industrial base
- chrome and silver text
- red primary accent
- amber operational highlights
- dense but readable dashboard layout
- tablet-friendly POS workflow

Use the existing Garage visual system. Avoid generic SaaS green/blue styling, marketing hero layouts, decorative blobs, and oversized landing-page composition.

Logo usage:
- Brand is **Garage Coffee** (no longer "& Motor", owner Okt 2026).
- Primary logo: `public/garage-brand/garage-coffee-logo.png` (transparent, silver/red — for dark surfaces, no light backing).
- On white paper/PDF/light cards use `public/garage-brand/garage-coffee-logo-dark.png` (logo on its dark plate).
- App icon: `public/garage-brand/garage-coffee-icon.png` (red triangle emblem).
- Render logos with `object-contain` only; do not crop the wordmark.
- Partner/sponsor logo BLACK (`public/grand-opening/sponsor-black.webp`) only on `/grand-opening` (behind the 21+ age gate), never on the homepage.

## Readability, Motion, And Scroll Policy

Every frontend revision must make the operating UI easier to read before adding decoration:
- Slightly brighter cards, tables, forms, popovers, and nested operational surfaces are preferred over pure black-on-black layers.
- Muted text must remain readable on dark asphalt backgrounds. Avoid low-opacity copy for prices, statuses, table cells, and button labels.
- Money, totals, item names, stock status, queue status, customer names, timestamps, and approval actions must never be clipped or hidden.
- Keep typography compact but legible: avoid ultra-small text in cards, long buttons, table cells, and mobile controls.
- Preserve the Garage palette: black asphalt, chrome/silver, red accents, amber highlights. Do not introduce generic green/blue SaaS styling.

Motion direction:
- Use cinematic garage motion only when it supports clarity: fast fade/slide entry, active navigation glow, hover lift, button press feedback, selected states, and drawer/dialog transitions.
- Keep animations lightweight for tablets and cashier use. Avoid parallax, heavy blur, infinite decorative motion, or layout-shifting effects.
- Always respect `prefers-reduced-motion`.

Scroll direction:
- Data-dense modules need explicit scroll containers: POS menu/cart, Kitchen queues, Inventory tables, CRM tables, Approvals lists, and Audit logs.
- Desktop can use fixed-height internal scroll areas when it improves productivity.
- Mobile must remain one-column friendly with safe horizontal table scroll only where dense tabular data requires it.
- Sticky headers/actions are allowed only when they do not cover content.

## Full-Stack Rules

- Preserve the existing Garage UI and responsive behavior.
- Use API Route Handlers for backend endpoints; do not use Server Actions for this backend v1 unless explicitly requested.
- Keep Drizzle database initialization build-safe and lazy; `next build` must not require a live DB connection.
- Validate request bodies with Zod and return `{ data }` or `{ error: { code, message } }`.
- Keep Better Auth for identity/session only; Garage roles live in `staff_profiles`.
- Do not add payment gateway, email provider, external ERP, or real-time provider until requested.
- Do not modify PRD files, PDFs, ZIPs, or source design assets unless specifically asked.
- Prefer existing component patterns before adding abstractions.
- Use shadcn/ui and lucide-react consistently.
- Keep text from overflowing buttons, cards, tables, and mobile layouts.
- Preserve responsive behavior at desktop `1366x900` and mobile `390x844`.

## WAJIB: Skill Modul & Hemat Token (berlaku untuk SEMUA agent)

Aturan detail tiap modul TIDAK lagi di file ini; ada di skill `.claude/skills/<nama>/SKILL.md` (dipindah apa
adanya, Nov 2026, agar tiap sesi hemat ±20 ribu token). Aturan di skill sama mengikatnya dengan file ini.

1. Di awal setiap tugas, muat skill `hemat-token` (`.claude/skills/hemat-token/SKILL.md`) dan ikuti caranya.
2. SEBELUM membaca/mengubah kode suatu modul, muat skill modulnya. Tugas lintas modul = muat semua yang
   tersentuh. Ragu? Muat. Tidak boleh mengubah kode modul tanpa membaca skill-nya.
3. Agent tanpa tool Skill (Codex, Cursor, Copilot, subagent): baca file `SKILL.md` di path yang sama.
4. Aturan baru dari Owner → tulis di skill modulnya (bukan di sini); di sini hanya baris indeks bila modul baru.

| Menyentuh… | Skill wajib |
|---|---|
| POS, kasir, keranjang, order/invoice admin, Bayar nanti, Belum Bayar, struk/QR, cetak, Event Menu/bundle | `garage-pos` |
| Uang: shift/laci, kas keluar/masuk, buku kas, petty cash, closing, setoran, final Owner, risk, laporan Owner, Finance, Sponsor | `garage-kas` |
| Production Hub (Bar/Dapur), kitchen ticket, tiket SELESAI/print job, notifikasi staf | `garage-produksi` |
| Produk, kategori, HPP, resep, inventory, WMS/gudang, opname, pembelian/supplier | `garage-produk-wms` |
| Meja, QR meja, `/order`, dine-in, mode menu digital | `garage-meja-menu` (+ `garage-menu-v5` untuk UI menu) |
| Member, `/member-login`, kartu member, `/invoice/[token]`, OTP/kode klaim | `garage-member-cx` |
| Smart Approval, Decision Center, AI Governance | `garage-approval` |
| MCP ChatGPT, owner-ai, tool agen R0–R3, AYA | `garage-ai-mcp` (+ `garage-problem-solver`) |
| Mitra/partner, `/partner`, `/mitra`, settlement, payout | `garage-partner-hub` |
| Lineup & panitia event (band/stand-up, rundown, tugas), lineup GIGS di beranda | `garage-event-lineup` |
| Route API baru, staging, deploy, CI/E2E, backup | `garage-ops-deploy` |
| UI/desain, Crystal V5, MCP UI | `garage-ui-tooling` + `design-system/MASTER.md` |
| Website/halaman web baru atau dirombak (homepage, landing, halaman publik, section) | `garage-website` (memandu `ui-ux-pro-max` + `frontend-design` utama, `web-design-guidelines` + `vercel-react-best-practices` wajib) |
| Animasi/motion apa pun (CSS, Framer, GSAP, SVG, transisi) | `garage-motion` |

Invarian lintas modul (ringkas; detail di skill):
- Uang: setiap rupiah yang bergerak = baris immutable `cash_ledger_entries`; koreksi = reversal, tidak pernah
  UPDATE/DELETE; jangan tulis `cash_sessions.expected_cash` langsung (`postDrawerCash`). Kasir tidak pernah
  melihat saldo laci / expected cash saat shift terbuka.
- Stok: WMS = satu-satunya ledger fisik; `inventory_items.onHand` hanya cermin. Valuasi moving average.
- Keputusan R3 / uang = Owner + 2FA; agent key tidak pernah memutuskan approval.
- Setiap `src/app/api/**/route.ts` wajib guard (`KNOWN_ROUTE_GUARDS`) atau terdaftar di `public-routes.ts`.
- Jangan pernah log token/kode/secret; error ke klien tanpa SQL/stack.

## Verification

After app code changes, run:

```bash
npm run db:generate
npm run lint
npm run build
```

Then verify in browser:
- `http://127.0.0.1:3000/`
- desktop around `1366x900`
- mobile around `390x844`
- no console errors
- no obvious text overlap or clipped controls
- seeded login works after `npm run db:migrate` and `npm run db:seed`

For documentation-only changes such as Claude command files, app lint/build is optional.

Verifikasi hemat token (lihat skill `hemat-token`): selama bekerja jalankan test/lint yang relevan saja dan
`node scripts/ui-check.mjs <path>` untuk cek visual; build penuh + checklist di atas sebelum PR.
