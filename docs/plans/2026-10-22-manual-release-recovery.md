# Manual release recovery state

The owner requested completion through the manual SSH alternative after GitHub Actions billing prevented CI jobs from starting. Local full regression passed 146 files / 962 tests; local production build passed. PR #62 remains draft/unmerged; application source is `d1b3f7d7eb2dcbf25204119a22c126098d06efe1`, documentation follow-up is `07464bcf23b41b5939abb08cebdcf52c314ddf04`.

## Executed

- Read-only VPS preflight: PostgreSQL healthy, application reachable, 3915 MB RAM and 2047 MB swap, 33 GB disk available.
- Uploaded source archive SHA256 `d06f419bbdc6f6f8f5cd71e7cc18ccd28404fb6574e751b2eb1d772f0aa16323`.
- Extracted source under `/root/garage/releases/order-d1b3f7d` and started separate candidate Docker build. Log: `/root/garage/backups/manual-order-d1b3f7d-build.log`.
- Last read build phase was Next.js production compilation. Production health was confirmed during the earlier build phase.
- Prepared `/root/garage/manual-order-deploy.sh` with candidate verification, fresh backup/isolated restore, image switch and rollback. **This deploy script has not been executed.** No migration, image promotion, application restart or production test sale was performed by this manual release.

## Incident and recovery attempts

- Subsequently both HTTPS and SSH became unresponsive. GitHub HTTPS remained reachable from the same session, so the failure was isolated to the VPS/site path.
- Resource pressure from the candidate build is suspected from timing but not confirmed; host logs and resource state could not be read after the outage.
- The local SSH build session was interrupted. Subsequent SSH attempts to stop only the candidate `docker build --progress=plain --target runner` timed out during SSH banner exchange; those remote stop commands could not be confirmed as executed.
- Provider console access is needed if SSH remains unavailable. No Hostinger VPS connector or signed-in provider browser was available. The owner has been asked whether the provider console can be accessed.
- Do not resume build or execute the deployment script until the original application/DB are reachable and the resource incident is understood. Keep the previous production image and all database volumes/backups intact.

## Recovery evidence to collect

Use the provider console to identify/cancel this candidate build, inspect memory/swap, kernel OOM messages, Docker/container health and original application health. Check for an isolated restore database only if a future deployment script actually reaches that step. Prefer building the Linux candidate away from the production VPS after recovery.

## Provider recovery completed

- Official Hostinger MCP connection was repaired by retaining the damaged npm package cache and reinstalling the published package. No credentials were printed or added to the repository.
- Hostinger identified VM `2018980`, hostname `srv2018980.hstgr.cloud`, IP `201.18.211.55`, KVM 1, 1 vCPU / 4 GiB RAM. Metrics showed CPU at 100% and RAM about 95%.
- The owner explicitly confirmed one restart. Hostinger action `121301532` (`ct_restart`) completed successfully at 17:30 WIB on 22 October 2026.
- After restart SSH worked, all four production containers were running, PostgreSQL was healthy, `/api/health` confirmed reachable PostgreSQL and `/order` returned HTTP200. The original image remained `sha256:0911f47dfc9d936096e0671d1e0fca5d734ddc1f0e2368428fc65aa66d006b21`.
- Kernel logs confirmed global out-of-memory events killed the original Next server during the unbounded build. The candidate build had completed compilation and was running TypeScript; no candidate image existed.
- Follow-up build tooling introduces a dedicated builder capped at 2 GiB RAM + 1 GiB swap and 0.4 CPU, one BuildKit worker, a 1536 MiB Node heap, health/memory watchdog and immutable candidate tags. Its resource settings must be inspected before any build. A default-off standalone-only flag permits skipping duplicate Next typechecking only after the exact release source has passed a separate full local typecheck.
- Full local TypeScript passed after this configuration change, and three build-policy tests passed. The default CI/local build behavior still checks types.

## Bounded candidate follow-up

- Exact candidate source: `02e7021a27ddd32bedce0bdd474a993b8b9290a7`; archive SHA256 `b8773f66f8a8fdb64cc3e45c07c741fe5d03cc2eaf5c9a6901a7ad0a91f3390c`. Full separate TypeScript passed on this exact revision.
- Docker and the enclosing kernel cgroup both verified 2 GiB RAM, 1 GiB additional swap and 0.4 CPU. BuildKit has one worker. An exclusive lock and health/available-memory watchdog protect production; builds never retag the production image.
- The bounded Turbopack attempt was stopped after sustained memory pressure and slow compilation. Production stayed healthy; available RAM returned to about 2.9 GiB.
- A build-only Webpack recipe preserves the archived application source and changes only `RUN npm run build` to `RUN npm run build -- --webpack`. Recipe diff and hashes are recorded remotely. An initial CRLF matching issue was caught by inspecting the compiler banner and corrected with an explicit command assertion.
- Webpack with a 1536 MiB Node heap hit its isolated JavaScript heap limit. The next attempt uses a 2048 MiB heap inside the same unchanged container limits. This does not raise host limits or change application logic. Its log is `/root/garage/backups/manual-order-02e7021a27dd-webpack-v3-build.log`.
- Final deploy-script review added bounded health/Compose/post-switch checks, EXIT/signal rollback, immutable running-image verification, restore-check cleanup and a disk-space guard. Rollback reports success only after the original running image and public health are verified.
- No successful candidate promotion is recorded by these steps; record final release evidence below only after verification.
