# WORKFLOW TESTING

## Simulation: Customer -> Cashier -> Kitchen -> Bar -> Waiter -> Inventory -> Finance -> Manager -> Owner

| Step | PASS / FAIL | Problem | Impact | Suggested Fix | Priority |
| --- | --- | --- | --- | --- | --- |
| Customer order route exists | PASS | Public `/order` dan customer order API ditemukan | Customer dapat diarahkan ke QR flow | Test dengan QR meja nyata | High |
| Cashier POS route exists | PASS | POS dan order API tersedia | Order dapat dibuat/diterima | Uji payment dan receipt | High |
| Kitchen ticket exists | PASS | KDS API dan table `kitchen_tickets` tersedia | Produksi bisa tracking | Uji station food/bar | High |
| Waiter floor exists | PASS | Waiter ticket/table/service request API tersedia | Delivery dan meja bisa tracking | Uji request bill dan clean | High |
| Inventory movement exists | PASS | Inventory movement/opname/receiving ada | Stok bisa diaudit | Pastikan auto deduction dari order di UAT | High |
| Finance closing exists | PASS | Cash session, expense, settlement tersedia | Closing bisa dilakukan | Uji open/close shift | High |
| Manager monitoring exists | PASS | Dashboard, approvals, audit, team modules ada | Manager bisa kontrol operasional | Uji role Manager langsung | Medium |
| Owner final review exists | PASS | Owner dashboard, CEO Control, audit, daily brief ada | Owner bisa review keputusan | Uji export report | Medium |
| End-to-end runtime proof | NEED REVIEW | Checklist G4 belum selesai | Belum bisa klaim operasional penuh | Jalankan 1 hari pilot/UAT | Critical |

## Warehouse WMS (automated API)

Jalankan setelah app + DB migrate/seed jalan (`npm run db:migrate:runner` atau Postgres via Docker):

```bash
npm run dev          # atau production server
npm run wms:uat      # terminal lain — 6 checks end-to-end
```

| Check | PASS / FAIL | Catatan |
| --- | --- | --- |
| Dashboard & produk WMS | NEED REVIEW | `wms-health` — butuh schema WMS lengkap |
| Recipe coverage OS→WMS | NEED REVIEW | `wms-recipe-coverage` — sync recipe di Settings |
| Receiving → stok naik | NEED REVIEW | `wms-receiving` — role Manager elevated |
| POS webhook → potong BOM | NEED REVIEW | `wms-pos-consume` — aktifkan `wmsAutoConsume` |
| Opname finalize | NEED REVIEW | `wms-opname` — gudang buat, manager finalize |
| Settings readable | PASS | `wms-settings` |

Laporan JSON: `.garage/readiness/latest-wms-operational-uat.json`

Checklist manual: `docs/CHECKLIST/WAREHOUSE_OPENING.md`, `WAREHOUSE_CLOSING.md`.
