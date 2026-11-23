---
name: garage-ops-deploy
description: Aturan WAJIB staging, security guard route API, release-check/deploy/smoke, E2E, backup terenkripsi. Muat sebelum menambah route API, mengubah script deploy/backup/CI, atau menyentuh staging.
---

# garage-ops-deploy

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

- Staging (R1, `docs/STAGING.md`): `docker-compose.staging.yml` in `/root/garage-staging` on the same VPS, own DB
  `garage_staging`, app joins `garage_default` as `garage-staging-app` for the prod Caddy (`caddy-sites/staging.caddy`,
  basic auth). Data = prod dump anonymized by `scripts/staging-anonymize.sql` (refuses non-staging DB names); outbound
  messaging/AI keys off. Deploy any branch with `scripts/deploy-staging.sh`; prod stays `scripts/deploy-manual.sh`.
  Staging service names MUST be `staging-*` (never `app`/`db`): a same-named service on `garage_default` made prod
  Caddy load-balance into staging (incident 28 Okt 2026, random "Silakan login"). `scripts/staging-network-guard.sh`
  stops staging when `app`/`db` resolve to more than one container.
- Security guards (audit 29 Okt 2026, F1): every `src/app/api/**/route.ts` must call a known guard (`KNOWN_ROUTE_GUARDS`) or be
  listed in `src/lib/public-routes.ts` with a reason + abuse guard — enforced by `api-route-auth.test.ts`. Attendance PIN
  guessing = `pin-attempt-guard.ts` (DB, survives restart); Better Auth `rateLimit.storage: "database"` (table `rate_limit`,
  migration 0170). CSP is report-only (`next.config.ts` → `/api/csp-report`, audit_logs `csp_violation`); staging has its own
  `BETTER_AUTH_SECRET` (2FA/JWKS cleared by `staging-anonymize.sql`).
- Release safety (29 Okt 2026, `docs/DEPLOY_MANUAL.md`): `scripts/release-check.sh` must pass on the MERGED main before
  `deploy-manual.sh` (stamp `.git/garage-release-check` = SHA; catches combined-PR breakage like the API catalog);
  deploy runs `scripts/smoke-prod.sh` after health (fail → rollback). `scripts/vps-monitor.sh` (cron, read-only) →
  `POST /api/jobs/system-alert` (job secret) → `notifyStaff` push to Owners, dedup 1×/hour/check (`src/lib/system-alert.ts`).
  `scripts/restore-drill.sh` restores the latest backup into a throwaway container on its own network (never `garage_default`).
- E2E (audit #8, F3): `npm run test:e2e` = Playwright `e2e/critical-flows.spec.ts` (login, POS tunai/QRIS, tutup shift + setoran,
  Owner PDF/Excel, Kelola Staff scroll) on a FRESH PGlite (`e2e/start-server.mjs` → migrate → seed → `next dev :3101`); seed password
  random per run; local Chrome (`E2E_BROWSER_CHANNEL=""` + `playwright install chromium` in CI). Runs in `release-check.sh`
  (`--skip-e2e` = emergency, stamped). Scroll checks must use wheel/touch, not `scrollIntoView` (code can scroll overflow-hidden).
  CI template `docs/ci/ci.yml` (Owner moves it to `.github/workflows/`; agent token lacks `workflow` scope).
- Offsite backups are GPG-encrypted (audit #11): `scripts/pull-backups.sh` encrypts with the Owner's PUBLIC key only
  (`~/.garage-ops/backup-public.asc`, made once by `scripts/setup-backup-key.sh`) and deletes plaintext; opening needs the Owner's
  private key + passphrase (`scripts/restore-from-encrypted.sh --check|--drill|--out`). Never store the private key or passphrase
  in the repo, OneDrive, logs or scripts; never type them for the Owner.

- Deploy VPS me-reload Caddy (23 Nov 2026): `deploy.yml` menjalankan `caddy validate` lalu `caddy reload` setelah
  `up -d`, karena Caddy yang sudah jalan tidak membaca ulang Caddyfile hasil scp (aturan /event/* #255 sempat tidak
  aktif). Validasi gagal = deploy berhenti, Caddy tetap aturan lama. Cek kesehatan juga memeriksa
  `/event/gigs-akhir-tahun-2026/` (peringatan saja, tanpa rollback).
