ALTER TABLE "wms_batch" ALTER COLUMN "qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_batch" ALTER COLUMN "hpp" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_bom_item" ALTER COLUMN "qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_internal_order" ALTER COLUMN "total_hpp" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_internal_order_item" ALTER COLUMN "qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_internal_order_item" ALTER COLUMN "line_hpp" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_opname_line" ALTER COLUMN "system_qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_opname_line" ALTER COLUMN "physical_qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_product" ALTER COLUMN "min_stock" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_product" ALTER COLUMN "hpp" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ALTER COLUMN "ordered_qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ALTER COLUMN "received_qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ALTER COLUMN "hpp" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ALTER COLUMN "qty" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ALTER COLUMN "value_hpp" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_warehouse_stock" ALTER COLUMN "qty" SET DATA TYPE numeric(14, 4);