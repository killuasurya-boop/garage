# PHASE 0 — Audit Read-Only (2026-10-25)

> **Catatan 2026-10-26:** temuan F-01/F-02 ditinjau ulang terhadap keputusan Owner **D-01 (MCP ChatGPT
> full access Owner)**. Luasnya akses Owner bukan lagi temuan; yang tetap jadi masalah adalah *cara*-nya:
> bearer key statis, tanpa preview/receipt, audit fire-and-forget, dan key non-Owner (manajer/agent lain)
> yang ikut bisa mengakses route Owner-only. Lihat `06-OWNER-DECISIONS.md`.

Basis: `main` @ `89d4318`. Metode: baca kode, schema, route, workflow GitHub. Tidak ada perintah
yang menyentuh VPS, database produksi, atau deployment. Tidak ada `npm run build`/test dijalankan
(audit dokumen saja).

## 1. Ukuran & arsitektur existing

| Aspek | Temuan |
|---|---|
| Stack | Next.js App Router (versi baru — baca `node_modules/next/dist/docs/`), TypeScript, Tailwind v4, shadcn/ui, Drizzle + PostgreSQL, Better Auth, PGlite untuk tes |
| Skala | ±594 route handler `src/app/api/**/route.ts`, ±111 halaman `page.tsx`, 180 tabel (`src/db/schema.ts` 4.475 baris), 162 migration (terakhir `0162_opening_balance_certification`), ±178 file test |
| Hotspot | `src/lib/garage-service.ts` (±23.000 baris), `src/components/garage/garage-app.tsx` (±10.300 baris) — risiko konflik merge & regresi tinggi |
| Deploy | Docker compose di VPS (`app`, `db`, `migrate`, `backup`, `caddy`). `main` → GitHub Actions `deploy.yml` → SSH, backup pre-deploy, migrate, `up -d` (restart app), health check + rollback image `previous` |
| CI | `ci.yml`: typecheck, lint, vitest PGlite — pada PR & push `main` |

## 2. Inventaris fitur existing yang relevan dengan 3 PRD

### A. AI Command Center + MCP
- **MCP server** `POST /api/mcp` (`src/lib/agent-mcp.ts`, JSON-RPC 2.0 stateless, protokol 2025-06-18).
- **Agent API key** `gk_agent_…` (`src/lib/agent-api-key.ts`): scope `owner` / `manajer` / `readonly`,
  hash di DB, kedaluwarsa, cabut, rate limit 120/menit **in-memory per proses**, audit log untuk
  non-GET, path terlarang (auth, agent-keys, jobs, cron, webhooks, ai/providers, admin/purge, account).
- **Tool MCP** (`src/lib/agent-tools.ts`, 11 tool): `ringkasan_hari_ini`, `status_operasional`,
  `laporan_penjualan`, `daftar_order`, `cek_stok_bahan`, `daftar_menu`, `ubah_status_menu`,
  `daftar_approval`, `putuskan_approval`, `catat_pengeluaran`, `rekap_kas_harian`, `buat_laporan`,
  plus **`garage_api`** = proxy ke endpoint `/api` mana pun.
- REST agent `/api/agent/v1/{me,tools,openapi.json}`; dokumentasi `docs/AGENT-API.md`.
- AI internal: provider (OpenAI/Gemini dll. `garage-ai-providers.ts`), AI agents/autopilot,
  **AI action drafts + registry + approve/reject** (`/api/ai/actions`, tabel `ai_action_registry`),
  shift copilot, system doctor, CEO broadcast, owner chat, eval (`npm run ai:evaluate`).
- Google: OAuth untuk **Drive** (upload laporan), YouTube, Google Business. **Tidak ada Gmail.**

### B. Financial Security + Identity
- Buku kas tunggal `cash_ledger_entries` (immutable via trigger, reversal), `postDrawerCash`,
  akun drawer/petty/bank_jago/bank_bni/qris_clearing/deposit_transit/external (P0–P6 selesai, lihat
  `CLAUDE.md` & `docs/AUDIT-P0-CLOSING-2026-10.md`).
- Open/close shift wajib denominasi, discrepancy status ok/minor/review/critical, recount, review
  verifier ≠ opener/closer, insiden, setoran 2 langkah, petty cash approval ≠ payment,
  sertifikasi saldo awal, panel Owner `CashOversightPanel` + Excel.
- Order admin Owner/Manajer (revert/confirm/correct method/void/archive/delete unpaid) + audit
  before/after. Manager PIN untuk kas keluar besar. QRIS statis BNI (`garage-qris.ts`) + antrian
  QRIS mismatch di oversight.
- Auth: Better Auth email/password, plugin **twoFactor (TOTP)**, lockout per akun, rate limit
  sign-in, kebijakan `securityRequire2faForOwner`, force logout all, security center.
- Member: login PIN + JWT terpisah (`/api/member/auth/*`), verifikasi WA **manual** oleh staf
  (`wa_verified_at`). WhatsApp Cloud API queue (`garage-whatsapp-messaging.ts`) untuk template.
- Staff: `staff_profiles` (role, status), undangan, rekrutmen → hire.

### C. UI/UX
- `design-system/MASTER.md` (token & checklist staf), design system member terkunci
  (`docs/GARAGE_MEMBER_DESIGN_SYSTEM.md`, `member-auth/`), tema di `globals.css`, skill
  `ui-ux-pro-max`, `garage-ui-review`. Modul: dashboard, POS, kitchen, WMS/warehouse, finance,
  CRM, approvals, audit, payroll V2, control center, ops center, member, order digital, event.

## 3. Temuan (diurutkan dari paling berisiko)

| ID | Sev | Temuan | Bukti |
|---|---|---|---|
| **F-01** | KRITIS | Tool MCP `garage_api` = akses proxy ke hampir seluruh `/api` dengan hak Owner. Key scope `owner` bisa: ubah pengaturan keamanan (mis. matikan wajib 2FA), buat/ubah user & role, sertifikasi saldo awal kas, void/refund, putuskan approval — **tanpa preview, tanpa approval manusia**. Bertentangan dengan PRD "ChatGPT tidak boleh melewati aturan transaksi/otorisasi finansial". | `agent-tools.ts:263-300`, `agent-api-key.ts:64-76` (denylist sempit), `admin/settings/route.ts:56` & `admin/users/route.ts:58` hanya `requirePermission("staff:manage")`, `control/cash-opening/route.ts:16` hanya `requireGarageSession(["Owner"])` |
| **F-02** | KRITIS | Agent bisa menyetujui proposal/approval sendiri: `putuskan_approval`, `/api/approvals/*`, `/api/ai/actions/[id]/approve` menerima sesi agent. Tidak ada aturan "approver harus manusia". | `ai/actions/[id]/approve/route.ts:13`, `approvals/[id]/route.ts:51` |
| **F-03** | TINGGI | `requireHumanSession` hanya dipakai di 2 route (`agent-keys`). Route uang/identitas sensitif tidak membedakan manusia vs agent. | `grep requireHumanSession src/app/api` |
| **F-04** | TINGGI | Kebijakan wajib 2FA Owner/Manajer hanya ditegakkan di level **halaman** (`page-access.ts`), tidak di API. Owner/Manajer tanpa 2FA tetap bisa memanggil API langsung. | `page-access.ts:24-33`; `server-auth.ts` tanpa cek 2FA |
| **F-05** | TINGGI | Audit agent ditulis `void db.insert(...).catch(() => undefined)` — fire-and-forget, bisa hilang diam-diam; GET (baca data finansial) tidak diaudit sama sekali. | `agent-api-key.ts:163-175` |
| **F-06** | SEDANG | Rate limit agent in-memory per proses (reset saat restart, tidak berlaku lintas instance). | `agent-api-key.ts:78-90` |
| **F-07** | SEDANG | `emailAndPassword.requireEmailVerification: false`, tidak ada email provider, tidak ada Google Sign-In, verifikasi WA staf/member manual. (Sesuai aturan CLAUDE.md "jangan tambah email provider tanpa diminta" — PRD V3.1 **meminta**, perlu keputusan Owner.) | `auth.ts:100-103` |
| **F-08** | SEDANG | `deploy.yml` men-deploy otomatis setiap push `main` + migration otomatis; environment `production` — belum terverifikasi apakah ada required reviewer di GitHub Environments. | `.github/workflows/deploy.yml` |
| **F-09** | SEDANG | Dua workflow (`wms-browser.yml`, `wms-postgres-concurrency.yml`) aktif di GitHub tapi file sudah hilang dari `main` — status registrasi membingungkan. | GitHub Actions list |
| **F-10** | SEDANG | Monolit `garage-service.ts` & `garage-app.tsx` — setiap batch UI/finance akan menyentuh file yang sama → konflik & regresi. Redesign UI harus didahului ekstraksi modul. | wc -l |
| **F-11** | RENDAH | Host IP VPS & user `root` tertulis di workflow (publik di repo). Bukan secret, tapi deploy sebagai root = blast radius besar. | `deploy.yml:16-18` |
| **F-12** | INFO | 3 PDF PRD tidak tersedia di repo → detail acceptance criteria belum bisa dicocokkan. | — |

## 4. Yang TIDAK diaudit (perlu izin / akses)

- Server VPS (Caddy, docker, firewall, backup aktual, `.env.production`) — dilarang disentuh.
- Database produksi (isi data, konsistensi ledger produksi) — hanya boleh read-only bila Owner
  memberi akses read-only replica/backup; gunakan `scripts/cash-ledger-fingerprint.sql`.
- Pengaturan GitHub: branch protection `main`, required reviewers environment `production`,
  secrets — Owner perlu cek di Settings (agent tidak punya akses admin repo).
- Isi 3 PDF PRD.
