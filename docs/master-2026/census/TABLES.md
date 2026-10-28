# Tabel sensus (dihasilkan `scripts/screen-census.ts` — jangan diedit manual)

## Halaman

| URL | Area | Layar PRD §25.1 | Guard server | Catatan |
|---|---|---|---|---|
| `/absen` | HR | HR-04 Attendance | — (client/API) |  |
| `/account/password` | Akun | SYS-07 Settings | redirect, requireGarageSession |  |
| `/account/pin` | Akun | SYS-07 Settings | redirect, requireGarageSession |  |
| `/attendance` | HR | HR-04 Attendance | redirect |  |
| `/control/_dashboard/branches` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/briefing` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/cash-closing` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/cashflow` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/compliance` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/customers` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/financial` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/hr` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/inventory-intel` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/kitchen-ops` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/menu-engineering` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/onboarding` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/operations` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/profitmax` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/risk` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/_dashboard/sales` | Implementasi (_private) | — | redirect, requireGarageSession | Folder privat `_…` bukan route; diimpor oleh wrapper /control/* (bukan kode mati) |
| `/control/2fa` | Owner Control | SYS-07 Settings | redirect, requireGarageSession | Pemasangan MFA |
| `/control/admin` | Owner Control | SYS-07 Settings | redirect, requireGarageSession |  |
| `/control/branches` | Owner Control | SYS-03 Outlet/Business Date | ControlDashboardRoute |  |
| `/control/briefing` | Owner Control | DSH-04 Alerts | ControlDashboardRoute |  |
| `/control/cash-closing` | Owner Control | FIN-07 Daily Approval Center, FIN-05 Deposit/Custody | ControlDashboardRoute |  |
| `/control/cashflow` | Owner Control | FIN-02 Cash Ledger | ControlDashboardRoute |  |
| `/control/compliance` | Owner Control | SYS-05 Audit & Recovery | ControlDashboardRoute |  |
| `/control/customers` | Owner Control | CRM-01 Directory | ControlDashboardRoute |  |
| `/control/financial/closing` | Owner Control | FIN-08 Monthly Accountability | ControlDashboardRoute |  |
| `/control/financial/intelligence` | Owner Control | DSH-02 Trends | ControlDashboardRoute |  |
| `/control/financial` | Owner Control | FIN-01 Overview | ControlDashboardRoute |  |
| `/control/financial/settings` | Owner Control | SYS-07 Settings | ControlDashboardRoute |  |
| `/control/health` | Owner Control | SYS-06 Health | redirect, requireGarageSession |  |
| `/control/hr` | Owner Control | HR-02 Directory | ControlDashboardRoute |  |
| `/control/inventory-intel` | Owner Control | WMS-01 Inventory, DSH-03 KPI Detail | ControlDashboardRoute |  |
| `/control/kitchen-ops` | Owner Control | DSH-03 KPI Detail | ControlDashboardRoute |  |
| `/control/menu-engineering` | Owner Control | REC-04 HPP Impact, CAT-04 Price List | ControlDashboardRoute |  |
| `/control/onboarding` | Owner Control | HR-01 Staff Applications | ControlDashboardRoute |  |
| `/control/operations` | Owner Control | DSH-01 Owner 360 | ControlDashboardRoute |  |
| `/control` | Owner Control | DSH-01 Owner 360 | ControlDashboardRoute |  |
| `/control/permissions` | Owner Control | SYS-02 Role Matrix | redirect, requireGarageSession |  |
| `/control/profitmax` | Owner Control | DSH-03 KPI Detail | ControlDashboardRoute |  |
| `/control/risk` | Owner Control | FIN-06 Risk Cases | ControlDashboardRoute |  |
| `/control/sales` | Owner Control | DSH-02 Trends | ControlDashboardRoute |  |
| `/control/security` | Owner Control | SYS-07 Settings, SYS-04 Integrations | redirect, requireGarageSession |  |
| `/control/settings` | Owner Control | SYS-07 Settings | redirect |  |
| `/control/themes` | Owner Control | SYS-07 Settings | redirect, requireGarageSession |  |
| `/control/users` | Owner Control | SYS-02 Role Matrix, HR-03 Role | redirect, requireGarageSession |  |
| `/dashboard` | Dashboard | DSH-01 Owner 360 | requireModulePageAccess |  |
| `/display/customer-queue` | Display | ORD-03 Tracking | — (client/API) |  |
| `/display/payment` | Display | POS-02 Checkout | — (client/API) | Layar pelanggan saat bayar |
| `/events/[slug]/menu` | Event | EVT-02 Event Menu | requirePermission |  |
| `/grand-opening` | Publik | EVT-01 Events | — (client/API) |  |
| `/invoice/[token]` | Publik | POS-06 Receipt | — (client/API) |  |
| `/legal/privacy` | Publik | — | — (client/API) |  |
| `/legal/terms` | Publik | — | — (client/API) |  |
| `/login/2fa` | Auth | — | — (client/API) |  |
| `/login` | Auth | — | — (client/API) | Login staf (tidak ada di registry §25.1) |
| `/member` | Member | MEM-03 Profile, MEM-04 Card, MEM-05 Points | — (client/API) |  |
| `/member-login` | Member | MEM-01 Login | — (client/API) |  |
| `/oauth/consent` | AI/MCP | AI-04 Approval & Receipt | redirect | Consent OAuth ChatGPT (M0) |
| `/order` | Order/QR | ORD-01 Digital Menu, ORD-02 Cart, ORD-03 Tracking | requireGarageSession |  |
| `/order/qr-print` | Order/QR | TBL-02 QR Setup | — (client/API) |  |
| `/os` | OS shell | — | requireModulePageAccess | Kerangka 24 modul /os?module=… (lihat tabel modul) |
| `/owner/payroll/employees` | Payroll | HR-02 Directory | — (client/API) |  |
| `/owner/payroll` | Payroll | HR-06 Payroll Preview | — (client/API) |  |
| `/owner/payroll/pay` | Payroll | HR-06 Payroll Preview | — (client/API) |  |
| `/owner/payroll/readiness` | Payroll | HR-06 Payroll Preview | — (client/API) |  |
| `/owner/payroll/requests` | Payroll | HR-06 Payroll Preview | — (client/API) |  |
| `/owner/payroll/settings` | Payroll | HR-06 Payroll Preview, SYS-07 Settings | — (client/API) |  |
| `/owner/payroll/thr` | Payroll | HR-06 Payroll Preview | — (client/API) |  |
| `/owner/payroll/today` | Payroll | HR-04 Attendance, HR-06 Payroll Preview | — (client/API) |  |
| `/` | Publik | — | — (client/API) | Website publik Garage Coffee (di luar registry operasional) |
| `/pos` | POS | POS-01 Catalog/Cart, POS-02 Checkout | requireModulePageAccess |  |
| `/pos-login` | Auth | — | — (client/API) | Login kasir/terminal POS |
| `/recruitment` | HR | HR-01 Staff Applications | — (client/API) |  |
| `/saas-executive` | Dashboard | DSH-01 Owner 360 | — (client/API) | Tampilan eksekutif lama; kandidat digabung |
| `/sales-history` | POS | POS-03 Transactions, POS-04 Refund/Void | redirect, requireGarageSession |  |
| `/shift` | Shift | SHF-01 Open, SHF-02 Active, SHF-03 Cash Movement, SHF-04 Closing Wizard, SHF-05 Cash Count | redirect, requireGarageSession |  |
| `/staff/wallet-fee` | Payroll | HR-06 Payroll Preview | — (client/API) |  |
| `/staff/wallet-gaji` | Payroll | HR-06 Payroll Preview | — (client/API) |  |
| `/undangan/[token]` | Event | EVT-04 Personal Links, EVT-05 RSVP | — (client/API) |  |
| `/warehouse/activity-log` | WMS | SYS-05 Audit & Recovery | redirect, requireGarageSession |  |
| `/warehouse/adjustment` | WMS | WMS-06 Adjustments | redirect, requireGarageSession |  |
| `/warehouse/analytics` | WMS | RPT-02 Preview | redirect, requireGarageSession |  |
| `/warehouse/bar` | WMS | KDS-03 Batch | redirect, requireGarageSession |  |
| `/warehouse/checklist` | WMS | WMS-01 Inventory | redirect, requireGarageSession |  |
| `/warehouse/closing` | WMS | WMS-05 Opname | redirect, requireGarageSession |  |
| `/warehouse/cold-chain` | WMS | WMS-01 Inventory | redirect, requireGarageSession |  |
| `/warehouse/internal-order` | WMS | WMS-02 Requests | redirect, requireGarageSession |  |
| `/warehouse/inventory` | WMS | WMS-01 Inventory | redirect, requireGarageSession |  |
| `/warehouse/keuangan` | WMS | WMS-03 PR/PO, REC-03 Supplier Cost | redirect, requireGarageSession |  |
| `/warehouse/kitchen` | WMS | KDS-03 Batch | redirect, requireGarageSession |  |
| `/warehouse/master` | WMS | WMS-07 Suppliers, REC-01 Materials | redirect, requireGarageSession |  |
| `/warehouse/material-requests` | WMS | WMS-02 Requests, KDS-05 Material Request | redirect, requireGarageSession |  |
| `/warehouse/opname` | WMS | WMS-05 Opname | redirect, requireGarageSession |  |
| `/warehouse` | WMS | WMS-01 Inventory | redirect, requireGarageSession |  |
| `/warehouse/preparation` | WMS | KDS-03 Batch | redirect, requireGarageSession |  |
| `/warehouse/production` | WMS | KDS-03 Batch | redirect, requireGarageSession |  |
| `/warehouse/purchase-orders` | WMS | WMS-03 PR/PO | redirect, requireGarageSession |  |
| `/warehouse/purchasing` | WMS | WMS-03 PR/PO | redirect, requireGarageSession |  |
| `/warehouse/receiving` | WMS | WMS-04 Receiving | redirect, requireGarageSession |  |
| `/warehouse/recipe` | WMS | REC-02 BOM, REC-05 Recipe Versions | redirect, requireGarageSession |  |
| `/warehouse/reorder` | WMS | WMS-03 PR/PO | redirect, requireGarageSession |  |
| `/warehouse/reports` | WMS | RPT-02 Preview | redirect, requireGarageSession |  |
| `/warehouse/requests` | WMS | WMS-02 Requests | redirect, requireGarageSession |  |
| `/warehouse/scan` | WMS | WMS-01 Inventory | redirect, requireGarageSession |  |
| `/warehouse/settings` | WMS | SYS-07 Settings | redirect, requireGarageSession |  |
| `/warehouse/transfer` | WMS | WMS-06 Adjustments | redirect, requireGarageSession |  |
| `/warehouse/waste` | WMS | WMS-06 Adjustments | redirect, requireGarageSession |  |
| `/wifi` | Member | MEM-03 Profile | — (client/API) |  |

## Modul OS (`/os?module=…`)

| Modul | Layar PRD | Role | Catatan |
|---|---|---|---|
| `ai-agent` | AI-01 Command Center, AYA-01 Contextual Assistant | Kasir, Manajer, Owner, Waiter |  |
| `approvals` | FIN-07 Daily Approval Center, SYS-01 Access Approval | Manajer, Owner |  |
| `audit` | SYS-05 Audit & Recovery | Manajer, Owner |  |
| `chat` | MSG-01 Alerts | Kasir, Manajer, Owner, Waiter | Chat internal staf/pelanggan |
| `company-control` | SYS-07 Settings, SYS-08 Module Registry | Owner |  |
| `courier` | ORD-03 Tracking | Manajer, Owner, Waiter |  |
| `crm` | CRM-01 Directory, CRM-02 Segment | Manajer, Owner |  |
| `dashboard` | DSH-01 Owner 360 | Manajer, Owner |  |
| `earnings` | HR-06 Payroll Preview | Kasir, Manajer, Owner, Waiter |  |
| `events` | EVT-01 Events, EVT-03 Guest List, CAT-05 Event Pricing | Manajer, Owner |  |
| `finance` | FIN-01 Overview, FIN-02 Cash Ledger, FIN-03 Reconciliation, FIN-04 QRIS | Manajer, Owner |  |
| `inventory` | WMS-01 Inventory | Kasir, Manajer, Owner | Ringkas; operasi stok di /warehouse |
| `kitchen` | KDS-01 Ticket Board, KDS-02 Ticket Detail, KDS-04 Stock-out | Kasir, Manajer, Owner |  |
| `marketing` | MKT-01 Assets, MKT-02 Editor, MKT-03 Calendar, MKT-04 Publish Queue | Manajer, Owner |  |
| `membership` | CRM-02 Segment, MEM-04 Card, MEM-05 Points | Manajer, Owner |  |
| `ops-center` | DSH-04 Alerts | Kasir, Manajer, Owner, Waiter |  |
| `pos` | POS-01 Catalog/Cart, POS-02 Checkout, POS-07 Pending Payments | Kasir, Manajer, Owner |  |
| `produk` | CAT-01 Catalog, CAT-02 Product Form, CAT-03 Variant/Add-on, CAT-06 Import Review | Manajer, Owner |  |
| `recruitment` | HR-01 Staff Applications | Manajer, Owner |  |
| `settings` | SYS-07 Settings, SYS-03 Outlet/Business Date | Manajer, Owner |  |
| `smart-notif` | MSG-04 Rules | Kasir, Manajer, Owner, Waiter |  |
| `team-management` | HR-02 Directory, HR-05 Schedule | Manajer, Owner |  |
| `training` | — | Kasir, Manajer, Owner, Waiter | Panduan per role (tidak ada di registry) |
| `waiter` | TBL-01 Map | Manajer, Owner, Waiter |  |
| `website` | MKT-01 Assets | Manajer, Owner | Kelola website publik |

## Route handler per grup

Grup berawalan `~` = route handler di luar `/api` (mis. `~.well-known`, `~garage-uploads`).

| Grup | Route | Guard tidak langsung | Publik* | Legacy 410 | Rate limit |
|---|---|---|---|---|---|
| `absen` | 3 | 3 | 0 | 0 | 0 |
| `account` | 2 | 0 | 0 | 0 | 0 |
| `admin` | 19 | 0 | 0 | 0 | 1 |
| `agent` | 4 | 0 | 1 | 0 | 0 |
| `agent-keys` | 2 | 0 | 0 | 0 | 0 |
| `ai` | 32 | 0 | 0 | 0 | 0 |
| `approvals` | 7 | 0 | 0 | 0 | 2 |
| `attendance-v2` | 5 | 0 | 0 | 0 | 0 |
| `audit` | 11 | 0 | 0 | 0 | 0 |
| `auth` | 1 | 1 | 0 | 0 | 1 |
| `bootstrap` | 1 | 0 | 0 | 0 | 0 |
| `chat` | 8 | 0 | 0 | 0 | 0 |
| `company` | 6 | 0 | 0 | 0 | 0 |
| `compliance` | 2 | 0 | 0 | 0 | 0 |
| `control` | 2 | 0 | 0 | 0 | 0 |
| `courier` | 8 | 0 | 0 | 0 | 2 |
| `crm` | 21 | 0 | 0 | 0 | 1 |
| `customer` | 17 | 0 | 13 | 0 | 15 |
| `customers` | 1 | 0 | 0 | 0 | 0 |
| `dashboard` | 1 | 0 | 0 | 0 | 0 |
| `dev` | 1 | 1 | 0 | 0 | 0 |
| `display` | 1 | 0 | 1 | 0 | 1 |
| `earnings` | 7 | 0 | 0 | 0 | 4 |
| `errors` | 1 | 0 | 1 | 0 | 1 |
| `events` | 19 | 0 | 0 | 0 | 0 |
| `finance` | 63 | 4 | 0 | 0 | 1 |
| `health` | 1 | 0 | 1 | 0 | 0 |
| `hr` | 20 | 2 | 0 | 0 | 1 |
| `integrations` | 14 | 0 | 0 | 0 | 0 |
| `inventory` | 24 | 0 | 0 | 13 | 0 |
| `invitations` | 1 | 0 | 1 | 0 | 1 |
| `invoice` | 1 | 0 | 1 | 0 | 1 |
| `jobs` | 4 | 0 | 0 | 0 | 0 |
| `kitchen` | 4 | 0 | 0 | 0 | 0 |
| `marketing` | 15 | 0 | 0 | 0 | 0 |
| `mcp` | 2 | 0 | 0 | 0 | 0 |
| `me` | 2 | 0 | 0 | 0 | 0 |
| `member` | 11 | 0 | 4 | 0 | 4 |
| `menu` | 7 | 0 | 0 | 0 | 0 |
| `messaging` | 1 | 0 | 0 | 0 | 0 |
| `notifications` | 1 | 0 | 0 | 0 | 0 |
| `ops-center` | 1 | 0 | 0 | 0 | 0 |
| `orders` | 18 | 0 | 0 | 0 | 7 |
| `outlets` | 1 | 0 | 0 | 0 | 0 |
| `owner` | 3 | 0 | 0 | 0 | 0 |
| `payroll` | 24 | 0 | 0 | 0 | 0 |
| `points` | 2 | 0 | 0 | 0 | 0 |
| `pos` | 11 | 0 | 0 | 0 | 3 |
| `print` | 1 | 0 | 0 | 0 | 0 |
| `print-jobs` | 2 | 0 | 0 | 0 | 0 |
| `production` | 6 | 0 | 0 | 0 | 0 |
| `products` | 5 | 0 | 0 | 0 | 0 |
| `produk-gudang` | 2 | 0 | 0 | 0 | 0 |
| `profitmax` | 5 | 0 | 0 | 0 | 0 |
| `public` | 1 | 0 | 1 | 0 | 0 |
| `push` | 2 | 0 | 1 | 0 | 0 |
| `recruitment` | 10 | 0 | 5 | 0 | 4 |
| `reports` | 3 | 0 | 0 | 0 | 0 |
| `settings` | 1 | 0 | 0 | 0 | 0 |
| `shift` | 1 | 0 | 0 | 0 | 0 |
| `site` | 7 | 0 | 2 | 0 | 2 |
| `smart-notif` | 2 | 0 | 0 | 0 | 0 |
| `staff` | 3 | 0 | 0 | 0 | 0 |
| `staff-tasks` | 2 | 0 | 0 | 0 | 0 |
| `tables` | 4 | 0 | 0 | 0 | 0 |
| `vouchers` | 2 | 0 | 1 | 0 | 1 |
| `waiter` | 15 | 0 | 0 | 0 | 0 |
| `wallet-fee` | 2 | 0 | 0 | 0 | 0 |
| `wallet-gaji` | 1 | 0 | 0 | 0 | 0 |
| `webhooks` | 2 | 0 | 0 | 0 | 0 |
| `website-events` | 1 | 0 | 1 | 0 | 0 |
| `wifi` | 4 | 1 | 1 | 0 | 2 |
| `wms` | 98 | 10 | 0 | 0 | 0 |
| `~.well-known` | 4 | 4 | 0 | 0 | 0 |
| `~franchise` | 1 | 0 | 1 | 0 | 0 |
| `~garage-brand` | 1 | 0 | 1 | 0 | 0 |
| `~garage-uploads` | 4 | 0 | 4 | 0 | 0 |
| `~grand-opening` | 1 | 0 | 1 | 0 | 0 |
| `~undangan` | 1 | 0 | 1 | 0 | 0 |

*Publik = file `route.ts` tidak memanggil guard sesi/permission yang dikenal maupun helper guard. Sebagian besar
memang publik (menu digital, status pesanan, webhook, health, file upload); daftar lengkap di bawah untuk ditinjau.

## Route dengan guard tidak langsung

| Route | Method | Mekanisme |
|---|---|---|
| `/.well-known/oauth-authorization-server/[...path]` | GET | OAuth discovery (publik) |
| `/.well-known/oauth-authorization-server` | GET | OAuth discovery (publik) |
| `/.well-known/oauth-protected-resource/[...path]` | GET | OAuth discovery (publik) |
| `/.well-known/oauth-protected-resource` | GET | OAuth discovery (publik) |
| `/api/absen/me` | POST | PIN karyawan |
| `/api/absen/punch` | POST | PIN karyawan |
| `/api/absen/slip` | POST | PIN karyawan |
| `/api/auth/[[...all]]` | GET, POST | Better Auth |
| `/api/dev/demo-login` | POST | dev-only, Better Auth |
| `/api/finance/bep` | GET | helper→requirePermission(finance:read) |
| `/api/finance/capital-recovery` | GET | helper→requirePermission(finance:read) |
| `/api/finance/cashflow` | GET | helper→requirePermission(finance:read) |
| `/api/finance/profit-loss` | GET | helper→requirePermission(finance:read) |
| `/api/hr/attendance/check` | POST | PIN karyawan |
| `/api/hr/attendance` | POST | PIN karyawan |
| `/api/wifi/router-script` | GET | shared secret |
| `/api/wms/replenishment/catalog` | GET | helper→requireGarageSession |
| `/api/wms/replenishment/notifications` | GET | helper→requireGarageSession |
| `/api/wms/replenishment/preparation` | GET | helper→requireGarageSession |
| `/api/wms/replenishment/reports` | GET | helper→requireGarageSession |
| `/api/wms/replenishment/requests/[id]/actions` | POST | helper→requireGarageSession |
| `/api/wms/replenishment/requests/[id]` | GET, PATCH | helper→requireGarageSession |
| `/api/wms/replenishment/requests` | GET, POST | helper→requireGarageSession |
| `/api/wms/replenishment/settings` | GET, PATCH | helper→requireGarageSession |
| `/api/wms/replenishment/shortages/[id]/actions` | POST | helper→requireGarageSession |
| `/api/wms/replenishment/shortages` | GET | helper→requireGarageSession |

## Route publik (tanpa guard sesi)

| Route | Method | Rate limit |
|---|---|---|
| `/api/agent/v1/openapi.json` | GET | — |
| `/api/customer/chat` | GET, POST | ya |
| `/api/customer/chat/upload` | POST | ya |
| `/api/customer/menu` | GET | ya |
| `/api/customer/ordering-status` | GET | ya |
| `/api/customer/orders/[id]/public-status` | GET | ya |
| `/api/customer/orders/[id]/push` | POST, DELETE | ya |
| `/api/customer/orders/payment-proof` | POST | ya |
| `/api/customer/qr` | GET | ya |
| `/api/customer/qr-card` | GET | ya |
| `/api/customer/qr-cards/pdf` | GET | ya |
| `/api/customer/service-requests` | POST | ya |
| `/api/customer/tables/hold` | POST, DELETE | ya |
| `/api/customer/tables/live` | GET | ya |
| `/api/display/customer-queue` | GET | ya |
| `/api/errors` | POST | ya |
| `/api/health` | GET | — |
| `/api/invitations/[token]/rsvp` | POST | ya |
| `/api/invoice/[token]/live-status` | GET | ya |
| `/api/member/auth/login` | POST | ya |
| `/api/member/auth/logout` | POST | — |
| `/api/member/auth/refresh` | POST | ya |
| `/api/member/auth/register` | POST | ya |
| `/api/public/events/[slug]/menu` | GET | — |
| `/api/push/vapid` | GET | — |
| `/api/recruitment/apply` | POST | ya |
| `/api/recruitment/parse-cv` | POST | ya |
| `/api/recruitment/positions` | GET | — |
| `/api/recruitment/track-status` | POST | ya |
| `/api/recruitment/upload` | POST | ya |
| `/api/site/live-tracking` | GET | ya |
| `/api/site/live-visit` | GET | ya |
| `/api/vouchers/validate` | POST | ya |
| `/api/website-events` | GET | — |
| `/api/wifi/config` | GET | — |
| `/franchise` | GET | — |
| `/garage-brand/[file]` | GET | — |
| `/garage-uploads/chat/[file]` | GET | — |
| `/garage-uploads/event-menu/[file]` | GET | — |
| `/garage-uploads/menu/[file]` | GET | — |
| `/garage-uploads/wms/[file]` | GET | — |
| `/grand-opening/kalender` | GET | — |
| `/undangan/[token]/kalender` | GET | — |

## Layar PRD §25.1 tanpa halaman/modul

| ID | Nama |
|---|---|
| POS-05 | Quick Retail |
| SHF-06 | Manager Handover |
| SHF-07 | History |
| DOC-01 | Explorer |
| DOC-02 | Export History |
| RPT-01 | Builder |
| RPT-03 | Schedule |
| RPT-04 | Delivery Logs |
| MEM-02 | Email/WA Verification |
| MKT-05 | Performance |
| MSG-02 | Email Draft |
| MSG-03 | Templates |
| AI-02 | Evidence Answer |
| AI-03 | Action Preview & Diff |
| AI-05 | Capability Registry |
