# CHECKLIST AUDIT - Garage OS

> **Tanggal Mulai:** 2026-06-07
> **Status:** Dalam Pengerjaan
> **Tujuan:** Memastikan aplikasi Garage OS terhubung dengan baik, tidak ada bug, dan integritas data terjaga

---

## FASE 1: Audit Konektivitas Backend (API → Schema → Service)

### 1.1 API Route Handlers — IN PROGRESS (audit struktural selesai)
**Inventaris:** 273 file route, 353 handler (GET/POST/PUT/PATCH/DELETE) di `src/app/api/`.

- [x] Audit semua route handler di `src/app/api/` — inventarisasi selesai
- [~] Validasi Zod: **105/273 file (~38%)** import Zod. 168 file tanpa Zod (sebagian besar GET — wajar; perlu audit per-method untuk POST/PUT/PATCH/DELETE)
- [ ] **Error handling pattern TIDAK KONSISTEN ❌** — CLAUDE.md mensyaratkan `{ error: { code, message } }`. Hanya **1 file** pakai shape itu (`customer/qr/route.ts`). **18 file (61 occurrence)** masih pakai shape lama `{ error: 'string' }`, semuanya di cluster `/api/hr/*` dan `/api/staff/*`. Sisanya pakai variasi lain. **Perlu standardisasi.**
- [ ] HTTP status code — belum diaudit per-route
- [x] Tidak ada route yang reference schema/table tidak ada — **TSC bersih** (`tsc --noEmit` 0 error)
- [x] Tidak ada import dari module yang tidak exist — **TSC bersih**
- [x] Lint clean — `npm run lint` 0 error (3 warning unused-import sudah dibersihkan)

**Issue baru ditemukan:**
1. ~~**Error shape inkonsisten** (severitas: medium) — 18 file cluster HR/Staff pakai `{ error: string }` lawan rule project.~~ ✅ **FIXED** — 18 file di-retrofit ke `fail(status, CODE, message)` helper dari `@/lib/api-response`. 3 client consumer (team-shift-handover, employee-clock-panel, garage-training-module) di-upgrade ke pattern backward-compatible `data?.error?.message ?? (typeof data?.error === "string" ? data.error : fallback)`. TSC + Lint clean.
2. **try/catch coverage 37%** — 102/273 file. Sisanya bergantung pada Next.js error boundary atau memang tidak butuh (handler trivial). Perlu spot-check per modul mission-critical (POS, kitchen, finance).
3. **Success shape inkonsisten** (severitas: low) — HR/staff routes return ad-hoc shape (`{ staff }`, `{ logs }`, `{ success: true }`) bukan `{ data }` per CLAUDE.md. Tidak ditangani di batch ini karena perubahan shape sukses berdampak ke banyak konsumen. Followup terpisah.

**Issue checklist sebelumnya — status update:**
- ✅ Hard-coded ownerId di `garage-service.ts` (Task #8 lama) — **TIDAK DITEMUKAN** lagi. `grep` 0 match di seluruh `src`. Sudah resolved.

### 1.2 Database Schema (`src/db/schema.ts`) — SELESAI ✅
**Inventaris:** 88 table, 148 foreign key, 26 index. File ~2,212 baris.

- [x] Semua table terdefinisi dengan benar — `db:generate` lewat: "No schema changes, nothing to migrate"
- [x] Foreign key & relasi konsisten — drizzle resolve 148 FK tanpa error
- [~] Type inference exported — hanya 1 export type langsung di schema (`StaffRole`). Konsumen pakai `$inferSelect/$inferInsert` inline di 15 file (59 occurrence). Bukan bug, tapi tidak konsisten. **Saran:** ekspor `type X = typeof xTable.$inferSelect` per table mission-critical (orders, payments, customers) untuk DX.
- [x] Index ada untuk query frequent (rata-rata 2-7 index per table mission-critical: orders 7, staff_earnings 6, payment_settlements 4)
- [x] Tidak ada orphan table terdeteksi — TSC bersih + drizzle migrate-diff bersih

### 1.3 Service Layer (`src/lib/garage-service.ts`) — SELESAI ✅
**Inventaris:** 14,704 baris, 149 exported function, dipakai 174 file.

- [x] Query/mutation function lengkap — 149 export, mencakup semua modul (POS, kitchen, inventory, finance, CRM, approvals, audit, HR)
- [~] Validasi mutation — sebagian pakai Zod di route layer dulu (acceptable), tapi tidak terstandardisasi
- [~] Try/catch hanya 9 occurrence — pola yang dipakai adalah membiarkan error bubble ke route handler. Acceptable, **tapi** route handler juga banyak yang tidak try/catch (lihat Fase 1.1) → potensi unhandled rejection.
- [x] Tidak ada circular dependency — TSC bersih
- [x] Konsistensi return type — sebagian besar `Promise<T>` eksplisit atau inferred

**Issue baru / catatan refactor (non-blocking):**
1. **God-file 14.7k baris** — service layer 1 file. Suggested split: `garage-service.{pos,kitchen,inventory,finance,crm,hr,ai}.ts`. Bukan bug, tapi maintainability risk.
2. **Defensive try/catch gap** — kombinasi service tanpa try/catch + route tanpa try/catch = error berpotensi crash route. Audit per-modul kritis (POS/orders/payments) untuk pastikan ada minimal 1 boundary.

---

## FASE 2: Audit Frontend Navigasi & State Management

### 2.1 Routing & Navigasi — SELESAI ✅
- [x] **20 modul** di registry `src/lib/garage-data.ts:131` (`modules[]`), semua match dengan branch rendering di `src/components/garage/garage-app.tsx` (line 1381-1524)
- [x] Cross-link via single-page tab — `activeModule` state, gated by `allowedModules` (RBAC via `role-access.ts`)
- [x] Module registry ter-update — TypeScript `ModuleId` union match 20 entries
- [x] **"8 route duplikat" dari checklist lama — KESALAHAN BACA.** `src/app/control/_dashboard/*` adalah folder **private** (underscore = non-routable di Next.js). 17 page `control/X/page.tsx` adalah thin wrapper yang re-export `_dashboard/X/page.tsx`. Pattern intentional, bukan dead code. **Tidak ada dead route.**

### 2.2 Component & View — SELESAI ✅
- [x] 70 file di `src/components/garage/`. View utama lengkap: pos-view, kitchen-view, inventory-view, crm-view, dashboard-view, settings-view, earnings-view, waiter-view, membership-admin-view, finance/finance-view, approvals-board, audit-log-viewer
- [~] **Data fetching pattern** — 25 komponen pakai direct `fetch()` di useEffect, **0 pakai SWR/React Query**. Ad-hoc, no centralized cache. (lihat 2.3)
- [~] **Loading/error state komponen reusable** sudah dibuat (`GarageEmpty/Error/LoadingRows/InlineMessage` di `garage-state-display.tsx`) tapi **baru retrofitted ke 5 file** (approvals-board, finance-view, sales-history, garage-app, garage-state-display itu sendiri). Rollout incremental, in-progress per recent commits.
- [~] Responsive — Tailwind breakpoints heavy (pos-view: 117 occurrence sm/md/lg). Spot-check OK, verifikasi visual butuh browser (deferred).

### 2.3 State Management — SELESAI ✅
- [x] Data flow: View → fetch() → API → service → DB. Konsisten arsitektur.
- [ ] **Cache invalidation: TIDAK ADA pola sentral.** Tanpa SWR/React Query, setiap komponen harus manual re-fetch setelah mutation. Risiko: stale UI setelah POS/kitchen/inventory mutation.
- [ ] **Optimistic update: TIDAK ADA pola sistematis.** Cek per-modul kritis (POS) untuk lihat apakah cart update langsung atau tunggu server.
- [~] **localStorage persist** — ada di beberapa tempat (auto-logout-watcher, settings drawer). Tidak ada audit menyeluruh.

**Action items Fase 2 (prioritas):**
1. ~~**(high)** Implementasi pattern cache invalidation~~ ✅ **DONE (foundation + template)** — pilihan: **custom event-bus + hook** (zero dependency, sesuai CLAUDE.md).
   - `src/lib/garage-cache.ts` — tag-based pub/sub: `GARAGE_TAGS`, `invalidateGarageCache(tags)`, `subscribeGarageCache`, `getGarageCacheVersion` (untuk `useSyncExternalStore`).
   - `src/lib/use-garage-query.ts` — `useGarageQuery(fetcher, { tags, key, enabled })` membungkus `garageApi`, auto-refetch saat tag di-invalidate + saat `key` (filter) berubah, return `{ data, error, loading, refetch }`.
   - **Dua idiom retrofit:**
     - (a) **useGarageQuery** — ganti `useEffect+fetch` untuk view yang OWN primary read. Dipakai di `sales-history.tsx` (tag `orders`).
     - (b) **subscribe listener** — untuk view dgn refetch imperatif kompleks / prop-driven, cukup `subscribeGarageCache(tag, refetch)`. Dipakai di `finance-view.tsx` (tag `finance`) & `garage-app.tsx` (tag kitchen/inventory/customers).
   - **Producer (invalidate):** `pos-view.tsx` — submit order → invalidate `orders/finance/kitchen/inventory/dashboard/customers`; void order → `orders/finance/inventory/dashboard`.
   - **Loop cross-module aktif:** POS submit/void → Sales History, Finance overview, Kitchen queue, Inventory notif, CRM auto-refresh tanpa reload.
   - Verifikasi: **tsc 0, lint 0, `npm run build` SUKSES** (45s). **Browser runtime NOT verified** (port 3001 ditempati proses lain yg balas 500; butuh DB+login+transaksi penuh). Logika pub/sub straightforward.
   - **Coverage akhir (consumer per tag):**
     - `orders` → sales-history (useGarageQuery)
     - `finance` → finance-view, earnings-view (listener)
     - `kitchen` → garage-app hub (listener → loadKitchenOrders)
     - `inventory` → garage-app hub + inventory-view (listener)
     - `customers` → garage-app hub (listener → loadCustomers) → crm-view & membership-admin-view auto via props (prop-driven, tak perlu retrofit terpisah)
   - **Build final:** `npm run build` SUKSES (174 pages). tsc 0, lint 0.
   - **Sisa retrofit (opsional, low value):** audit-log-viewer & marketing — butuh producer baru (`invalidateGarageCache(audit/marketing)`); diminishing returns, ditunda.
2. **(medium)** Retrofit `GarageEmpty/Error/LoadingRows` ke sisa view (kitchen, pos, inventory, crm, dashboard, earnings, waiter, membership)
3. **(low)** Audit localStorage key naming convention & TTL

---

## FASE 3: Audit Business Logic & Integrasi End-to-End

### 3.1 POS → Kitchen → Inventory → Finance Flow — SELESAI ✅
**Sumber:** `createOrder()` di `garage-service.ts:8336`. Seluruh alur dalam **SATU transaksi DB atomik** (`db.transaction`). Arsitektur sangat solid.

- [x] **Order creation: POS → DB** — route `POST /api/orders` dgn rate-limit (30/menit), Zod schema lengkap, idempotency key, `ok/fail` shape. Validasi: open cash session wajib, variant existence, billing totals (service+tax), voucher, manual discount (+ approval gate di atas threshold), split payment (sum === total).
- [x] **Kitchen queue** — `kitchenTickets` insert per `targetGroup` (station routing via `kitchenTargetGroupForCategory`), status `"queue"`, target minutes, itemNotes per item. Multi-ticket per order (dapur vs bar terpisah).
- [x] **Inventory deduction** — recipe-based via `menuRecipes` join, deduct dgn **waste% multiplier**, update `inventoryLocationStocks` (per-outlet), insert `stockMovements` (type `recipe_deduct`), low-stock warning bila `< min`. **CATATAN:** deduction terjadi saat **order CREATION** (bukan saat order selesai). Wajar untuk POS bayar-di-muka, tapi beda dari teks checklist lama ("saat order selesai").
- [x] **Finance recording** — `payments` insert (single/split), `cashSessions.expectedCash` auto-increment utk kontribusi cash, voucher redemption tercatat. Revenue mengalir ke cash session aktif.
- [x] **CRM update** — member: `points` + `tier`/`cardTier` (annual-spend based level), `visits++`, `lastOrder`, `memberTransactions` (earn), **referral bonus** dua arah (referrer + referee, idempotent via existing-check).
- [x] **Bonus:** audit log (2x: stock deduct + create order), table session → status "paid", **print job receipt** auto-queued.

**Kualitas:** atomic, fail-fast (validasi sebelum transaksi), idempotent. Tidak ada gap konektivitas terdeteksi di alur inti.

### 3.2 Menu Digital Integrity ✅ (SELESAI)
- **File:** `src/lib/garage-data.ts`
- **Total Items:** 79 menu items
- **Total Variants:** 77 variants (embedded dalam menu items)
- **Kategori:** Makanan, Cemilan, Coffee, Non-Coffee
- **Status:** GOOD - Tidak ada critical issue
- **Warnings:**
  - Typo: "Coffe Gula Aren" → seharusnya "Coffee Gula Aren"
  - baseCost tidak konsisten (hanya di Burger & Kebab)
  - Tidak ada imageUrl di menu items
- **POS View:** Logic variant & pricing sudah benar
- **Cart Resolution:** `line.variant.price * line.qty` ✅

### 3.3 Approvals & Audit — SELESAI ✅
**Approval workflow** (`decideApproval` @ `garage-service.ts:12175`):
- [x] request → review → approve/reject. Route `PATCH /api/approvals/[id]` gated `approvals:decide`, reject wajib alasan ≥5 char (Zod refine + guard ganda di service).
- [x] **Dispatcher cerdas** by ID prefix: `APP-VOID-` → `voidOrder`, `APP-OPN-` → opname approve/reject, expense via `resolveExpenseIdFromApprovalId`. State guard: tolak approval yang sudah `!== pending`.
- [x] Approval lintas-modul (expense, opname) juga punya route sendiri dgn `requireAnyPermission(["finance:write"|"inventory:write", "approvals:decide"])`.

**Audit log:**
- [x] 29 insert site di service + helper `createAuditLog`. Tercatat di mutasi kritis: create order, recipe stock deduct, approval decision, void, dll.

**Permission gating (RBAC):**
- [x] **268/273 route ter-gate.** Helper: `requirePermission`, `requireAnyPermission`, `requireGarageSession`, `requireMember`, `requireGarageAiJobAuthorization` (cron token), `requirePosTerminal` (POS API key).
- [x] **5 route ungated — semua SAH:**
  - `dev/demo-login` → guard `NODE_ENV !== "production"` (404 di prod) ✅
  - `hr/attendance` + `hr/attendance/check` → kiosk publik, PIN hash + `checkRateLimit` per-IP ✅ (intentional)
  - `member/auth/logout` → low-risk (clear session) ✅
  - `website-events` → public analytics ingest ✅
- **Tidak ada route mutasi sensitif yang terekspos tanpa auth.**

### 3.4 Error Handling End-to-End
- [ ] Frontend: try/catch di setiap fetch
- [ ] Backend: try/catch di setiap route handler
- [ ] User-facing error message konsisten
- [ ] Logging untuk debugging

---

## FASE 4: Build & Verifikasi

### 4.1 Type Safety — SELESAI ✅
- [x] `npx tsc --noEmit` → **exit 0, 0 error**
- [~] `any` type: tidak diaudit menyeluruh, tapi lint `no-explicit-any` aktif
- [x] Strict mode aktif

### 4.2 Lint — SELESAI ✅
- [x] `npm run lint` → **0 error, 0 warning** (3 warning lama sudah dibersihkan)

### 4.3 Build — SELESAI ✅
- [x] `npm run db:generate` berhasil ("no changes")
- [x] `npm run build` → **BERHASIL** (Next.js 16.2.6 Turbopack, compiled 31.9s)
- [x] Build tidak require live DB (lazy init)
- ⚠️ **CATATAN PENTING:** build pertama GAGAL dgn type error palsu di `.next/dev/types/validator.ts:620` (generated file). **Bukan bug kode** — stale `.next` cache. Fix: `rm -rf .next` lalu rebuild → sukses. Jika CI/deploy kena error serupa, bersihkan `.next` dulu.

### 4.4 Browser Verification — SELESAI ✅ (runtime, port 3001 pglite)
**Catatan DB:** awalnya pglite `pglite-data-running` korup (WASM `Aborted()`). Fix: backup dir korup → `drizzle-kit push --force` (migrate hang di pglite, push works) → `db:seed`. DB jadi reachable. **3 path PGLITE_DATA_DIR SUDAH DISELARASKAN** ke `D:/GARAGEFIX/pglite-data-lan-20260605` (DB kanonik: 15 user, 20 order, 1 outlet): .env.local (tetap) + launch.json (dari `...running`) + drizzle.config fallback (dari `...pglite-data`). Verifikasi: preview pakai DB selaras → health reachable, login owner OK, serve 20 order asli. Dir korup di `.bak-*`; `pglite-data-running` (seed test) bisa dihapus.

- [x] App load: `GET /` 200, landing render penuh, **0 console error**
- [x] `/api/health` → `{"data":{"ok":true,"database":{"status":"reachable (local PGlite)"}}}`
- [x] **Login seed user berhasil** — demo-login kasir@garage.local → sesi aktif
- [x] **Error shape runtime terbukti** — `/api/hr/attendance/check` balas `{ error: { code:"VALIDATION_ERROR", message } }` (400) & `{ code:"PIN_NOT_FOUND" }` (404). Konfirmasi kerja error-shape sesi ini live.
- [x] **useGarageQuery runtime** — `/sales-history` fetch via hook, envelope `{ data }` ter-parse, empty-state render, 0 console error.
- [x] **End-to-end POS→DB→Sales History** — buka shift → POST /api/orders (Kentang Goreng 2x) → order POS-67382785 + tiket K-38278527 + total Rp23.100 (transaksi atomik OK) → muncul di Sales History (screenshot: INV-POS-67382785, LUNAS, Rp23.100, tema asphalt, angka tak terpotong).
- [~] **Auto-invalidate pub/sub (UI click-through):** consumer (useGarageQuery) & data flow terbukti; producer (invalidateGarageCache di submitOrder) terverifikasi via code+build+lint, **belum diklik lewat UI POS penuh**. Confidence tinggi (pub/sub sederhana).
- [ ] Mobile 390×844 & desktop 1366×900 spesifik: belum di-resize-test (screenshot default desktop OK).

---

## ISSUES YANG SUDAH DIIDENTIFIKASI

### From Previous Sessions:
1. **Dead Routes** - 8 route duplikat di `src/app` perlu dihapus (Task #7)
2. **Hard-coded ownerId** - di `garage-service.ts` perlu diganti (Task #8)
3. **Missing modules** di ControlShell - finance, inventory, kitchen (Task #6)
4. **Type safety audit** - masih in_progress (Task #4)

### From Menu Audit:
1. Typo: "Coffe Gula Aren" → "Coffee Gula Aren"
2. Inconsistent baseCost (hanya di beberapa item)
3. Missing imageUrl di semua menu items (opsional)

---

## CATATAN PROSES

- Mulai dengan file-file terbesar: `garage-app.tsx` (10K lines), `garage-service.ts` (14K lines), `schema.ts` (2K lines)
- Baca secara bertahap dengan offset/limit
- Cross-check antara layer: API route ↔ service function ↔ schema table
- Test setiap fix secara lokal sebelum commit

---

**Next Action:** Fase 1 & 2 SELESAI. Lanjut ke Fase 3 - Audit Business Logic End-to-End.

## FASE 3 - RINGKASAN SELESAI ✅ (3.1 & 3.3)
- 3.1 Core flow: `createOrder` = 1 transaksi atomik lengkap (order→kitchen→inventory→finance→CRM→receipt). Solid, fail-fast, idempotent.
- 3.3 Approvals: dispatcher by ID-prefix, state guard, audit log. RBAC: 268/273 gated, 5 ungated semua sah.
- 3.2 Menu integrity: sudah SELESAI sesi sebelumnya (79 item, 77 variant).
- **Belum diaudit dalam:** 3.4 Error handling E2E (frontend try/catch coverage) — bisa jadi followup.

## FASE 2 - RINGKASAN SELESAI ✅
- Navigasi: 20 modul lengkap, RBAC via `role-access.ts`
- Dead route "8 duplikat" lama = MISDIAGNOSIS (private `_dashboard` + wrapper pattern, intentional)
- Komponen view: lengkap untuk semua modul utama
- **Gap arsitektural:** no SWR/Query, no cache invalidation pattern, retrofit empty/error state baru 5/banyak file

## FASE 1 - RINGKASAN SELESAI ✅
- TSC: 0 error (setelah fix garage-data.test.ts)
- Lint: 0 error
- Schema: 88 table, 148 FK, 26 index — sehat, db:generate "no changes"
- Service: 149 function, 174 importer — koneksi solid, tapi god-file
- **Action items prioritas:**
  1. Standardisasi error shape `{ error: { code, message } }` di 18 file HR/Staff (medium)
  2. Audit Zod coverage per-mutation handler (medium)
  3. Refactor split garage-service.ts (low, non-blocking)
