# GARAGE DIGITAL ECOSYSTEM

**PRD - Point of Sale & Operational Ecosystem**
**Version Master Document**

| Dokumen | Master PRD |
| --- | --- |
| Fokus | POS, KDS, Inventory, Finance, CRM, HR, BI |
| Status | Ready for Review |
| Format | Microsoft Word / DOCX |

## 1. Executive Summary

Garage Digital Ecosystem adalah platform operasional terpadu untuk bisnis F&B yang menggabungkan POS, kitchen display, inventory, finance, membership, approval, audit log, reporting, dan dashboard owner realtime dalam satu sistem.

Tujuan utama produk ini adalah membuat operasional outlet cepat, rapi, terkontrol, dan siap scale ke multi outlet tanpa menambah kompleksitas kerja lapangan.

## 2. Product Vision

Menjadi sistem pusat kendali bisnis yang sederhana bagi staf, kuat bagi owner, dan aman untuk operasional harian.

- Menyederhanakan transaksi kasir dan alur kitchen.
- Menyediakan kontrol kas dan stok yang ketat.
- Memberikan visibilitas realtime kepada owner dan manager.
- Menyiapkan fondasi data untuk ekspansi dan AI-ready analytics.

## 3. Problem Statement

- Kas sering tidak cocok karena closing manual dan approval tidak konsisten.
- Stok tidak akurat karena transaksi POS tidak terhubung dengan recipe dan gudang.
- Owner terlambat mengetahui masalah karena laporan dibuat manual.
- Sistem POS biasa tidak cukup kuat untuk fraud prevention dan audit trail.
- Saat internet mati, operasional berhenti dan pendapatan hilang.

## 4. Goals & Success Metrics

| Area | Target |
| --- | --- |
| Selisih kas | <= 0.1% |
| Akurasi stok | >= 99% |
| Uptime sistem | >= 99.9% |
| Waktu transaksi kasir | < 30 detik |
| Training kasir baru | < 2 jam |
| Offline recovery | < 60 detik |

## 5. Target Users & Roles

| Role | Akses Utama | Catatan |
| --- | --- | --- |
| Owner / CEO | Dashboard penuh, approval akhir, semua laporan | Kontrol strategis |
| Manager Operasional | Operasional outlet, shift, SOP, incident | Pengawas harian |
| Finance / CFO | Cash, refund, void, expense, closing | Kontrol keuangan |
| Kasir | POS transaksi, membership lookup, payment | Frontline sales |
| Kitchen / Barista | KDS, queue, status order | Produksi pesanan |
| Gudang | Inventory, opname, transfer, receiving | Kontrol stok |
| Supervisor Shift | Checklist, approval operasional, handover | Quality control |
| Delivery Admin | Delivery queue, status, complaint | Order luar outlet |

## 6. Scope Produk

| Phase | Fokus | Contoh Deliverable |
| --- | --- | --- |
| MVP | Transaksi, kitchen, cash control, audit log | POS, KDS, closing, laporan harian |
| Phase 2 | Inventory lanjutan, CRM, procurement, HR | Membership, BOM, PO, shift schedule |
| Phase 3 | Multi outlet, BI, franchise, AI-ready layer | KPI owner, forecasting, franchise control |

## 7. Core Business Rules

- Semua transaksi wajib masuk POS.
- Void, refund, diskon manual, dan edit harga wajib approval.
- Kas fisik harus cocok dengan sistem saat closing.
- Stok wajib tercatat masuk dan keluar.
- Semua aktivitas kritis harus masuk audit log.
- Sistem harus tetap berjalan saat internet terganggu dan sinkron otomatis saat online kembali.

## 8. Major Functional Modules

### 8.1 POS System

- Order cepat untuk dine in, take away, delivery, dan pre-order.
- Table management, split bill, merge bill, hold order, dan reopen order.
- Payment multi-metode: cash, QRIS, transfer, e-wallet, kartu.
- Receipt print dan kirim via WhatsApp.
- Membership lookup, promo, voucher, tax, service charge.
- Shift opening, closing, dan cash reconciliation.

### 8.2 Kitchen Display System

- Order realtime dari POS dengan status queue, cooking, ready, delivered.
- Timer masak dan alert keterlambatan.
- Station-based workflow untuk food, bar, dan packaging.
- Stock out flag untuk item yang tidak tersedia.

### 8.3 Inventory & Warehouse

- Stock in/out, adjustment, opname, transfer antar outlet.
- Recipe / BOM untuk auto deduction stok.
- Waste tracking, expired tracking, minimum stock alert.
- FIFO / FEFO dan audit trail mutasi stok.

### 8.4 Finance & Cash Control

- Opening cash, cash in/out, closing, dan discrepancy detection.
- Payment breakdown per metode.
- Expense tracking dan settlement tracking.
- Export laporan harian dan bulanan.

### 8.5 CRM & Membership

- Customer profile, phone lookup, loyalty points, tier membership.
- Voucher engine, birthday promo, repeat purchase analytics.
- Customer history dan segmentasi pelanggan.

### 8.6 Security, Fraud & Audit

- RBAC, device tracking, activity log, audit log immutable.
- Fraud detection untuk void berulang, diskon mencurigakan, cash mismatch.
- Approval workflow untuk aksi finansial dan stok kritis.

## 9. Non-Functional Requirements

| Kategori | Requirement |
| --- | --- |
| Performance | Response API p95 < 200ms |
| Availability | Uptime >= 99.9% |
| Security | JWT + RBAC + TLS 1.3 + encrypted backup |
| Usability | Tablet POS friendly, minim klik, mudah dipelajari staf baru |
| Reliability | Offline capable dan auto sync |
| Scalability | Siap multi outlet dan franchise |

## 10. Data Architecture

Entitas inti yang harus dirancang mencakup users, roles, permissions, outlets, tables, menus, recipes, inventory_items, stock_movements, transactions, transaction_items, customers, memberships, shifts, cash_sessions, incidents, approvals, audit_logs, kitchen_orders, delivery_orders, reports, tasks, documents, settings, dan sync_queue.

Semua entitas operasional harus memiliki UUID, timestamps, soft delete, dan audit fields.

## 11. API Architecture

| Modul | Contoh Endpoint |
| --- | --- |
| Auth | POST /auth/login, POST /auth/refresh |
| POS | GET /pos/menus, POST /pos/orders, POST /pos/orders/:id/pay |
| Kitchen | GET /kitchen/queue, PATCH /kitchen/orders/:id/status |
| Inventory | GET /inventory/items, POST /inventory/stock-in, POST /inventory/opname |
| Finance | GET /finance/cash-sessions, POST /finance/close |
| CRM | GET /crm/customers, POST /crm/memberships |
| Reports | GET /reports/daily-sales, GET /reports/cash |

## 12. UI/UX Guidelines

- Desktop untuk owner dashboard, tablet-first untuk POS kasir.
- Gunakan hierarchy visual yang tegas, tombol besar, dan warna status yang konsisten.
- Sediakan loading, empty state, error state, dan offline banner yang jelas.
- Mendukung dark mode dan shortcut keyboard untuk kasir.

## 13. Roadmap Implementasi

| Periode | Output |
| --- | --- |
| Hari 1-30 | POS dasar, login, role, menu, transaksi, kitchen queue, closing harian |
| Hari 31-60 | Inventory dasar, approval, audit log, dashboard owner dasar, offline mode |
| Hari 61-90 | CRM, procurement dasar, reporting lengkap, multi outlet foundation |

## 14. Risks & Mitigation

| Risk | Mitigation |
| --- | --- |
| Sistem lambat saat ramai | Optimasi UI, cache, query index, realtime event queue |
| Selisih kas | Approval matrix, closing checklist, audit trail |
| Stok tidak akurat | Recipe/BOM, opname rutin, mutasi stok wajib tercatat |
| Internet putus | Offline mode + sync queue |
| Fraud internal | RBAC, approval, activity log, alert otomatis |

## 15. Definition of Done

- Transaksi stabil dan tercatat penuh.
- Kitchen menerima order realtime.
- Stok berkurang otomatis saat transaksi paid.
- Kas closing cocok dengan sistem.
- Audit log dan approval aktif.
- Owner bisa melihat dashboard realtime.
- Sistem tetap jalan saat internet terganggu.

## 16. Conclusion

Dokumen ini menjadi blueprint awal untuk membangun Garage Digital Ecosystem sebagai pusat kendali operasional bisnis F&B yang modern, aman, scalable, dan siap dikembangkan ke multi outlet.
