# Event bundles on the main digital menu

## Approved scope

Keep `/order` and existing table QR links as the main customer entry point. Show the selected active outlet event's bundles first, alongside ordinary visible products in one cart. Apply contextual single-item prices without duplicating product cards or changing regular master prices. Standalone visibility and active bundle-component eligibility are separate. Preserve cashier, payment, production, stock and reporting pipelines.

## Implementation

1. Add an outlet-scoped, audited main-event selection in existing app_settings; require events:manage and a published event belonging to that outlet. One selected event per outlet, displayed only during its schedule.
2. Load selected active event in `/order`, preserving source, table, outlet, member return and waiter context. Keep the separate event page working.
3. Support mixed ordinary item rows and event bundle rows at checkout, with authoritative prices, optional quota locks, durable retry/fingerprint and historical snapshots. Attribute only event components to event menu revenue/HPP; distinguish whole-bill payments.
4. Refine existing Garage menu components: bundle-first layout, compact banner, readable cards, sticky search/categories with scroll cues, accessible controls, desktop cart and safe mobile cart bar. Avoid a second vertical scrollbar or clipped names/prices.
5. Test selection/permissions/schedule, hidden standalone components, mixed cart/pricing/replay/quota and report allocation. Verify production build, TypeScript, lint, regression and desktop/mobile browser checkout on isolated local data.
6. Independent review; publish a PR with evidence. Production changes use the existing approved backup/CI/deployment workflow, with no automatic workbook imports or production test sales.

## Visual direction

Garage industrial identity: dark asphalt, raised readable surfaces, chrome text, red primary actions and restrained amber event markers. Existing design tokens and fonts remain authoritative over generated generic skill suggestions. One primary ordering action per surface. Minimum 44px interaction targets, clear focus, honest loading/error/empty states and reduced-motion support.
