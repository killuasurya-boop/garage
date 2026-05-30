# Garage Digital Ecosystem

Garage Coffee & Motor operational OS built from `PRD_GARAGE.md`.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- API Route Handlers
- Drizzle ORM
- PostgreSQL/Neon
- Better Auth email/password

## Run

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:repair-mvp
npm run db:seed
npm run dev
```

If `db:seed` fails on `payments.cash_session_id`, run `npm run db:repair-mvp` then seed again.

Open `http://127.0.0.1:3001`.

For cashier tablets on the same Wi-Fi, run:

```powershell
npm.cmd run dev:lan
```

Then open the LAN URL from the tablet, for example `http://YOUR_LAN_IP:3001`.

Seed login examples:

- `owner@garage.local`
- `admin@garage.local`
- `kasir@garage.local`
- `barista@garage.local`
- `kitchen@garage.local`
- `koki@garage.local`
- `waiter1@garage.local`
- `waiter2@garage.local`
- password from `GARAGE_SEED_PASSWORD`, default `garage12345`

Seed member examples:

- `081300001001` / `member12345` - Silver
- `081300001002` / `member12345` - Gold
- `081300001003` / `member12345` - Platinum
- POS terminal code: `GARAGE-POS-01`
- POS dev API key: `garage-pos-dev-key`

## Verify

```powershell
npm run lint
npm run build
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"; npm run smoke
npm run readiness:audit
npm run final-mvp:uat
```

Final MVP manual checklist: Finance module → panel **UAT Final MVP 1-5** (after API UAT passes).

## GARAGE AI Workflow

Panduan pengawasan karyawan (kesalahan, perbaikan, lonceng alerts, per role): [docs/GARAGE-AI-WORKFLOW.md](docs/GARAGE-AI-WORKFLOW.md)

Konsep teknis: [docs/GARAGE-AI-FINAL-CONCEPT.md](docs/GARAGE-AI-FINAL-CONCEPT.md)

## GARAGE AI Jobs

`vercel.json` menyiapkan scheduled jobs:

- `/api/ai/jobs/master-report` setiap 23:55 WIB untuk Master Report harian.
- `/api/ai/jobs/log-cleanup` setiap 3 hari untuk membersihkan log GARAGE AI.
- `/api/ai/jobs/system-doctor` tiap 30 menit untuk health provider/DB.
- `/api/ai/jobs/shift-copilot` tiap 10 menit untuk alert operasional per role (QR, kitchen, stok, approval, finance).

Shift Copilot juga bisa dijalankan manual:

```powershell
npm run ai:shift-copilot
# atau POST /api/ai/shift-copilot/run (Owner/Admin/Manager/Supervisor)
```

Staf melihat alert di header aplikasi (ikon bell). Lihat `docs/GARAGE-AI-FINAL-CONCEPT.md`.

Set `GARAGE_JOB_SECRET` atau `CRON_SECRET` di environment. Request job wajib memakai header `Authorization: Bearer <secret>`.

Google Drive upload membutuhkan `GOOGLE_DRIVE_REPORTS_FOLDER_ID` plus `GOOGLE_SERVICE_ACCOUNT_JSON` atau pasangan `GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

## GARAGE AI SSH/Codex Bridge

CEO Brain punya mode `SSH Codex Bridge` untuk membuat rencana koneksi SSH, command draft, preflight, verifikasi, dan rollback. Mode ini tidak menjalankan SSH otomatis dan tidak menampilkan secret.

Env opsional:

- `GARAGE_SSH_TARGET_ALIAS`
- `GARAGE_SSH_HOST`
- `GARAGE_SSH_PORT`
- `GARAGE_SSH_USER`
- `GARAGE_SSH_KEY_PATH`
- `GARAGE_SSH_ALLOW_COMMAND_EXECUTION=false`

## MVP Screens

- Dashboard owner
- POS tablet
- Kitchen display
- Inventory and warehouse
- Finance and cash closing
- CRM and membership
- Approvals
- Audit log

## Membership & Loyalty

Membership is integrated into the existing GARAGE app. It uses Next.js route handlers, Drizzle, and the existing `customers` CRM table as the member source of truth.

Pages:

- `/member-login` - customer/member login and registration, separate from staff login.
- `/member` - protected member dashboard with level, points, progress, history, and redeem.
- `/order` - mock online order flow with point redemption and earning.
- Staff still uses `/login`, `/pos-login`, and `/os`.

Levels:

- Silver: `0-999` points, `1x`.
- Gold: `1000-4999` points, `1.5x`.
- Platinum: `5000+` points, `2x`.

Point rule: `floor(amount / 1000)` base points, then multiplier by current level. Redeem rule: `100 points = Rp 1.000`.

REST API response shape:

- Success: `{ "success": true, "data": { ... } }`
- Error: `{ "success": false, "message": "..." }`

Member endpoints:

- `POST /api/member/auth/register`
- `POST /api/member/auth/login`
- `POST /api/member/auth/refresh`
- `POST /api/member/auth/logout`
- `GET /api/member/profile`
- `GET /api/member/history`
- `POST /api/points/earn`
- `POST /api/points/redeem`

POS endpoints:

- `GET /api/pos/member/:phone`
- `POST /api/pos/sync-transaction`

POS endpoints require header `x-api-key: <GARAGE_POS_API_KEY>` and are rate limited in memory. The Postman collection is at `docs/garage-membership.postman_collection.json`.

## Backend Notes

Copy `.env.example` to `.env.local` and set:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` to the same LAN URL opened by cashier tablets, for example `http://YOUR_LAN_IP:3001`
- `GARAGE_TRUSTED_ORIGINS` including `localhost`, `127.0.0.1`, and the LAN URL
- optional `GARAGE_SEED_PASSWORD`
- optional `GARAGE_MEMBER_SEED_PASSWORD`
- optional `GARAGE_POS_API_KEY`
- optional `MEMBER_AUTH_SECRET`

This version has no payment gateway, email provider, external ERP sync, or production RBAC admin UI. Garage roles live in `staff_profiles`; Better Auth handles identity and sessions.
