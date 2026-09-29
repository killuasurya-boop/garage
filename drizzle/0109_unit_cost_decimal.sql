ALTER TABLE "inventory_items" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "inventory_transfer_items" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "supplier_receiving_items" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(14, 4);