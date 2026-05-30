# Dokumentasi Lengkap Aplikasi GARAGE

Dokumen ini menjelaskan aplikasi **Garage Digital Ecosystem / Garage Coffee & Motor OS** berdasarkan struktur kode, README, PRD, route aplikasi, schema database, dan modul layanan yang ada di repository ini.

## 1. Ringkasan Aplikasi

Garage Digital Ecosystem adalah sistem operasional terpadu untuk bisnis F&B Garage Coffee & Motor. Aplikasi ini menggabungkan:

- Website publik Garage Coffee & Motor.
- Login staf dan login khusus POS.
- POS kasir tablet.
- Order customer via QR meja.
- Kitchen Display System (KDS).
- Inventory dan stock opname.
- Finance, cash session, expense, settlement, supplier invoice, dan laporan.
- CRM, member, loyalty point, voucher, dan segmentasi pelanggan.
- Approval workflow dan audit log.
- GARAGE AI untuk owner, POS agent, system doctor, report, provider AI, knowledge upload, dan action approval.
- CEO / Company Control untuk dokumen perusahaan, struktur organisasi, dan training.
- Fee karyawan / earnings dan payout.
- Pengaturan outlet dan sistem.

Target utama aplikasi adalah membuat operasional outlet lebih cepat, rapi, terkontrol, dan siap dikembangkan ke multi-outlet.

## 2. Stack Teknologi

- Framework: Next.js App Router.
- Bahasa: TypeScript.
- UI: React, Tailwind CSS v4, shadcn/ui, Radix UI, lucide-react.
- Backend: Next.js API Route Handlers.
- Database: PostgreSQL / Neon.
- ORM: Drizzle ORM.
- Auth staf: Better Auth email/password.
- Auth member: custom member auth.
- Dokumen dan laporan: PDFKit, ExcelJS, QRCode.
- Deployment: Vercel-compatible.
- Scheduled job: Vercel Cron.

Versi penting dari `package.json`:

- `next`: 16.2.6
- `react`: 19.2.4
- `drizzle-orm`: 0.45.2
- `better-auth`: 1.6.11
- `typescript`: 5.x

Catatan penting project: repository ini punya instruksi `AGENTS.md` bahwa versi Next.js yang dipakai memiliki perubahan besar. Jika akan menulis kode Next.js, baca dulu dokumentasi lokal di `node_modules/next/dist/docs/`.

## 3. Cara Menjalankan

Install dependency:

```powershell
npm install
```

Generate dan migrasi database:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

Jalankan mode development lokal:

```powershell
npm run dev
```

URL default:

```text
http://127.0.0.1:3001
```

Jalankan mode LAN untuk tablet kasir dalam Wi-Fi yang sama:

```powershell
npm.cmd run dev:lan
```

Jalankan server print thermal:

```powershell
npm run print:start
```

Validasi kode:

```powershell
npm run lint
npm run build
```

## 4. Environment Variable Penting

Database dan auth:

- `DATABASE_URL`
- `DATABASE_SSL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GARAGE_TRUSTED_ORIGINS`

Public URL dan QR:

- `GARAGE_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL`

Seed:

- `GARAGE_SEED_PASSWORD`
- `GARAGE_MEMBER_SEED_PASSWORD`

POS:

- `GARAGE_POS_API_KEY`

Member:

- `MEMBER_AUTH_SECRET`

WhatsApp dan review:

- `WHATSAPP_CLOUD_API_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_API_VERSION`
- `WHATSAPP_CLOUD_TEMPLATE_NAME`
- `WHATSAPP_CLOUD_TEMPLATE_LANGUAGE`
- `GARAGE_GOOGLE_REVIEW_URL`

AI:

- `OPENAI_API_KEY`
- `OPENAI_POS_AGENT_MODEL`
- `OPENAI_POS_AGENT_FAST_MODEL`
- `OPENAI_POS_AGENT_MANAGER_MODEL`
- `OPENAI_POS_AGENT_FINANCE_MODEL`
- `OPENAI_POS_AGENT_ASYNC_MODEL`
- `OPENAI_GARAGE_VECTOR_STORE_ID`
- `AI_CONFIG_ENCRYPTION_KEY`
- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `MOONSHOT_API_KEY`
- `CUSTOM_AI_API_KEY`

Cron dan report:

- `GARAGE_JOB_SECRET`
- `CRON_SECRET`
- `AI_LOG_RETENTION_DAYS`
- `AI_LOG_CLEANUP_INTERVAL_DAYS`
- `GARAGE_REPORT_TIME_ZONE`
- `GARAGE_REPORT_OFFSET_DAYS`

Google Drive:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID`
- `GOOGLE_DRIVE_REPORTS_FOLDER_ID`
- `GOOGLE_DRIVE_SUPPORTS_ALL_DRIVES`

SSH / Codex bridge:

- `GARAGE_SSH_TARGET_ALIAS`
- `GARAGE_SSH_HOST`
- `GARAGE_SSH_PORT`
- `GARAGE_SSH_USER`
- `GARAGE_SSH_KEY_PATH`
- `GARAGE_SSH_ALLOW_COMMAND_EXECUTION`

## 5. Akun Seed

Contoh login staf:

- `owner@garage.local`
- `admin@garage.local`
- `kasir@garage.local`
- `barista@garage.local`
- `kitchen@garage.local`
- `koki@garage.local`
- `waiter1@garage.local`
- `waiter2@garage.local`

Password default mengikuti `GARAGE_SEED_PASSWORD`, default:

```text
garage12345
```

Contoh login member:

- `081300001001` / `member12345` - Silver
- `081300001002` / `member12345` - Gold
- `081300001003` / `member12345` - Platinum

POS:

- Terminal code: `GARAGE-POS-01`
- POS dev API key: `garage-pos-dev-key`

## 6. Halaman Utama

### Public Website

Route:

- `/`

Fungsi:

- Landing page Garage Coffee & Motor.
- Menampilkan brand, konsep coffee & motor, dan asset hero.
- Asset hero dapat dikelola dari modul Website.

### Staff Login

Route:

- `/login`

Fungsi:

- Login staf menggunakan Better Auth.
- Setelah login diarahkan ke OS sesuai role dan module access.

### Garage OS

Route:

- `/os`
- `/os?module=dashboard`
- `/os?module=pos`
- `/os?module=ai-agent`
- `/os?module=kitchen`
- `/os?module=inventory`
- `/os?module=finance`
- `/os?module=crm`
- `/os?module=approvals`
- `/os?module=website`
- `/os?module=company-control`
- `/os?module=earnings`
- `/os?module=audit`
- `/os?module=settings`

Fungsi:

- Shell utama aplikasi internal.
- Memuat modul berdasarkan query `module`.
- Akses halaman divalidasi dengan role/module access.

### POS Login

Route:

- `/pos-login`
- `/login-pos` redirect permanen ke `/pos-login`

Fungsi:

- Login khusus staf POS.
- Dirancang untuk tablet kasir.

### POS Tablet

Route:

- `/pos`

Fungsi:

- Mode kasir tablet.
- Buka shift, pilih menu, kelola cart, pilih meja, pembayaran, cetak struk, lookup member, dan QR order queue.

### Order Customer

Route:

- `/order`

Fungsi:

- Halaman order customer.
- Mendukung konteks QR meja, takeaway, Instagram, dan campaign.
- Customer bisa memilih menu dan checkout.

### Cetak QR Meja

Route:

- `/order/qr-print`

Fungsi:

- Mencetak QR meja.
- Mendukung single table, range table, atau semua meja.
- Format query contoh: `/order/qr-print?tables=01,25,50`.

### Member Login dan Member Dashboard

Route:

- `/member-login`
- `/member`

Fungsi:

- Registrasi dan login member.
- Dashboard member berisi level, poin, progress, history, redeem, dan wallet.

### Invoice Public

Route:

- `/invoice/[token]`

Fungsi:

- Halaman tracking invoice publik.
- Menampilkan QR invoice, status live, dan tombol print.

### Customer Queue Display

Route:

- `/display/customer-queue`

Fungsi:

- Display antrian customer.
- Cocok untuk layar dapur/customer display.

### Shift

Route:

- `/shift`

Fungsi:

- Halaman shift, handover, dan laporan kasir.

### Sales History

Route:

- `/sales-history`

Fungsi:

- Riwayat penjualan dan detail transaksi.

### Company Control

Route:

- `/control`

Fungsi:

- Control center perusahaan.
- Dokumen, training, struktur organisasi, dan konten owner vault.

### Dashboard Alias

Route:

- `/dashboard`

Fungsi:

- Halaman dashboard yang mengarah ke pengalaman internal.

## 7. Role Pengguna

Role yang tersedia:

- Owner / CEO
- Admin
- Manager Operasional
- Finance / CFO
- Kasir
- Barista
- Koki
- Asisten Koki
- Waiter 1
- Waiter 2
- Kitchen / Barista
- Gudang
- Supervisor Shift
- Delivery Admin

Deskripsi role:

- Owner / CEO: dashboard penuh, approval akhir, semua laporan.
- Admin: kontrol operasional, POS, KDS, inventory, dan approval shift.
- Manager Operasional: outlet, shift, SOP, incident, dan queue.
- Finance / CFO: cash control, refund, void, expense, closing.
- Kasir: POS transaksi, membership lookup, dan payment.
- Barista: KDS minuman, station queue, dan status order coffee.
- Koki: KDS makanan, station queue, dan status order kitchen.
- Asisten Koki: prep, plating, dan status ticket dapur.
- Waiter 1 / Waiter 2: order meja, table service, dan handoff ke kasir.
- Kitchen / Barista: KDS, station queue, dan status order.
- Gudang: inventory, opname, transfer, dan receiving.
- Supervisor Shift: checklist, approval operasional, handover.
- Delivery Admin: delivery queue, status, dan complaint.

## 8. Permission Sistem

Permission yang dipakai:

- `dashboard:read`
- `pos:use`
- `orders:read`
- `orders:manage`
- `kitchen:read`
- `kitchen:write`
- `inventory:read`
- `inventory:write`
- `finance:read`
- `finance:write`
- `crm:read`
- `crm:write`
- `approvals:read`
- `approvals:decide`
- `audit:read`
- `staff:manage`
- `ai:use`
- `ai:manage`
- `website:manage`
- `company:read`
- `company:manage`
- `tables:read`
- `tables:write`
- `print:read`
- `print:write`
- `shift:cash`
- `shift:handover`
- `earnings:read`
- `earnings:manage`

## 9. Modul Aplikasi Internal

### 9.1 Dashboard

Module id:

- `dashboard`

Fungsi:

- Owner command center.
- Snapshot revenue, order, kitchen, cash, dan operasional.
- Menampilkan KPI dan kondisi outlet.
- API utama: `/api/dashboard`.

Akses:

- Owner / CEO
- Admin
- Manager Operasional
- Finance / CFO
- Supervisor Shift

### 9.2 POS

Module id:

- `pos`

Fungsi:

- POS tablet cashier.
- Pilih kategori menu: makanan, cemilan, coffee, non-coffee.
- Pilih varian menu.
- Cart dan checkout.
- Dine-in, takeaway, delivery.
- Table picker 01-50.
- Status meja live.
- Lookup / create member dari POS.
- Apply voucher dan poin.
- Payment cash, QRIS, bank transfer, e-wallet.
- Receipt preview dan print.
- Reprint receipt.
- Shift open dan close.
- Cash reconciliation.
- QR order incoming queue.
- QR table map.
- QR print per meja.
- Settings POS per device seperti theme, density, text size, layout bill, sound, dan auto lock.

API terkait:

- `/api/menu`
- `/api/menu/[id]`
- `/api/orders`
- `/api/orders/history`
- `/api/orders/[id]/receipt`
- `/api/orders/[id]/invoice`
- `/api/orders/[id]/void`
- `/api/orders/[id]/log-reprint`
- `/api/pos/member`
- `/api/pos/member/[phone]`
- `/api/pos/sync-transaction`
- `/api/pos/unlock`
- `/api/tables/live`
- `/api/tables/[table]/status`
- `/api/print/thermal`
- `/api/print-jobs`
- `/api/print-jobs/[id]`

### 9.3 GARAGE AI

Module id:

- `ai-agent`

Fungsi:

- AI operating intelligence untuk owner dan staf.
- POS agent untuk bantuan kasir.
- Owner chat dan history.
- Provider AI management.
- Provider test dan auto-fix.
- Agent config.
- Agent reports.
- System doctor.
- Knowledge upload.
- AI actions dengan approve/reject.
- Drive status dan OAuth.
- Scheduled master report.
- Log cleanup.
- Job status.
- SSH/Codex Bridge mode untuk draft plan koneksi SSH, command draft, preflight, verifikasi, dan rollback. Mode ini tidak menjalankan SSH otomatis dan tidak menampilkan secret.

API terkait:

- `/api/ai/health`
- `/api/ai/agents`
- `/api/ai/agents/report`
- `/api/ai/pos-agent`
- `/api/ai/owner-chat/history`
- `/api/ai/owner-chat/history/[id]`
- `/api/ai/providers`
- `/api/ai/providers/test`
- `/api/ai/providers/auto-fix`
- `/api/ai/system-doctor`
- `/api/ai/jobs/master-report`
- `/api/ai/jobs/system-doctor`
- `/api/ai/jobs/log-cleanup`
- `/api/ai/jobs/status`
- `/api/ai/logs/cleanup`
- `/api/ai/actions`
- `/api/ai/actions/[id]/approve`
- `/api/ai/actions/[id]/reject`
- `/api/ai/knowledge`
- `/api/ai/knowledge/upload`
- `/api/ai/drive/status`
- `/api/ai/drive/oauth/start`
- `/api/ai/drive/oauth/callback`
- `/api/ai/drive/oauth/disconnect`

Scheduled jobs di `vercel.json`:

- `/api/ai/jobs/master-report` setiap 23:55 WIB.
- `/api/ai/jobs/log-cleanup` setiap 3 hari.
- `/api/ai/jobs/system-doctor` setiap 30 menit.

### 9.4 Kitchen / KDS

Module id:

- `kitchen`

Fungsi:

- Live Kitchen Display System.
- Queue order dari POS dan QR.
- Status order kitchen: incoming, cooking, ready, delivered, recalled, dan sejenisnya.
- Bulk update ticket.
- Detail order.
- Recall order.
- Kitchen performance.
- Kitchen shift report.
- Station workflow untuk food dan bar.

API terkait:

- `/api/kitchen/orders`
- `/api/kitchen/orders/[id]/status`
- `/api/kitchen/orders/[id]/details`
- `/api/kitchen/orders/bulk`
- `/api/kitchen/orders/recall`
- `/api/kitchen/performance`
- `/api/kitchen/report`

### 9.5 Inventory

Module id:

- `inventory`

Fungsi:

- Daftar item inventory.
- Detail SKU.
- Stock movement.
- Stock in/out.
- Adjustment.
- Stock opname.
- Approve/reject/apply opname.
- Recipe / BOM untuk HPP menu.
- Minimum stock dan kontrol gudang.

API terkait:

- `/api/inventory`
- `/api/inventory/[sku]`
- `/api/inventory/movements`
- `/api/inventory/opname`
- `/api/inventory/opname/[id]`
- `/api/inventory/opname/[id]/approve`
- `/api/inventory/opname/[id]/reject`
- `/api/inventory/opname/[id]/apply`

### 9.6 Finance

Module id:

- `finance`

Fungsi:

- Finance overview.
- Sales summary.
- Cash sessions.
- Opening cash dan closing cash.
- Cash session daily.
- Cash session active untuk kasir.
- Cash session close.
- Cash discrepancy approval.
- Cash session report PDF.
- Transactions per cash session.
- Expenses.
- Expense approval/reject.
- Settlement.
- Supplier.
- Supplier invoice.
- Mark supplier invoice paid.
- Finance recipes dan margin.
- Invoice list.
- Finance export Excel.
- Finance guard.
- P&L summary, cashflow, supplier payables, expense analysis, dan alerts.

API terkait:

- `/api/finance/overview`
- `/api/finance/summary`
- `/api/finance/export`
- `/api/finance/guard`
- `/api/finance/invoices`
- `/api/finance/cash-sessions`
- `/api/finance/cash-sessions/me`
- `/api/finance/cash-sessions/me/active`
- `/api/finance/cash-sessions/daily`
- `/api/finance/cash-sessions/[id]/summary`
- `/api/finance/cash-sessions/[id]/transactions`
- `/api/finance/cash-sessions/[id]/close`
- `/api/finance/cash-sessions/[id]/approve-discrepancy`
- `/api/finance/cash-sessions/[id]/report`
- `/api/finance/expenses`
- `/api/finance/expenses/[id]/approve`
- `/api/finance/expenses/[id]/reject`
- `/api/finance/settlements`
- `/api/finance/suppliers`
- `/api/finance/supplier-invoices`
- `/api/finance/supplier-invoices/[id]/pay`
- `/api/finance/recipes`
- `/api/finance/recipes/margin`

### 9.7 CRM dan Membership

Module id:

- `crm`

Fungsi:

- Customer list.
- Customer detail.
- Customer order history.
- Segmentasi pelanggan.
- Campaign logs.
- Voucher per customer.
- Loyalty point.
- Membership tier.
- Dashboard CRM.

Member tier:

- Silver: 0-999 poin, multiplier 1x.
- Gold: 1000-4999 poin, multiplier 1.5x.
- Platinum: 5000+ poin, multiplier 2x.

Aturan poin default:

- Base point: `floor(amount / 1000)`.
- Redeem: 100 poin = Rp 1.000.

API CRM:

- `/api/crm/dashboard`
- `/api/crm/customers`
- `/api/crm/customers/[id]`
- `/api/crm/customers/[id]/voucher`
- `/api/crm/segments`
- `/api/crm/campaign-logs`
- `/api/customers`
- `/api/vouchers`
- `/api/vouchers/validate`

API member:

- `POST /api/member/auth/register`
- `POST /api/member/auth/login`
- `POST /api/member/auth/refresh`
- `POST /api/member/auth/logout`
- `GET /api/member/profile`
- `GET /api/member/history`
- `GET /api/member/wallet`
- `POST /api/points/earn`
- `POST /api/points/redeem`

### 9.8 Approvals

Module id:

- `approvals`

Fungsi:

- Board approval.
- Filter pending, approved, rejected, all.
- Approval stats.
- Bulk approval.
- Approve/reject request.
- Approval untuk risiko finansial, expense, void, dan aksi kritis.

API terkait:

- `/api/approvals`
- `/api/approvals/stats`
- `/api/approvals/[id]`
- `/api/approvals/bulk`

### 9.9 Website

Module id:

- `website`

Fungsi:

- Mengelola asset landing hero.
- Upload/update gambar hero website.
- Landing page publik memakai asset dari `site_assets`.

API terkait:

- `/api/site/landing-hero`

### 9.10 CEO Control / Company Control

Module id:

- `company-control`

Fungsi:

- Owner vault.
- Company documents.
- Document versions.
- Download versi dokumen.
- Training courses.
- Complete training lesson.
- Struktur organisasi.
- Konten internal perusahaan.

API terkait:

- `/api/company/documents`
- `/api/company/documents/[id]/versions`
- `/api/company/documents/[id]/versions/[versionId]/download`
- `/api/company/training`
- `/api/company/training/[id]/complete`
- `/api/company/org`

### 9.11 Fee Saya / Earnings

Module id:

- `earnings`

Fungsi:

- Wallet fee karyawan.
- Summary fee.
- Payout management.
- Approve payout.
- Pay payout.
- Cancel payout.
- Manual earning adjustment.
- Failed queue retry job.

API terkait:

- `/api/earnings/summary`
- `/api/earnings/wallet`
- `/api/earnings/adjust`
- `/api/earnings/payouts`
- `/api/earnings/payouts/[id]/approve`
- `/api/earnings/payouts/[id]/pay`
- `/api/earnings/payouts/[id]/cancel`
- `/api/jobs/earnings-retry`

### 9.12 Audit

Module id:

- `audit`

Fungsi:

- Immutable activity trail.
- Audit list.
- Audit stats.
- Mencatat aktivitas kritis seperti update settings, order, approval, cash, dan inventory.

API terkait:

- `/api/audit`
- `/api/audit/stats`

### 9.13 Pengaturan

Module id:

- `settings`

Fungsi:

- Konfigurasi billing, approval, branding, notifikasi, printer, dan loyalty per outlet.
- Data tersimpan key-value di database pada tabel `app_settings`.
- GET settings bisa dibaca role yang punya `dashboard:read`.
- PATCH settings butuh `finance:write`.
- Di UI, role yang bisa edit: Owner / CEO, Admin, Manager Operasional, Finance / CFO.
- Role lain read-only jika bisa membuka modul.

Tab pengaturan:

1. POS Billing
   - Service Charge (%)
   - PB1 / Pajak Restoran (%)
   - Max Diskon Kasir (%)
   - Receipt History Max

2. Approval
   - Threshold Approval Expense (Rp)

3. Branding
   - Nama Brand
   - Tagline
   - Alamat Outlet
   - No. Telp Outlet
   - NPWP
   - Footer Struk

4. Notifikasi
   - Approval Polling Interval (detik)
   - Sound QR Order Masuk
   - Auto-Print Struk Setelah Bayar

5. Printer
   - Nama Printer Default
   - Copies per Struk

6. Loyalty
   - Poin per Rp 1.000
   - Max Discount Voucher (%)

Default settings:

| Key | Default |
| --- | --- |
| `serviceChargePct` | 5 |
| `taxPct` | 10 |
| `manualDiscountMaxPct` | 50 |
| `receiptHistoryMax` | 20 |
| `expenseApprovalThreshold` | 1000000 |
| `brandName` | GARAGE |
| `brandTagline` | Coffee & Motor |
| `receiptFooter` | TERIMA KASIH |
| `outletAddress` | kosong |
| `outletPhone` | kosong |
| `npwp` | kosong |
| `approvalPollIntervalSec` | 60 |
| `qrSoundOn` | true |
| `autoPrintReceipt` | true |
| `defaultPrinterName` | kosong / auto-detect |
| `receiptCopies` | 1 |
| `pointsPerThousand` | 1 |
| `voucherMaxDiscountPct` | 30 |

Validasi update settings:

- `serviceChargePct`: 0-50
- `taxPct`: 0-50
- `manualDiscountMaxPct`: 0-100
- `receiptHistoryMax`: integer 5-200
- `expenseApprovalThreshold`: integer 0-1.000.000.000
- `brandName`: wajib, max 40 karakter
- `brandTagline`: max 60 karakter
- `receiptFooter`: max 120 karakter
- `outletAddress`: max 200 karakter
- `outletPhone`: max 40 karakter
- `npwp`: max 40 karakter
- `approvalPollIntervalSec`: integer 10-600
- `qrSoundOn`: boolean
- `autoPrintReceipt`: boolean
- `defaultPrinterName`: max 80 karakter
- `receiptCopies`: integer 1-5
- `pointsPerThousand`: 0-10
- `voucherMaxDiscountPct`: 0-100

API terkait:

- `GET /api/settings`
- `PATCH /api/settings`

## 10. Hak Akses Modul per Role

### Owner / CEO

Akses modul:

- Dashboard
- POS
- GARAGE AI
- Kitchen
- Inventory
- Finance
- CRM
- Approvals
- Website
- CEO Control
- Fee Saya
- Audit
- Pengaturan

### Admin

Akses modul:

- Dashboard
- POS
- GARAGE AI
- Kitchen
- Inventory
- Finance
- CRM
- Approvals
- Website
- Fee Saya
- Audit
- Pengaturan

Catatan:

- Admin tidak punya `ai:manage`, `staff:manage`, `company:read`, dan `company:manage`.

### Manager Operasional

Akses modul:

- Dashboard
- POS
- GARAGE AI
- Kitchen
- Inventory
- Finance
- CRM
- Approvals
- Fee Saya
- Audit
- Pengaturan

### Finance / CFO

Akses modul:

- Dashboard
- GARAGE AI
- Finance
- Fee Saya
- Approvals
- Audit

### Kasir

Akses modul:

- POS
- Fee Saya

### Barista

Akses modul:

- Kitchen
- Fee Saya
- GARAGE AI

### Koki

Akses modul:

- Kitchen
- Fee Saya
- GARAGE AI

### Asisten Koki

Akses modul:

- Kitchen
- Fee Saya
- GARAGE AI

### Waiter 1 dan Waiter 2

Akses modul:

- POS
- Fee Saya
- GARAGE AI

### Kitchen / Barista

Akses modul:

- Kitchen
- Fee Saya
- GARAGE AI

### Gudang

Akses modul:

- Inventory
- GARAGE AI

### Supervisor Shift

Akses modul:

- Dashboard
- POS
- GARAGE AI
- Kitchen
- Inventory
- Approvals

### Delivery Admin

Akses modul:

- GARAGE AI

## 11. API Umum dan Response Shape

Response API mengikuti pola:

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "..."
}
```

Endpoint health:

- `GET /api/health`

Fungsi:

- Mengecek `DATABASE_URL`.
- Mengecek koneksi database dengan `select 1`.

Endpoint bootstrap:

- `GET /api/bootstrap`

Fungsi:

- Memuat data awal Garage OS untuk session staf aktif.

Endpoint auth:

- `/api/auth/[[...all]]`

Fungsi:

- Better Auth route handler.

Endpoint user:

- `/api/me`
- `/api/me/active-outlet`
- `/api/outlets/list`

Fungsi:

- Informasi user aktif, outlet aktif, dan daftar outlet.

## 12. Customer Order dan QR Flow

Flow QR meja:

1. Staf mencetak QR meja dari POS atau `/order/qr-print`.
2. Customer scan QR.
3. Customer masuk ke `/order?table=XX&source=qr_table`.
4. Customer pilih menu.
5. Customer checkout.
6. Order masuk ke POS QR incoming queue.
7. Kasir accept order.
8. Ticket masuk ke Kitchen / KDS.
9. Kitchen update status.
10. Customer display / invoice live bisa melihat status.
11. Setelah selesai, meja dapat ditandai perlu dibersihkan atau siap lagi.

Sumber order customer:

- `qr_table`
- `qr_takeaway`
- `instagram`
- `campaign`

Meja yang didukung:

- 01 sampai 50.

## 13. POS dan Payment Flow

Flow transaksi POS:

1. Kasir login melalui `/pos-login` atau OS module POS.
2. Kasir membuka cash session / shift.
3. Kasir memilih order type.
4. Untuk dine-in, kasir memilih meja.
5. Kasir memilih menu dan varian.
6. Sistem menghitung subtotal, service charge, tax, diskon, voucher, dan total.
7. Kasir memilih customer guest/member.
8. Jika member, sistem lookup phone dan menerapkan loyalty.
9. Kasir memilih metode pembayaran.
10. Sistem membuat order dan payment.
11. Sistem membuat receipt dan/atau print job.
12. Kitchen ticket dibuat jika item perlu produksi.
13. Audit log dicatat untuk aksi penting.

Metode pembayaran yang disiapkan:

- Cash
- QRIS
- Bank Transfer
- E-Wallet

Provider bank/e-wallet yang disiapkan:

- BCA
- BRI
- BNI
- BANK SUMUT
- DANA
- OVO
- ShopeePay
- Bank Jago
- Lainnya

## 14. Shift dan Cash Control

Fitur shift:

- Opening cash.
- Pilihan cepat opening cash Rp 50.000 sampai Rp 500.000.
- Shift 1 dan Shift 2.
- Closing cash.
- Closing checklist.
- Payment breakdown.
- Cash session report.
- Reset table setelah closing shift.
- Handover report.

API terkait:

- `/api/shift/handover`
- `/api/finance/cash-sessions/*`

## 15. Thermal Print

Fitur print:

- Print preview modal.
- Thermal print endpoint.
- Print job queue.
- Reprint receipt.
- Log reprint.
- Setting printer default.
- Copies per struk.
- Auto-print setelah bayar.

Script:

```powershell
npm run print:start
```

File script:

- `scripts/thermal-print-server.js`

## 16. Database

Tabel utama yang ada di `src/db/schema.ts`:

- `user`
- `session`
- `account`
- `verification`
- `outlets`
- `app_settings`
- `staff_profiles`
- `menu_items`
- `menu_variants`
- `customers`
- `member_accounts`
- `member_sessions`
- `member_transactions`
- `point_redemptions`
- `pos_terminals`
- `orders`
- `order_items`
- `payments`
- `kitchen_tickets`
- `inventory_items`
- `stock_movements`
- `stock_opname_sessions`
- `stock_opname_items`
- `cash_sessions`
- `suppliers`
- `supplier_invoices`
- `expenses`
- `payment_settlements`
- `cash_movements`
- `table_sessions`
- `vouchers`
- `crm_campaign_logs`
- `voucher_redemptions`
- `menu_recipes`
- `shift_handover_reports`
- `print_jobs`
- `approvals`
- `ai_provider_configs`
- `ai_agent_configs`
- `ai_action_registry`
- `ai_agent_runs`
- `ai_action_drafts`
- `ai_agent_events`
- `ai_context_snapshots`
- `ai_owner_chat_history`
- `google_drive_connections`
- `site_assets`
- `company_documents`
- `company_document_versions`
- `training_courses`
- `training_lessons`
- `training_progress`
- `company_org_roles`
- `audit_logs`
- `staff_earning_payouts`
- `staff_earnings`
- `earnings_failed_queue`

## 17. Migrasi Database

Folder migrasi:

- `drizzle/`

Perintah:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

Seed utama:

- `src/db/seed.ts`

## 18. Reporting dan Export

Fitur report:

- Master report harian.
- Export finance.
- Cash session report PDF.
- Invoice PDF.
- Shift report PDF.
- Output Excel di folder `outputs/reports`.
- Upload Google Drive jika konfigurasi service account lengkap.

File terkait:

- `src/lib/garage-ai-report.ts`
- `src/lib/garage-invoice-pdf.ts`
- `src/lib/garage-shift-report-pdf.ts`
- `src/lib/google-drive-upload.ts`

## 19. Security dan Audit

Kontrol keamanan:

- Session staf via Better Auth.
- Member auth terpisah.
- Role-based module access.
- Permission per API.
- POS API key untuk endpoint POS eksternal.
- Rate limit memory untuk endpoint tertentu.
- Audit log untuk aksi kritis.
- Approval workflow untuk aksi risiko.
- Job secret untuk cron endpoint.
- AI config encryption key untuk konfigurasi provider AI.

Endpoint POS eksternal perlu header:

```text
x-api-key: <GARAGE_POS_API_KEY>
```

Cron job perlu header:

```text
Authorization: Bearer <GARAGE_JOB_SECRET atau CRON_SECRET>
```

## 20. Batasan dan Catatan Status

Berdasarkan README:

- Belum ada payment gateway production.
- Belum ada email provider production.
- Belum ada external ERP sync.
- Production RBAC admin UI belum disebut tersedia penuh.
- Role Garage disimpan di `staff_profiles`.
- Better Auth menangani identity dan session.
- Google Drive upload hanya aktif jika env lengkap.
- SSH/Codex Bridge tidak menjalankan SSH otomatis.

## 21. Dokumen Tambahan di Repository

Dokumen existing:

- `README.md`
- `PRD_GARAGE.md`
- `CHANGELOG.md`
- `docs/FITUR-PENGATURAN-MVP-MASTER.md`
- `docs/MVP-FINAL-SETUP-MASTER.md`
- `docs/SOP-FINAL-OPERASIONAL-GARAGE.md`
- `docs/GO-LIVE-FINAL-CHECKLIST.md`
- `docs/PILOT-ISSUE-LOG.md`
- `docs/FINAL-GO-LIVE-SIGNOFF.md`
- `docs/garage-lan-final-runbook.md`
- `docs/garage-membership.postman_collection.json`
- `docs/garage-pilot-uat-rollout.md`
- `docs/garage-pos-tablet-fullscreen.md`
- `docs/garage-production-readiness-audit.md`
- `docs/garage-qr-cashier-sop.md`
- `docs/KONSEP-FEE-KARYAWAN.md`

Dokumen seed perusahaan:

- `storage/company-documents/seed/garage-doc1-prd-master.md`
- `storage/company-documents/seed/garage-doc2-erd-master.md`
- `storage/company-documents/seed/garage-doc3-master-sop-system.md`
- `storage/company-documents/seed/garage-doc5-digital-marketing-master.md`
- `storage/company-documents/seed/garage-complete-playbook-final-integrated.pdf`
- `storage/company-documents/seed/struktur-organisasi-garage-formal.docx`

## 22. Checklist Operasional Minimum

Sebelum dipakai outlet:

1. Isi `.env.local` dari `.env.example`.
2. Pastikan `DATABASE_URL` aktif.
3. Jalankan migrasi dan seed.
4. Login Owner.
5. Cek `/api/health`.
6. Cek modul Pengaturan.
7. Atur brand, pajak, service charge, printer, dan loyalty.
8. Cek POS tablet.
9. Cek print thermal.
10. Cetak QR meja.
11. Simulasikan order customer via QR.
12. Accept order di POS.
13. Cek order masuk KDS.
14. Close shift dan cek finance report.
15. Cek audit log.
16. Cek approval workflow.
17. Jika memakai AI/report, isi env AI dan Google Drive.

## 23. Rekomendasi Pengembangan Lanjutan

Prioritas teknis:

- Tambahkan UI admin RBAC jika ingin role/permission bisa diedit tanpa seed/database.
- Hubungkan payment gateway production.
- Tambahkan email/WhatsApp provider production untuk receipt dan campaign.
- Tambahkan realtime transport jika polling belum cukup untuk KDS dan QR order.
- Tambahkan automated E2E untuk POS, QR order, KDS, finance closing, dan settings.
- Tambahkan backup dan restore strategy database.
- Tambahkan monitoring production untuk API latency, error rate, cron, dan print server.

Prioritas produk:

- Multi-outlet switcher aktif penuh.
- Procurement dan purchase order.
- Delivery admin panel lengkap.
- Fraud alert otomatis untuk void, refund, discount, dan cash mismatch.
- Dashboard BI multi-periode.
- Forecasting stok dan sales.
