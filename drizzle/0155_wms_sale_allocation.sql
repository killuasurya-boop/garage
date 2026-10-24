CREATE TABLE "wms_sale_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref_doc" text NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid,
	"batch_id" uuid,
	"qty" numeric(14, 4) NOT NULL,
	"returned_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"seq" bigserial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_sale_allocation" ADD CONSTRAINT "wms_sale_allocation_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_sale_allocation" ADD CONSTRAINT "wms_sale_allocation_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_sale_allocation" ADD CONSTRAINT "wms_sale_allocation_batch_id_wms_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."wms_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_sale_allocation_ref_idx" ON "wms_sale_allocation" USING btree ("ref_doc","product_id");