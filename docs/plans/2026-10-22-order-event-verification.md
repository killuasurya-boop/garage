# Main digital menu event bundles: verification

## Implemented

- An audited, permission-checked event selector per outlet enables a published event on `/order` during its schedule.
- Bundle cards appear before visible standalone products, with accessible category navigation and a mobile cart bar. Hidden standalone products can remain eligible bundle components.
- Mixed checkout preserves authoritative regular/contextual/package prices, one existing POS/payment workflow, event snapshots and unlimited physical stock policy.
- Durable submission recovery freezes payload and key, survives refresh, and reconciles concurrent commits before definitive event/table rejection. Database failures return a safe retryable response.
- Event revenue/HPP uses event snapshot lines; payments are labelled as whole participating bills.

## Local evidence

- Eight targeted suites passed: 55 tests before the final recovery review.
- Full local regression passed: 146 files / 962 tests. Browser database reconciliation also confirmed that recovery added no duplicate order or bundle usage.
- Final recovery, checkout and route suites passed: 24 tests, including the added concurrency and messaging failure regressions.
- Full lint: zero errors; one pre-existing unused logo warning in `pos-view.tsx`. Changed checkout files lint clean.
- `db:generate`: no schema changes.
- Final production build, including TypeScript: passed with the same build-only auth/database placeholders used by the Docker builder.
- Browser: package + ordinary product + contextual Americano completed checkout (subtotal Rp67,000; QR discount Rp6,700; total Rp60,300) on isolated local data.
- Browser: a proxy intentionally replaced a successful committed checkout response with HTTP503. After refresh, the original request was recovered successfully using the saved payload/key.
- Mobile 390x844: package price and primary action fit without floating control overlap; sticky category navigation remains usable.
- Illustrative bundles in screenshots are local fixtures, not imported production configurations.

## Release safeguards

- No production test sales or automatic menu imports.
- Pre-release VPS baseline: 199 orders, 52 products, regular price hash `df08875266c3f7ea7eee5519495bd049`, zero event menu entries or selected main events.
- Backup: `garage-order-main-release-2026-10-22_031949.sql.gz`, SHA256 `86ccbfa701c250b80c0e5d2d03d5711a3bb17b5b21ad8058cf98fa5a8fa19b15`.
- The normal release path uses GitHub CI and the existing VPS workflow. On 22 October the owner approved the proposed manual SSH deployment alternative after GitHub Actions billing prevented the job from starting. Local full regression, production build, independent review, verified backup and rollback remain required; GitHub checks are not represented as passing.
- Isolated restore of this backup passed: 199 orders, 52 products, identical regular price hash. The temporary restore database was removed.
- PR #62 CI run `39669610410` did not start any test steps: GitHub reported failed account payments or an exhausted spending limit. A rerun through the reconnected GitHub app also failed before steps began. A separate candidate image is being built from tested source commit `d1b3f7d7eb2dcbf25204119a22c126098d06efe1`; no production switch is recorded until smoke verification passes.
