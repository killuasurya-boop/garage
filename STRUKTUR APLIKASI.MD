# STRUKTUR APLIKASI — Garage Coffee & Motor OS

> Operating system internal untuk Garage Coffee & Motor.
> Stack: **Next.js App Router · TypeScript · Tailwind v4 · shadcn/ui · Drizzle ORM (Postgres/Neon) · Better Auth**.
> Tema: asphalt-chrome-red-amber.

---

## 1. Peta Modul Utama

```
Garage OS
├── 1. Dashboard            — Owner command center
├── 2. POS                  — Tablet cashier
├── 3. Kitchen (KDS)        — Live kitchen display
├── 4. Waiter               — Antar pesanan & status meja
├── 5. Produk Manajemen     — Produk & Gudang (raw material)
├── 6. Finance              — Cash closing & laporan
├── 7. CRM                  — Customer & segmentasi
├── 8. Membership           — Premium card vault
├── 9. Marketing            — Campaign engine
├── 10. Approvals           — Risk gate
├── 11. Website             — Landing publik
├── 12. CEO Control         — Owner vault (multi-outlet)
├── 13. Fee Saya (Earnings) — Saldo fee & payout
├── 14. Audit               — Immutable log
├── 15. Smart Notif         — Voice & trigger center
├── 16. GARAGE AI           — Operating intelligence
├── 17. Chat Internal       — Komunikasi tim
├── 18. Pengaturan          — Konfigurasi outlet & sistem
├── 19. Manajemen Tim       — HR · SOP · Shift
└── 20. Buku Pintar         — Tutorial & SOP karyawan
```

---

## 2. Struktur Direktori

### 2.1 App Router (`src/app/`)

```
src/app/
├── layout.tsx              # Root layout (font, metadata, theme)
├── page.tsx                # Entry point Garage OS
├── globals.css             # Token tema (asphalt/chrome/red/amber)
├── manifest.ts             # PWA manifest
│
├── login/                  # Login utama staff
├── pos-login/              # Login khusus kasir POS
├── member-login/           # Login member
│
├── os/                     # Shell Garage OS (modul utama)
├── dashboard/              # Dashboard owner
├── pos/                    # POS tablet
├── display/                # Customer queue display
├── order/                  # Halaman order QR
├── member/                 # Area member
├── account/                # Akun pribadi
├── attendance/             # Absensi (geofence + selfie)
├── shift/                  # Shift karyawan
├── sales-history/          # Riwayat penjualan
├── invoice/                # Halaman invoice
├── website/                # Landing publik
├── franchise/              # Site franchise
├── saas-executive/         # View eksekutif SaaS
│
├── control/                # CEO Control (owner vault)
│   ├── page.tsx
│   ├── 2fa/                # Two-factor challenge
│   ├── admin/              # Admin hub
│   ├── branches/           # Multi-outlet
│   ├── briefing/           # Daily briefing
│   ├── cash-closing/       # Closing per outlet
│   ├── cashflow/           # Arus kas
│   ├── compliance/         # Audit kepatuhan
│   ├── customers/          # CRM owner view
│   ├── financial/          # Laporan finance
│   ├── health/             # Health sistem
│   ├── hr/                 # Overview HR
│   ├── inventory-intel/    # Analitik stok lintas outlet
│   ├── kitchen-ops/        # Performa dapur
│   ├── menu-engineering/   # Profitabilitas menu
│   ├── onboarding/         # Outlet/karyawan baru
│   ├── operations/         # Operasional konsolidasi
│   ├── permissions/        # Matrix akses
│   ├── risk/               # Risk gate
│   ├── sales/              # Sales analytics
│   ├── security/           # Security center
│   ├── settings/           # Global settings
│   ├── themes/             # Tema visual
│   └── users/              # User management
│
└── api/                    # Route handlers
    ├── auth/[[...all]]/    # Better Auth
    ├── admin/users/        # CRUD user · bulk · reset password · sessions
    ├── hr/attendance/      # Absensi + check geofence
    └── outlets/list/       # Daftar outlet
```

### 2.2 Komponen Garage (`src/components/garage/`)

```
src/components/garage/
├── garage-app.tsx                      # Shell utama + router modul
├── garage-app-loader.tsx               # Loader awal
├── garage-connected-nav.tsx            # Navigation bar
│
├── dashboard-owner-snapshot.tsx        # Widget KPI owner
├── attendance-today-widget.tsx         # Absensi hari ini
│
├── # POS
├── warehouse-cashier-pos.tsx
├── pos-quick-reorder-button.tsx
├── pos-upsell-panel.tsx
├── cashier-rules-panel.tsx
├── cashier-shift-report.tsx
├── thermal-print-panel.tsx
├── print-preview-modal.tsx
├── sales-history.tsx
│
├── # Kitchen & Waiter
├── kitchen-eta-panel.tsx
├── customer-queue-display.tsx
├── waiter-view.tsx
│
├── # Inventory
├── inventory-smart-reorder-panel.tsx
│
├── # Finance
├── finance/
│   ├── finance-view.tsx
│   ├── finance-kpi.tsx
│   ├── finance-closing-panel.tsx
│   ├── finance-cfo-brief.tsx
│   ├── finance-recent-orders.tsx
│   ├── finance-shift-transactions.tsx
│   └── finance-connected-nav.tsx
├── finance-anomaly-panel.tsx
├── finance-invoice-list.tsx
├── earnings-view.tsx
│
├── # CRM & Membership
├── crm-customer-list.tsx
├── crm-segments.tsx
├── crm-auto-segments-panel.tsx
├── member-card.tsx
├── premium-membership-card.tsx
├── member-dashboard.tsx
├── member-analytics.tsx
├── member-login-screen.tsx
├── member-order-page.tsx
├── membership-admin-view.tsx
│
├── # Marketing
├── garage-marketing.tsx
│
├── # Approvals & Audit
├── approvals-board.tsx
├── approvals-auto-sweep-panel.tsx
├── audit-log-viewer.tsx
├── audit-suspicious-panel.tsx
├── smart-audit-dashboard.tsx
│
├── # AI & Notif
├── garage-ai-ui.tsx
├── garage-ai-simple-view.tsx
├── garage-ai-alerts-bell.tsx
├── voice-settings-dialog.tsx
│
├── # Chat & Training
├── chat-module.tsx
├── chat-fab.tsx
├── garage-training-module.tsx
├── sop-tutorial-widget.tsx
│
├── # Util
├── client-error-reporter.tsx
├── garage-toast.tsx
├── date-filter.tsx
├── database-purge-panel.tsx
├── employee-clock-panel.tsx
│
├── theme/                              # Theme switcher
└── admin/                              # CEO/Admin panels
    ├── admin-hub.tsx
    ├── admin-shell.tsx
    ├── auto-logout-watcher.tsx
    ├── feedback-widget.tsx
    ├── global-settings-panel.tsx
    ├── health-dashboard.tsx
    ├── hr-attendance-log.tsx
    ├── password-change-panel.tsx
    ├── permission-matrix.tsx
    ├── security-center.tsx
    ├── settings-manager.tsx
    ├── two-factor-challenge.tsx
    ├── two-factor-manager.tsx
    ├── user-management.tsx
    └── team-*                          # HR/SOP/Shift
        ├── team-management-dashboard.tsx
        ├── team-directory-manager.tsx
        ├── team-locations-manager.tsx
        ├── team-payroll-manager.tsx
        ├── team-advances-manager.tsx
        ├── team-shift-scheduler.tsx
        ├── team-shift-handover.tsx
        ├── team-tasks-manager.tsx
        ├── team-announcements.tsx
        ├── team-leaderboard.tsx
        ├── team-kpi-dashboard.tsx
        ├── team-glossary-manager.tsx
        ├── team-sop-manager.tsx
        └── team-hr-overview.tsx
```

### 2.3 Lapisan Service & Data (`src/lib/`, `src/db/`)

```
src/lib/
├── auth.ts                       # Better Auth server
├── server-auth.ts                # Helper session server
├── role-access.ts                # Mapping role → modul
├── page-access.ts                # Guard halaman
├── admin-user-service.ts         # CRUD user admin
├── garage-service.ts             # Service layer domain Garage
├── garage-data.ts                # Seed: menu, inventory, modules, KPI
├── garage-settings-schema.ts     # Zod schema settings
├── garage-app-settings-types.ts  # Tipe settings
├── garage-health-service.ts      # Health monitoring
├── garage-qr.ts                  # QR order util
├── company-control.ts            # CEO control service
├── attendance.ts                 # Logika absensi + geofence
├── chat-bot-service.ts           # GARAGE AI service
└── api-client.ts                 # Client fetch wrapper

src/db/
├── index.ts                      # Drizzle init (lazy, build-safe)
└── schema.ts                     # Schema auth + domain Garage
```

### 2.4 Skrip & Tooling (`src/scripts/`, `scripts/`)

```
src/scripts/
├── garage-readiness-audit.ts     # Audit kesiapan rilis
├── garage-security-audit.ts      # Audit keamanan
└── verify-attendance-logic.ts    # Verifikasi logic absensi

scripts/
└── backup.mjs                    # Backup DB
```

### 2.5 Aset Publik (`public/`)

```
public/
├── garage-logo-wide.png          # Logo utama (object-contain, chrome backing)
└── franchise-site/               # Aset site franchise
```

---

## 3. Matriks Modul × Sub-Fitur

### 3.1 Dashboard
- KPI revenue, selisih kas, order aktif, approval pending
- Kitchen SLA · Stock accuracy · Offline queue · Fraud alerts
- Owner snapshot · Attendance today · AI alerts bell

### 3.2 POS
- Menu grid + varian harga (single / Cold-Hot / Sedang-Pedas / Barbeque-Balado-Campur)
- Cart: item + varian + qty, total dari varian
- Quick reorder · Upsell AI · Cashier rules · Shift report
- Thermal print · QR order · Sales history
- Warehouse cashier variant · POS-login terpisah

### 3.3 Kitchen (KDS)
- Antrian order real-time
- ETA panel · SLA tracking (alert > 12 menit)
- Display board untuk pelanggan

### 3.4 Waiter
- Daftar order siap antar
- Status meja

### 3.5 Produk Manajemen (Inventory)
- Fields: `sku`, `name`, `alternativeName`, `category`, `unit`, `packageSize`, `onHand`, `min`, `status`, `movement`
- Status low/watch/safe + search
- Smart reorder AI · Inventory intel lintas outlet

### 3.6 Finance
- KPI · Closing harian · Shift transactions · Recent orders
- CFO brief · Invoice list · Anomaly detection
- Cashflow konsolidasi · Earnings (Fee Saya)

### 3.7 CRM
- Customer list · Segmen manual · Auto segments AI

### 3.8 Membership
- Member card · Premium card
- Member dashboard · Analytics · Login screen
- Member order page (QR) · Admin view

### 3.9 Marketing
- Landing/marketing site · Franchise site

### 3.10 Approvals
- Approvals board · Auto-sweep panel

### 3.11 Website
- Garage public site (hero, info)

### 3.12 CEO Control (Owner Vault)
- 2FA · Branches · Briefing · Cash Closing
- Cashflow · Financial · Compliance · Customers
- Health · HR · Inventory Intel · Kitchen Ops
- Menu Engineering · Onboarding · Operations
- Permissions · Risk · Sales · Security
- Settings · Themes · Users · SaaS Executive

### 3.13 Fee Saya (Earnings)
- Saldo fee per karyawan/owner · Payout history

### 3.14 Audit
- Audit log viewer · Suspicious activity · Smart audit dashboard

### 3.15 Smart Notif
- AI alerts bell · Voice settings · Finance anomaly trigger

### 3.16 GARAGE AI
- AI Simple View (non-teknis) · AI UI lengkap
- Chat-bot service (`chat-bot-service.ts`)

### 3.17 Chat Internal
- Chat module · Floating chat FAB

### 3.18 Pengaturan
- Settings manager · Theme switcher · Database purge

### 3.19 Manajemen Tim (HR · SOP · Shift)
- Directory · Locations · Payroll · Advances (kasbon)
- Shift scheduler · Handover · Tasks · Announcements
- Leaderboard · KPI dashboard · Glossary · SOP manager
- HR overview · Attendance log (geofence + selfie)
- Employee clock panel

### 3.20 Buku Pintar (Training)
- Training module · SOP tutorial widget

---

## 4. Lapisan Lintas-Modul (Cross-cutting)

| Lapisan              | Lokasi |
|----------------------|--------|
| Auth & session       | `src/lib/auth.ts`, `src/lib/server-auth.ts` |
| Role & page gating   | `src/lib/role-access.ts`, `src/lib/page-access.ts` |
| DB schema (Drizzle)  | `src/db/schema.ts`, `src/db/index.ts` |
| Domain service       | `src/lib/garage-service.ts`, `admin-user-service.ts`, `company-control.ts` |
| API route handlers   | `src/app/api/**` |
| Health & monitoring  | `src/lib/garage-health-service.ts` |
| Audit scripts        | `src/scripts/garage-security-audit.ts`, `garage-readiness-audit.ts` |
| Theming              | `src/app/globals.css` (asphalt/chrome/red/amber) |
| Toast & error report | `garage-toast.tsx`, `client-error-reporter.tsx` |
| Print                | `thermal-print-panel.tsx`, `print-preview-modal.tsx` |
| Shell & loader       | `garage-app-loader.tsx`, `garage-connected-nav.tsx` |

---

## 5. Aturan Arsitektur (dari CLAUDE.md)

- **API**: gunakan Route Handlers, bukan Server Actions (kecuali diminta).
- **DB init**: lazy + build-safe; `next build` tidak butuh koneksi DB live.
- **Validasi**: Zod di setiap endpoint → `{ data }` atau `{ error: { code, message } }`.
- **Identitas**: Better Auth hanya untuk session; role Garage di `staff_profiles`.
- **Skop backend v1**: tanpa payment gateway, email provider, ERP, atau realtime provider eksternal.
- **UI**: pertahankan tema Garage (asphalt/chrome/red/amber); hindari styling SaaS generik (green/blue, hero marketing).
- **POS**: tetap cepat untuk tablet; menu primer; cart selalu terjangkau; preservasi varian harga.
- **Inventory**: raw-material & consumable saja; equipment masuk modul aset di masa depan.
- **Responsif**: target desktop `1366x900` dan mobile `390x844`; tanpa overflow / clipping.

---

## 6. Verifikasi Rilis

```bash
npm run db:generate
npm run lint
npm run build
npm run db:migrate
npm run db:seed
```

Lalu uji di browser:
- `http://127.0.0.1:3000/`
- Desktop ~`1366x900`, Mobile ~`390x844`
- Tidak ada console error
- Tidak ada text clipping / kontrol tumpang tindih
- Login seeded berfungsi
