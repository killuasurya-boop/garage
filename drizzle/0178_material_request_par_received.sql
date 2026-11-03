ALTER TABLE "wms_material_request_item" ADD COLUMN "received_qty" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_product" ADD COLUMN "par_stock" numeric(14, 4) DEFAULT 0 NOT NULL;