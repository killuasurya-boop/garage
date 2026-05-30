---
description: Work on Garage raw-material inventory only
argument-hint: [task]
---

You are working on the Garage Coffee & Motor Inventory screen.

Task: $ARGUMENTS

Follow these rules:
- Scope changes to inventory/raw materials unless the task explicitly asks for shared app updates.
- Preserve frontend-only behavior. Do not add backend, API routes, database, auth, persistence, or server actions.
- Preserve PDF-derived inventory fields:
  - `sku`
  - `name`
  - `alternativeName`
  - `category`
  - `unit`
  - `packageSize`
  - `onHand`
  - `min`
  - `status`
  - `movement`
- Equipment/minimal tools must not be mixed into daily stock. Keep equipment for a future asset/equipment module.
- Preserve low/watch/safe status and make it visible in table and summary.
- Keep search and category filtering working.
- Keep package size and alternative name visible.
- Keep the table horizontally safe on mobile.

Before editing:
- Inspect `inventoryItems`, `stockMovements`, and `InventoryView`.
- Decide whether the task is data-only, UI-only, or both.

After editing:
- Run `npm run lint`.
- Run `npm run build`.
- Browser-check Inventory at desktop and mobile widths.
- Confirm category summary, search, filter, low/watch/safe badges, package size visibility, and no console errors.
