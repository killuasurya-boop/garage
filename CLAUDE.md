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
- Prefer the readable wide logo asset at `public/garage-logo-wide.png`.
- Do not crop the Garage wordmark.
- Render the wide logo with `object-contain` only. Use a light chrome/white backing on dark surfaces so the black wordmark stays readable.
- Do not replace the primary app logo with the square social-media logo unless explicitly requested.

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

## POS Rules

- POS must stay fast for cashier/tablet use.
- Product/menu area stays primary; cart/payment remains reachable.
- Preserve menu variant pricing:
  - single-price items
  - Coffee `Cold` / `Hot`
  - Nasi Goreng `Sedang` / `Pedas`
  - Ayam Richeese `Barbeque` / `Balado` / `Campur`
- Cart lines must include item + variant + quantity.
- Totals must calculate from selected variant price.

## Inventory Rules

- Inventory is raw-material and consumable stock, based on the PDF-derived mock data.
- Preserve fields: `sku`, `name`, `alternativeName`, `category`, `unit`, `packageSize`, `onHand`, `min`, `status`, `movement`.
- Daily inventory excludes equipment/minimal tools; those belong in a future asset/equipment module.
- Keep low/watch/safe status readable and searchable.

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
