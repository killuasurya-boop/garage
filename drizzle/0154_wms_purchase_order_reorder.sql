CREATE TABLE "wms_purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"supplier_id" uuid,
	"supplier_name" text DEFAULT '' NOT NULL,
	"warehouse_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"expected_date" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_purchase_order_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "wms_purchase_order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid,
	"ordered_qty" numeric(14, 4) NOT NULL,
	"received_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"unit_price" numeric(14, 4) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_reorder_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"min_qty" numeric(14, 4) NOT NULL,
	"max_qty" numeric(14, 4) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD CONSTRAINT "wms_purchase_order_item_purchase_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD CONSTRAINT "wms_purchase_order_item_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_reorder_rule" ADD CONSTRAINT "wms_reorder_rule_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_reorder_rule" ADD CONSTRAINT "wms_reorder_rule_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_purchase_order_status_idx" ON "wms_purchase_order" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "wms_purchase_order_item_po_idx" ON "wms_purchase_order_item" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_reorder_rule_product_wh_idx" ON "wms_reorder_rule" USING btree ("product_id","warehouse_id");--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD CONSTRAINT "wms_receiving_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD CONSTRAINT "wms_receiving_purchase_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill supplier_id dari nama supplier (teks bebas lama), cocok tanpa beda huruf/spasi.
UPDATE "wms_receiving" r SET "supplier_id" = s."id"
FROM "wms_supplier" s
WHERE r."supplier_id" IS NULL AND r."supplier" <> '' AND lower(trim(r."supplier")) = lower(trim(s."name"));
