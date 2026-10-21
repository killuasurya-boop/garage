# Main digital menu event bundles: verification

## Implemented

- An audited, permission-checked event selector per outlet enables a published event on `/order` during its schedule.
- Bundle cards appear before visible standalone products, with accessible category navigation and a mobile cart bar. Hidden standalone products can remain eligible bundle components.
- Mixed checkout preserves authoritative regular/contextual/package prices, one existing POS/payment workflow, event snapshots and unlimited physical stock policy.
- Durable submission recovery freezes payload and key, survives refresh, and reconciles concurrent commits before definitive event/table rejection. Database failures return a safe retryable response.
- Event revenue/HPP uses event snapshot lines; payments are labelled as whole participating bills.

## Local evidence

- Eight targeted suites passed: 55 tests before the final recovery review.
- Final recovery, checkout and route suites passed: 24 tests, including the added concurrency and messaging failure regressions.
- Full lint: zero errors; one pre-existing unused logo warning in `pos-view.tsx`. Changed checkout files lint clean.
- `db:generate`: no schema changes.
- Browser: package + ordinary product + contextual Americano completed checkout (subtotal Rp67,000; QR discount Rp6,700; total Rp60,300) on isolated local data.
- Browser: a proxy intentionally replaced a successful committed checkout response with HTTP503. After refresh, the original request was recovered successfully using the saved payload/key.
- Mobile 390x844: package price and primary action fit without floating control overlap; sticky category navigation remains usable.
- Illustrative bundles in screenshots are local fixtures, not imported production configurations.

## Release safeguards

- No production test sales or automatic menu imports.
- Pre-release VPS baseline: 199 orders, 52 products, regular price hash `df08875266c3f7ea7eee5519495bd049`, zero event menu entries or selected main events.
- Backup: `garage-order-main-release-2026-10-22_031949.sql.gz`, SHA256 `86ccbfa701c250b80c0e5d2d03d5711a3bb17b5b21ad8058cf98fa5a8fa19b15`.
- Existing GitHub CI and VPS deployment workflow is required before production release.
