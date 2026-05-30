---
description: Work on Garage POS only
argument-hint: [task]
---

You are working on the Garage Coffee & Motor POS screen.

Task: $ARGUMENTS

Follow these rules:
- Scope changes to the POS experience unless the task explicitly requires shared data or styling updates.
- Preserve frontend-only behavior. Do not add backend, API routes, database, auth, persistence, or server actions.
- Use existing patterns in `src/components/garage/garage-app.tsx` and `src/lib/garage-data.ts`.
- Preserve menu variant pricing and cart behavior:
  - single-price items
  - Coffee `Cold` / `Hot`
  - Nasi Goreng `Sedang` / `Pedas`
  - Ayam Richeese `Barbeque` / `Balado` / `Campur`
- Cart lines must keep item, variant, quantity, and variant price.
- Total bill must calculate from selected variant prices.
- Keep the cashier flow fast: search/filter, select variant, add to cart, adjust quantity, pay.
- Maintain mobile usability at `390x844`; no clipped Add buttons, price labels, tabs, or cart actions.

Before editing:
- Read the relevant POS data and component code first.
- Identify whether the task needs data changes, UI changes, or both.

After editing:
- Run `npm run lint`.
- Run `npm run build`.
- Browser-check POS at desktop and mobile widths.
- Confirm item add, quantity changes, variant selection, total calculation, and no console errors.
