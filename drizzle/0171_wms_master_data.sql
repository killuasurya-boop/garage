ALTER TABLE "wms_category" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_product" ADD COLUMN "subcategory" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_product" ADD COLUMN "brand" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_product" ADD COLUMN "default_supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_supplier" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_product" ADD CONSTRAINT "wms_product_default_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("default_supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE set null ON UPDATE no action;