# Event & Special Menu Manager — release notes

## Scope and business rules

Existing invitations remain available. Events now support an outlet, banner, contextual menu prices, scheduled entries, configurable F&B bundles, public digital ordering, and sales/CSV reporting. Management uses existing `events:manage`; financial reporting additionally requires `finance:read`, and CSV requires `events:export`.

The owner explicitly chose unlimited physical stock. No new physical inventory gate or inventory decrement was introduced. A null event quota is unlimited; a configured quota is reserved atomically at checkout and restored once for rejected/voided orders that have not been accepted. Accepted orders retain consumption/quota; later refunds follow existing POS policy. Event orders must be accepted before splitting a bill.

Regular products and prices are unchanged. Bundles reference real products/variants, distribute fixed prices in whole rupiah, and preserve price/component/cost snapshots on the ordinary order. Existing cashier, payment, production, refund and stock pipelines remain authoritative. Historical HPP is unavailable when a recipe/cost cannot be verified; reports do not invent stock ledger attribution.

Event requests require a durable idempotency key. Reusing a key with different customer/cart data is rejected. A successful retry returns the original order even after the event closes. Public DTOs exclude cost snapshots. Draft preview requires an authorized staff session and cannot submit an order.

## Workbook reconciliation

Workbook references were compared to repository seed data only: 37 exact name/variant matches, 9 missing variants, 10 missing products, and 4 excluded tobacco rows. This is not a production database reconciliation. No catalog row, regular price, or production event was imported or changed. The four example bundles contain tobacco and were not instantiated; the implemented bundle manager supports food/drink references. Resolve valid F&B substitutions and map production product IDs before entering actual event offerings.

## Migration

`drizzle/0145_event_menu_commerce.sql` adds `events.outlet_id/banner_url`, `event_menu_entries`, `orders.event_id/client_request_fingerprint`, and `order_items.event_snapshot`, with constraints and indexes. Drizzle journal and schema snapshot accompany the SQL. Changes are additive and nullable for historical orders. The migration is reapplied strictly in the new checkout integration suite; legacy test harness migration error swallowing is not used as evidence for this migration.

## Rollout checklist

1. Review the PR, require successful CI, choose a quiet window, and obtain the owner's separate production deployment approval.
2. Verify the existing deployment backup step succeeds and retain the backup path/checksum. Restore a backup into an isolated database and run migration 0145 there before production.
3. Confirm the target production commit, current image, available disk, PostgreSQL health, and rollback image. Existing CI and deploy workflows are independent: merging main automatically deploys, so do not merge before approval and CI completion.
4. Deploy through the existing GitHub Actions VPS workflow. Check migration logs and explicitly verify the new table/columns/constraints: the legacy migration runner can log and continue past some errors.
5. Check `/api/health`, staff login, ordinary ordering, event draft preview, event CRUD, a published event's availability, POS receipt, payment, production, WMS ledger and event sales. Use an approved test event and reconcile any permitted test transaction.
6. Record deployed SHA, backup, migration result and smoke results. Do not label a local preview as production/staging verification.

## Rollback

Archive or deactivate the affected event to stop new event checkouts. Restore the previous application image using the existing deployment rollback mechanism. Keep additive database columns/tables and order snapshots intact; do not drop event history or rewrite regular prices. If database recovery is necessary, stop writes and use the verified backup with the owner's approval, accounting for transactions created after that backup. The normal app rollback does not require a destructive down migration.

## Verification record

Local production build passed; TypeScript passed; lint passed with one pre-existing unused constant warning in POS. Initial event suites: 7 files / 39 tests passed. Follow-up adds schedule-transition coverage. Independent static review found and resolved stale scheduled-menu availability; earlier review fixes cover replay join-code privacy, pending-order quota release and pre-acceptance split quota ownership.

Browser verification uses an isolated PGlite database and test account: 1366×900 desktop and 390×844 mobile, selectable bundle components, fixed package price, cart, guest validation, successful customer checkout and waiting-cashier state. No horizontal overflow or browser errors observed on the public event flow. Production backup/restore, production migration and production smoke are pending deployment approval.
