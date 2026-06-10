# Audit Findings â€” Garage OS

> Tabel jejak temuan. Tambah baris dari atas (terbaru di atas).
> Severity: ðŸ”´ Critical Â· ðŸŸ  High Â· ðŸŸ¡ Medium Â· ðŸŸ¢ Low
> Status: `open` Â· `fixing` Â· `fixed` Â· `verified`

| ID | Tanggal | Modul | Severity | Ringkasan | File | Status | Owner |
|----|---------|-------|----------|-----------|------|--------|-------|
| UI-001 | 2026-06-06 | UI / Hydration / LCP | Medium | Browser audit menemukan hydration mismatch di `/control` (`BarStream` float style server/client beda) dan warning LCP logo landing. | `src/components/ceo/GarageOwnerDashboard.tsx`, `src/components/garage-website/garage-website.tsx` | **fixed** (Codex) - height dibulatkan deterministik, logo above-fold `loading="eager"`/`fetchPriority="high"` via preload; browser verify error/warning 0, lint/tsc/build exit 0 | - |
| BUILD-001 | 2026-06-05 | Build / Routing | Medium | `next build` gagal prerender `/control/profitmax` karena route control belum opt-out static generation | `src/app/control/profitmax/page.tsx` | **fixed** (Codex) - tambah `dynamic = "force-dynamic"`, build ulang exit 0 | - |
| LINT-001 | 2026-06-04 | Lint config | ðŸŸ¡ Medium | `garage-profitmax/` + `outputs/moodboards/` masuk lint scope â†’ 84 error + 16 warning | `eslint.config.mjs` | **fixed** (Claude) | â€” |
| CLEAN-001 | 2026-06-04 | Repo hygiene | ðŸŸ¢ Low | 4 one-shot patch script di root | root | **fixed** (Claude) | â€” |
| PERF-001 | 2026-06-04 | DB / N+1 | ðŸŸ¡ Medium | 3 N+1 query candidate. **Re-assessed (Claude):** N kecil di produksi â€” line 5391 punya early-exit guard; line 2174 & 11956 maks 3 shift/hari Ã— 3 query. Risiko refactor > benefit. | `src/lib/garage-service.ts:2174,5391,11956` | **deferred** â€” re-evaluate kalau N tumbuh | Codex |
| DB-001 | 2026-06-04 | DB config | ðŸŸ¢ Low | Hardcoded Windows path default PGlite data dir | `src/db/index.ts` | **fixed** (Claude) â€” fallback ke `path.resolve(cwd, ".pglite-data")` cross-platform; existing PGLITE_DATA_DIR env tetap honored | â€” |
| ENC-001 | 2026-06-04 | Encoding | ðŸŸ¢ Low | Corrupt UTF-8 char `Ã¢â‚¬"` | `src/db/index.ts:152` | **fixed** (Claude) | â€” |
| SEC-001 | 2026-06-04 | API surface | ðŸŸ  High | Route mutasi public di luar allowlist | beberapa | **fixed** (Claude) â€” allowlist expanded, re-audit drop ke high=1 | â€” |
| SEC-005 | 2026-06-04 | Admin endpoint | ðŸ”´ Critical | `/api/admin/seed-training` GET tanpa auth | `src/app/api/admin/seed-training/route.ts` | **fixed** (Claude) â€” Owner/Admin guard, verify anon 401 | â€” |
| SEC-006 | 2026-06-04 | POS idempotency | ðŸŸ  High | `/api/pos/sync-transaction` tanpa idempotency | `src/app/api/pos/sync-transaction/route.ts` | **fixed** (Claude) â€” X-Idempotency-Key cache 60s | â€” |
| KIT-001 | 2026-06-04 | Kitchen race | ðŸŸ¡ Medium | `updateKitchenStatus` race condition | `src/lib/garage-service.ts:9158-9180` | **fixed** (Claude) â€” WHERE expected-status guard + idempotent fallback | â€” |
| INV-001 | 2026-06-04 | Inventory status | ðŸŸ¢ Low | Dead branch `inventoryItems.status === "critical"` (line 3008). Line 5031/13658 ternyata `auditLogs.status` (false alarm). | `src/lib/garage-service.ts:3008` | **fixed** (Claude) â€” dead branch dihapus | â€” |
| PERF-002 | 2026-06-04 | Bundle size | Medium | Chunk 824 KB. Babel deopt source >500KB | `src/components/garage/garage-app.tsx` | **fixed** (Codex) - Claude: dynamic import + helper/picker extract. Codex: extract `DashboardView`, `CrmView`, `SettingsView`, `InventoryView`, `KitchenView`, dan `PosView`. Build final: JS chunk terbesar **294,505 bytes**, CSS terbesar **453,278 bytes**, `garage-app.tsx` **423,668 bytes**; Babel deopt hilang dari lint | - |
| TEST-002 | 2026-06-04 | Smoke teardown | ðŸŸ¢ Low | "PGlite belum siap" muncul karena `ensureGarageMemberLoyaltySeed` di proses smoke butuh PGlite booted (smoke HTTP-only) | `src/scripts/smoke-garage-lan.ts:204-225,349-358` | **fixed** (Claude) â€” try/catch graceful skip | â€” |
| ROUTE-001 | 2026-06-04 | Routing | ðŸŸ¢ Low | `/website` empty folder | `src/app/website/` | **fixed** (Claude) â€” folder dihapus | â€” |
| TEST-001 | 2026-06-04 | Smoke script | ðŸŸ¡ Medium | `smoke` cek `status === "reachable"` strict, fail di PGlite | `src/scripts/smoke-garage-lan.ts:229` | **fixed** (Claude) â€” `startsWith("reachable")` | â€” |
| SEC-002 | 2026-06-04 | Member auth | ðŸŸ  High | Member login test fail (401) â€” member smoke 081300001001 belum di-seed di PGlite | `/api/member/auth/login` | **fixed** (Claude) â€” POST `/api/member/auth/register` live, smoke 100% pass | â€” |
| SEC-003 | 2026-06-04 | POS member | ðŸŸ¡ Medium | POS member lookup 404 â€” root cause sama: member smoke belum di-seed | `/api/pos/member/[phone]` | **fixed** (Claude) â€” sekarang data ada (registered via API) | â€” |
| SEC-004 | 2026-06-04 | Health endpoint | ðŸŸ¡ Medium | LAN health 503 karena IP drift + DB lokal lama tidak sehat. `.env.local` sudah diarahkan ke `192.168.110.96`, PGlite LAN baru dipakai, dan smoke member di-seed di DB LAN. | `.env.local:3-6`, `drizzle.config.ts`, `D:/GARAGEFIX/pglite-data-lan-20260605` | **fixed** (Codex) - readiness `GO`, security audit `PASS` high=0 medium=0 | - |

---

## Detail Finding

### LINT-001
- **Tanggal:** 2026-06-04
- **Modul:** Lint config / Repo hygiene
- **Severity:** ðŸŸ¡ Medium
- **Repro:** `npm run lint`
- **Expected:** 0 error, main `src/` clean
- **Actual:** 100 problems (84 errors, 16 warnings) â€” semua dari folder eksperimen:
  - `garage-profitmax/` (CommonJS sub-project) â†’ `@typescript-eslint/no-require-imports`
  - `outputs/moodboards/garage-qr-order/board/app.js` â†’ unused vars
- **Analisis:** Main `src/` 0 error. Folder `garage-profitmax/` adalah sub-app eksperimen yang seharusnya di-ignore lint (pakai CommonJS sengaja). Folder `outputs/` adalah artifact generated.
- **File:** `eslint.config.mjs` lines 9-18 (globalIgnores)
- **Saran fix:** Tambah ke `globalIgnores`:
  ```js
  "garage-profitmax/**",
  "garage-profitmax-ui/**",
  "outputs/**",
  ```
- **Owner Fix:** Codex
- **Commit Fix:** â€”
- **Status:** open

---

### CLEAN-001
- **Tanggal:** 2026-06-04
- **Modul:** Repo hygiene
- **Severity:** ðŸŸ¢ Low
- **Issue:** 4 file one-shot patch script di root project yang sudah tidak dipakai:
  - `fix-escapes.js` â†’ patch `src/app/saas-executive/page.tsx`
  - `patch-dashboard.js` â†’ patch `src/components/company-control/company-control-center.tsx`
  - `patch-saas-ts.js` â†’ patch `src/app/saas-executive/page.tsx`
  - `patch-ts.js` â†’ patch `src/components/company-control/company-control-center.tsx`
- **Analisis:** Pure CommonJS one-shot scripts hardcoded path absolut. Tidak ada di package.json scripts. Sudah selesai dipakai sebelumnya.
- **Saran fix:** Hapus 4 file tersebut, atau pindah ke `archive/`.
- **Owner Fix:** Codex
- **Status:** open

---

### PERF-001
- **Tanggal:** 2026-06-04
- **Modul:** DB query patterns (garage-service)
- **Severity:** ðŸŸ¡ Medium
- **Issue:** Pattern `Promise.all(rows.map(async (row) => await db.query...))` di 3 fungsi â€” eksekusi paralel tapi tetap N query per N rows:
  1. `getKitchenShiftReport` (line 2174) â€” 3 query Ã— N sessions
  2. Customer orders list (line 5391) â€” `ensureCustomerOrderInvoiceLink` per row
  3. Cash session detail loop (line 11956) â€” `getCashSessionSummary` per row
- **Risiko:** Saat N besar (mis. closing report bulanan), latency tinggi + connection pool tertekan.
- **Saran fix:** Pre-fetch dengan single query + group by ID di memory, atau pakai SQL JOIN/subquery.
- **Owner Fix:** Codex (refactor lanjut Fase 6 / Performance)
- **Status:** open

---

### BUILD-001
- **Tanggal:** 2026-06-05
- **Modul:** Build / Routing
- **Severity:** Medium
- **Repro:** `npm run build`
- **Expected:** Production build selesai dan semua route control aman dari prerender DB/browser runtime.
- **Actual:** Build sempat gagal saat prerender `/control/profitmax` dengan `RuntimeError: Aborted()`.
- **Analisis:** Wrapper `src/app/control/profitmax/page.tsx` belum mengekspor `dynamic = "force-dynamic"`, berbeda dari route control lain yang memakai data/session runtime.
- **Fix:** Tambah `export const dynamic = "force-dynamic";`.
- **Verification:** `npm run build` ulang exit 0; `/control/profitmax` tercatat dynamic (`Æ’`) di output build.
- **Owner Fix:** Codex
- **Status:** fixed

---

<!-- Template:

### BUG-001
- **Tanggal:** 2026-06-04
- **Modul:** POS / Cart
- **Severity:** ðŸ”´ Critical
- **Repro:** 1. ... 2. ... 3. ...
- **Expected:** ...
- **Actual:** ...
- **File:** `src/components/garage/garage-app.tsx:1234`
- **Owner Fix:** Codex
- **Commit Fix:** â€”
- **Status:** open

-->
