# FEATURE MAP GarageOS

Generated: 2026-06-28 11:28

Evidence source:
- `src/app`: 64 page files, 328 API route files.
- `src/lib/role-access.ts`: role, module, permission matrix.
- `src/db/schema.ts`: 102 database entities.
- `CHECKLIST_MVP_FINAL.md`: status MVP dan gap manual test.

| Feature | Purpose | Roles | Input | Output | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Login & Session | Masuk aplikasi, session Better Auth, 2FA untuk role sensitif. | Semua role | Email, password, 2FA bila aktif. | Session user dan staff profile. | user, session, staffProfiles, twoFactor | [Working] |
| Role & Permission Matrix | Menyembunyikan modul dan membatasi API berdasarkan role. | Semua role internal | Role staff. | Module list dan permission guard. | src/lib/role-access.ts, server-auth.ts | [Working] |
| Owner Dashboard | Snapshot omzet, order aktif, low stock, alert, export daily brief. | Owner / CEO, Manager Operasional, Finance / CFO | Tanggal/outlet. | KPI dan laporan ringkas. | /api/dashboard, /api/owner/daily-brief | [Need Review] |
| POS Cashier | Input order, pilih menu/varian, promo, member lookup, pembayaran, receipt, printer. | Owner / CEO, Admin, Manager Operasional, Kasir, Supervisor Shift | Meja/channel, item, varian, qty, member, payment. | Order, payment, kitchen ticket, receipt. | orders, orderItems, payments, kitchenTickets, cashSessions | [Working] |
| QR Customer Order | Customer pesan dari menu digital / order page. | Customer, Kasir, Waiter | Meja, nama, WhatsApp, item. | Customer order masuk antrian validasi. | /order, /api/customer/orders | [Working] |
| Kitchen Display System | Queue produksi makanan/minuman, status queue/cooking/ready/delivered. | Barista, Koki, Kitchen / Barista, Manager Operasional | Ticket order. | Status ticket dan performa station. | kitchenTickets, /api/kitchen/* | [Working] |
| Waiter Floor | Pantau meja, klaim ticket, deliver, request bill, clean/move/seat-next. | Waiter 1, Waiter 2, Manager Operasional, Admin | Ticket dan nomor meja. | Status meja dan pelayanan. | tableSessions, serviceRequests, /api/waiter/* | [Working] |
| Inventory & Product Management | Kelola produk, SKU, varian, gambar, promo, stok, movement, opname. | Owner / CEO, Admin, Manager Operasional, Gudang | Produk, SKU, foto, varian, stok, movement. | Menu aktif, stok, opname, transfer. | menuItems, menuVariants, inventoryItems, stockMovements | [Working] |
| Supplier Receiving & Transfer | Penerimaan supplier, transfer stok antar lokasi, PDF transfer/receiving. | Gudang, Admin, Manager Operasional | Supplier, item, qty, lokasi. | Receiving note, movement, transfer request. | supplierReceivings, inventoryTransferRequests | [Working] |
| Finance Cash Closing | Cash session, expense, settlement, anomaly, forecast, supplier invoice. | Owner / CEO, Finance / CFO, Kasir | Opening cash, transaksi, closing cash, expense. | Cash report, discrepancy, finance summary. | cashSessions, expenses, paymentSettlements | [Working] |
| Approvals | Gate risiko untuk void, diskon, expense, discrepancy, bulk decision. | Owner / CEO, Admin, Manager Operasional, Finance / CFO | Request approval. | Approve/reject dan audit log. | approvals, /api/approvals/* | [Working] |
| CRM & Membership | Customer, tag, segment, points, vouchers, member card. | Owner / CEO, Admin, Manager Operasional | Data customer, point, voucher. | Segment, voucher, card image/PDF. | customers, memberAccounts, vouchers | [Working] |
| Marketing & Publishing | Campaign, promo, broadcast, calendar, social publishing queue. | Owner / CEO, Admin, Manager Operasional | Campaign/broadcast/promo content. | Delivery queue dan campaign status. | marketingCampaigns, marketingBroadcasts | [Need Review] |
| Website Management | Hero landing, info bisnis, testimonial, asset website. | Owner / CEO, Admin | Gambar, alt text, info bisnis, testimoni. | Landing publik ter-update. | siteAssets, appSettings, /api/site/* | [Working] |
| Team Management / HR | Staff, shifts, attendance, SOP, KPI, payroll, advances, announcement, glossary. | Owner / CEO, Admin, Manager Operasional | Data staff, shift, attendance, SOP. | Roster, payroll, log SOP, KPI. | employeeAttendances, shiftSchedules, sopChecklists | [Working] |
| Recruitment | Public apply, upload file privat, kandidat, posisi, analytics, status tracking. | Owner / CEO, Admin, Manager Operasional, Pelamar | Data lamaran, CV, foto, file pendukung. | Candidate record dan status lamaran. | candidates, recruitmentPositions | [Working] |
| Chat Internal | Channel chat direct/role/broadcast, upload, read state. | Semua role internal | Pesan dan attachment. | Riwayat chat internal. | chatChannels, chatMessages | [Working] |
| GARAGE AI | Owner chat, POS agent, alerts, actions approval, reports, system doctor, TTS. | Owner / CEO, Manager Operasional, Finance / CFO, Station tertentu | Prompt, alert, job run. | Insight, action draft, report. | aiAgentConfigs, aiActionDrafts, aiAgentRuns | [Need Review] |
| Audit & Compliance | Audit log, suspicious, risk scores, cases, shift integrity, compliance items. | Owner / CEO, Manager Operasional, Finance / CFO | Event operasional, case, compliance status. | Risk dashboard dan case notes. | auditLogs, auditCases, complianceItems | [Working] |
| Backup Google Drive | Koneksi Google Drive tersedia di kode AI/Drive, checklist backup harian belum terbukti selesai. | Owner / CEO | OAuth credential dan file backup. | Backup drive. | googleDriveConnections, checklist F1 | [Incomplete] |

## API Route Groups

| Group | Route Count |
| --- | --- |
| account | 1 |
| admin | 19 |
| ai | 32 |
| approvals | 6 |
| audit | 11 |
| auth | 1 |
| bootstrap | 1 |
| chat | 8 |
| company | 6 |
| compliance | 2 |
| crm | 18 |
| customer | 9 |
| customers | 1 |
| dashboard | 1 |
| dev | 1 |
| display | 1 |
| earnings | 7 |
| errors | 1 |
| finance | 27 |
| health | 1 |
| hr | 15 |
| integrations | 14 |
| inventory | 24 |
| invoice | 1 |
| jobs | 4 |
| kitchen | 8 |
| marketing | 14 |
| me | 2 |
| member | 11 |
| menu | 4 |
| messaging | 1 |
| orders | 7 |
| outlets | 1 |
| owner | 3 |
| points | 2 |
| pos | 10 |
| print | 1 |
| print-jobs | 2 |
| produk-gudang | 2 |
| profitmax | 5 |
| push | 1 |
| recruitment | 9 |
| settings | 1 |
| shift | 1 |
| site | 5 |
| smart-notif | 2 |
| staff | 3 |
| staff-tasks | 2 |
| tables | 2 |
| vouchers | 2 |
| waiter | 12 |
| webhooks | 2 |
| website-events | 1 |

## Database Entities

user, error_events, feedback_entries, push_subscriptions, login_attempts, two_factor, session, account, verification, outlets, app_settings, staff_profiles, menu_items, menu_variants, customers, customer_tags, member_accounts, member_sessions, member_transactions, point_redemptions, pos_terminals, orders, order_items, service_requests, customer_chat_threads, customer_chat_messages, payments, kitchen_tickets, inventory_items, stock_movements, inventory_location_stocks, inventory_transfer_requests, inventory_transfer_items, stock_opname_sessions, stock_opname_items, cash_sessions, suppliers, supplier_invoices, supplier_receivings, supplier_receiving_items, expenses, payment_settlements, cash_movements, table_sessions, vouchers, crm_campaign_logs, voucher_redemptions, marketing_campaigns, marketing_broadcasts, marketing_broadcast_deliveries, social_publisher_connections, content_publishing_queue, content_publishing_results, whatsapp_messaging_queue, menu_recipes, menu_research, shift_handover_reports, print_jobs, approvals, ai_provider_configs, ai_agent_configs, ai_action_registry, ai_agent_runs, ai_action_drafts, ai_agent_events, ai_context_snapshots, ai_owner_chat_history, google_drive_connections, site_assets, company_documents, company_document_versions, training_courses, training_lessons, training_progress, company_org_roles, audit_logs, staff_earning_payouts, staff_earnings, earnings_failed_queue, chat_channels, chat_channel_members, chat_messages, audit_cases, staff_tasks, custom_segments, custom_segment_customers, employee_attendances, shift_schedules, sop_checklists, sop_logs, kpi_evaluations, staff_salaries, staff_payrolls, announcements, staff_advances, staff_shift_handovers, operation_locations, operation_glossary, compliance_items, candidates, recruitment_positions, notification_logs

## Hidden / Restricted Features

- CEO Control hanya untuk Owner / CEO pada route control dashboard.
- Finance dan Earnings disembunyikan dari Manager Operasional menurut komentar `role-access.ts`.
- Admin operasional tidak mendapat Owner Dashboard, Garage AI, Finance, Earnings, CEO Control, dan Audit.
- File kandidat recruitment dilayani lewat route privat dan butuh session Owner/Admin/Manager.

## Dead / Broken / Need Review

- Backup Google Drive tercatat belum selesai di checklist F1.
- Manual golden path belum terbukti selesai di checklist G4.
- Beberapa modul AI/marketing/social publishing membutuhkan credential eksternal; status operasional harus diuji.
- Procurement tidak ada sebagai role eksplisit di `role-access.ts`; prosesnya tersebar di inventory receiving dan finance supplier invoice.
