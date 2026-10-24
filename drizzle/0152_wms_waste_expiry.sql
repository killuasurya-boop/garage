CREATE TABLE "wms_waste" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"warehouse_id" uuid,
	"product_id" uuid,
	"batch_id" uuid,
	"qty" numeric(14, 4) NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"estimated_value" numeric(14, 4) DEFAULT 0 NOT NULL,
	"value" numeric(14, 4) DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"requested_by" text,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_waste_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
ALTER TABLE "wms_production_recipe" ADD COLUMN "shelf_life_hours" integer;--> statement-breakpoint
ALTER TABLE "wms_waste" ADD CONSTRAINT "wms_waste_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_waste" ADD CONSTRAINT "wms_waste_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_waste" ADD CONSTRAINT "wms_waste_batch_id_wms_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."wms_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_waste" ADD CONSTRAINT "wms_waste_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_waste" ADD CONSTRAINT "wms_waste_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_waste_status_idx" ON "wms_waste" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "wms_waste_product_idx" ON "wms_waste" USING btree ("product_id");