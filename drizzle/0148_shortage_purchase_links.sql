CREATE TABLE "wms_purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"outlet_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_purchase_order_doc_unique" UNIQUE("doc"),
	CONSTRAINT "wms_purchase_order_status_check" CHECK ("wms_purchase_order"."status" in ('draft','approved','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "wms_purchase_order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shortage_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	CONSTRAINT "wms_purchase_order_item_shortage_id_unique" UNIQUE("shortage_id"),
	CONSTRAINT "wms_purchase_item_amounts_check" CHECK ("wms_purchase_order_item"."qty" > 0 and "wms_purchase_order_item"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "wms_purchase_receipt" (
	"receiving_id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_purchase_receipt_item" (
	"receiving_item_id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD CONSTRAINT "wms_purchase_order_item_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD CONSTRAINT "wms_purchase_order_item_shortage_id_wms_closing_shortage_id_fk" FOREIGN KEY ("shortage_id") REFERENCES "public"."wms_closing_shortage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD CONSTRAINT "wms_purchase_order_item_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_receipt" ADD CONSTRAINT "wms_purchase_receipt_receiving_id_wms_receiving_id_fk" FOREIGN KEY ("receiving_id") REFERENCES "public"."wms_receiving"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_receipt" ADD CONSTRAINT "wms_purchase_receipt_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_receipt_item" ADD CONSTRAINT "wms_purchase_receipt_item_receiving_item_id_wms_receiving_item_id_fk" FOREIGN KEY ("receiving_item_id") REFERENCES "public"."wms_receiving_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_receipt_item" ADD CONSTRAINT "wms_purchase_receipt_item_order_item_id_wms_purchase_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."wms_purchase_order_item"("id") ON DELETE no action ON UPDATE no action;