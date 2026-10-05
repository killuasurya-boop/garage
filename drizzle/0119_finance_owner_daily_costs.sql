-- Biaya tetap harian versi owner (Okt 2026): total Rp799.000/hari
-- (operasional Rp699.000 + Save Money Rp100.000). Hanya mengubah baris yang
-- sudah ada; DB kosong akan di-seed dengan nilai yang sama oleh finance-control.
UPDATE "finance_cost_items" SET "name" = 'Upah karyawan', "daily_amount" = 544000, "active" = true, "sort_order" = 1, "updated_at" = now() WHERE "code" = 'GAJI';--> statement-breakpoint
UPDATE "finance_cost_items" SET "name" = 'Listrik', "daily_amount" = 35000, "active" = true, "sort_order" = 2, "updated_at" = now() WHERE "code" = 'LISTRIK';--> statement-breakpoint
UPDATE "finance_cost_items" SET "daily_amount" = 10000, "active" = true, "sort_order" = 3, "updated_at" = now() WHERE "code" = 'INTERNET';--> statement-breakpoint
UPDATE "finance_cost_items" SET "daily_amount" = 30000, "active" = true, "sort_order" = 4, "updated_at" = now() WHERE "code" = 'IKLAN';--> statement-breakpoint
UPDATE "finance_cost_items" SET "daily_amount" = 100000, "active" = true, "sort_order" = 5, "updated_at" = now() WHERE "code" = 'SAVE';--> statement-breakpoint
UPDATE "finance_cost_items" SET "daily_amount" = 25000, "active" = true, "sort_order" = 6, "updated_at" = now() WHERE "code" = 'SEWA';--> statement-breakpoint
UPDATE "finance_cost_items" SET "daily_amount" = 55000, "active" = true, "sort_order" = 7, "updated_at" = now() WHERE "code" = 'OVERHEAD';--> statement-breakpoint
UPDATE "finance_cost_items" SET "daily_amount" = 0, "active" = false, "sort_order" = 8, "updated_at" = now() WHERE "code" = 'SISTEM';--> statement-breakpoint
-- Snapshot otomatis dihitung ulang dengan biaya baru (snapshot terkunci/closing tidak disentuh).
DELETE FROM "financial_snapshots" WHERE "status" = 'auto';
