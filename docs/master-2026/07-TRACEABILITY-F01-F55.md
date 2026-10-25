# Traceability F01–F55 — PRD V4.0 ↔ kode existing ↔ batch

Status kode (audit read-only `main` @ `89d4318`): ✅ ada · 🟡 sebagian · ❌ belum.
Status "ada" = ditemukan di source, **belum** diverifikasi di production/staging (PRD §00.4).
Batch = ID di `02-ROADMAP.md`. Agent yang menyelesaikan fitur: ubah status + isi kolom Tes/PR.

## Keuangan F01–F40

| F | Fitur (PRD) | Status | Bukti di kode / gap | Batch | Tes / PR |
|---|---|---|---|---|---|
| F01 | Identitas kasir & outlet (§10.1, §10.9) | 🟡 | `cash_sessions` opener/closer, `actor` di audit; gate `ACTIVE_STAFF` dari approval staf belum ada | B1, B5 | |
| F02 | Open Shift warning (§10.1) | ❌ | Tidak ada modal peringatan + `policy_acceptances` berversi | B2 | |
| F03 | Cash counting pecahan (§10.2) | ✅ | `opening_denominations`, `cash-denominations.ts`, `cash-denomination-grid.tsx`; pecahan wajib saat closing (0161) | — | regresi |
| F04 | Balancing bertahap (§10.3) | 🟡 | Ledger + closing ada; checkpoint mid-shift/pre-close belum | B2, B4 | |
| F05 | QRIS reconciliation (§11) | 🟡 | QRIS statis BNI, akun `qris_clearing`, antrian mismatch (oversight); status provider PAID/SETTLED & import rekap merchant ❌ | B3 | |
| F06 | Setoran harian Rp10.000 (§10.7) | ❌ | Hanya kategori biaya "Transportasi/Parkir" (`cash-drawer.ts`) — bukan deklarasi parkir harian | B2 | |
| F07 | Cash In/Out & petty (§10.4–10.5) | ✅ | `recordCashMovement`, kategori `cash-drawer.ts`, petty ledger (0160) | — | regresi |
| F08 | Pembelian stok internal (§10.6) | 🟡 | `recordCashPurchases`, WMS receiving, Minta Bahan; tautan `purchase_id` di cash-out laci belum tegas | B2 | |
| F09 | Deposit manajer (§12.1) | 🟡 | Setoran drawer → `deposit_transit` → bank + `confirmCashDeposit`; custody manajer 2 pihak ❌ — **tunggu D-03** | B4 | |
| F10 | Close Shift warning (§10.8) | 🟡 | Closing wajib pecahan, blind count server (`cash-blind.ts`); teks peringatan & wizard 9 langkah ❌ | B4, U3 | |
| F11 | Review & investigasi (§14.4) | 🟡 | `shift_incidents`, `reviewCashSession`; Case ID + disposition ❌ | B6 | |
| F12 | Payroll liability review (§15) | 🟡 | Kasbon `staff_cash_advances`; liability case + review HR ❌ | B6 | |
| F13 | Owner approval + 2FA (§13.3) | 🟡 | TOTP ada; final closing Owner + TOTP fresh terikat hash/nonce ❌; close route `requireAnyPermission(["finance:write","shift:cash"])` | B4 | |
| F14 | Daily finance approval (§13.4) | 🟡 | `/control/cash-closing` + `getCashOversight`; date-first Approval Center ❌ | B4 | |
| F15 | PDF/Excel lengkap (§20.2) | 🟡 | `cashier-accountability` PDF A4, shift PDF, oversight xlsx; 4 jenis + penamaan + hash/versi ❌ | B7 | |
| F16 | Risk monitoring (§14) | 🟡 | `audit-suspicious-panel`, `finance-anomaly-panel`, discrepancy status | B6 | |
| F17 | Manager float pecahan (§12.3) | ❌ | Tunggu D-03 | B4 | |
| F18 | Mandatory double recount (§10.8) | 🟡 | `actual_cash` hitungan pertama immutable + `recount_*` oleh verifier; count #2 independen kasir ❌ | B4 | |
| F19 | Owner Approval 360 (§13.5) | 🟡 | Oversight panel = dasar; dossier 360 ❌ | B7 | |
| F20 | Fraud risk LV1–LV5 (§14.1) | ❌ | Ada `ok/minor/review/critical` (selisih saja); rule engine LV ❌ | B6 | |
| F21 | Dual-party investigation (§14.5–14.7) | 🟡 | verifier ≠ opener/closer, insiden diselesaikan bukan pelapor | B6 | |
| F22 | Monthly shortage ledger (§16.1) | ❌ | | B7 | |
| F23 | Exact event timeline (§16.2) | 🟡 | Ledger punya waktu; field occurred/recorded/detected/reviewed/confirmed terpisah ❌ | B6 | |
| F24 | Automatic finance summary (§21) | 🟡 | `garage-ai-report.ts`, shift copilot; format facts/unknowns/evidence ❌ | M4 | |
| F25 | PDF audit 360 (§20.2) | ❌ | | B7 | |
| F26 | Control & QA hardening (§27–28) | 🟡 | `closing-audit-probe`, suite cash-* ; ASVS mapping ❌ | S1+ | |
| F27 | Open warning discipline (§10.1) | ❌ | | B2 | |
| F28 | Tender guard CASH/QRIS (§09.2) | 🟡 | `correctPaymentMethod`, `paymentStatusOf`; QRIS PENDING≠PAID oleh provider ❌ (QRIS statis: verifikasi manual kasir) | B3 | |
| F29 | Cash-out belanja bahan (§10.4) | ✅ | Kategori drawer + `expenses` (0144) | — | regresi |
| F30 | External transfer excluded (§08.3) | ✅ | `cashSource = external` tidak diposting (`cash-sources.ts`) | — | regresi |
| F31 | Parking mandatory close (§10.7) | ❌ | | B2 | |
| F32 | Quick Retail Sale (§09.3) | 🟡 | Produk retail (`product_type = retail`), `isDirectHandoverMenu`; kanal QUICK_RETAIL tanpa meja ❌ | B3 | |
| F33 | New retail SKU management (§09.3) | ✅ | Product management, SKU/barcode unik (`assertUniqueProductCodes`) | — | regresi |
| F34 | Customer payment proof (§09.1) | 🟡 | Receipt + QR invoice; `payment_reference` QRIS ❌ | B3 | |
| F35 | Owner decision cashflow (§13.5) | 🟡 | | B7 | |
| F36 | Risk cashier & manager (§14.2) | 🟡 | | B6 | |
| F37 | Monthly cashier accountability (§16.1) | 🟡 | Laporan per shift ada; bulanan ❌ | B7 | |
| F38 | PDF detailed cash ledger (§20.2) | 🟡 | `getDrawerLedger` | B7 | |
| F39 | Recount & immutable proof (§10.8) | 🟡 | Ledger immutable trigger; count STALE/RECOUNT_REQUIRED ❌ | B4 | |
| F40 | Payment-to-closing QA gates (§28.1) | 🟡 | | semua | |

## Identitas, MCP, UX F41–F55

| F | Fitur | Status | Bukti / gap | Batch | Tes / PR |
|---|---|---|---|---|---|
| F41 | Google OAuth staf & member | ❌ | Google OAuth hanya untuk Drive/YouTube/Business; `auth.ts` tanpa `socialProviders` | I1 | |
| F42 | Verifikasi email oleh Garage OS | ❌ | `requireEmailVerification: false`; butuh D-04 | I2 | |
| F43 | WhatsApp OTP | ❌ | Member: verifikasi manual kasir (`wa_verified_at`); queue WA ada; butuh D-05 | I2 | |
| F44 | Staff application PENDING_OWNER_APPROVAL | ❌ | Undangan + rekrutmen hire ada; `staff_access_requests` ❌ | I3 | |
| F45 | Owner Access Approval Center + MFA | ❌ | | I3 | |
| F46 | Safe account linking & migrasi member lama | ❌ | | I1 | |
| F47 | Re-verifikasi ganti kontak | ❌ | | I2 | |
| F48 | Module Registry | 🟡 | `ai_action_registry` (AI internal) | M1 | |
| F49 | Lifecycle perintah + operation receipt | 🟡 | AI action drafts approve/reject; receipt ❌ | M2 | |
| F50 | MCP OAuth gateway | 🟡 | **PR #83**: OAuth 2.1 `/api/mcp/chatgpt` (mati default). Belum: uji akun ChatGPT nyata, CIMD | M0 | `mcp-chatgpt-oauth.integration.test.ts`, `mcp-chatgpt-config.test.ts` |
| F51 | MCP write (preview/konfirmasi/commit) | 🟡 | `garage_api` write langsung tanpa preview; **D-01: full access Owner** | M2, M3 | |
| F52 | Aya in-app Owner Copilot | 🟡 | `owner-chat`, AI agents, provider OpenAI/Gemini; nama "Aya" belum ada di kode. **D-07: Aya = peliharaan Owner** (nama, avatar, persona) | M5, U1 | |
| F53 | Reports Studio + Drive/Gmail | 🟡 | Drive upload ✅, Gmail ❌ (D-04) | M4 | |
| F54 | Design system & component registry | 🟡 | `design-system/MASTER.md`, shadcn/ui; token PRD §24.2 konflik → D-02 | U1 | |
| F55 | Workspace per role & screen registry 16 modul | 🟡 | ±111 halaman; census + screenshot ❌ | U0 | |
