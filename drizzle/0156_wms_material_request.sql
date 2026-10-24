CREATE TABLE "wms_material_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"division" text NOT NULL,
	"warehouse_id" uuid,
	"source_warehouse_id" uuid,
	"status" text DEFAULT 'submitted' NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"requested_by" text,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"received_by" text,
	"received_at" timestamp with time zone,
	"receive_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_material_request_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "wms_material_request_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"stock_at_request" numeric(14, 4) DEFAULT 0 NOT NULL,
	"sent_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"short_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"purchase_order_id" uuid,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_material_request" ADD CONSTRAINT "wms_material_request_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_material_request" ADD CONSTRAINT "wms_material_request_source_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_material_request" ADD CONSTRAINT "wms_material_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_material_request" ADD CONSTRAINT "wms_material_request_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_material_request" ADD CONSTRAINT "wms_material_request_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_material_request_item" ADD CONSTRAINT "wms_material_request_item_request_id_wms_material_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."wms_material_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_material_request_item" ADD CONSTRAINT "wms_material_request_item_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_material_request_item" ADD CONSTRAINT "wms_material_request_item_purchase_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_material_request_status_idx" ON "wms_material_request" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "wms_material_request_item_request_idx" ON "wms_material_request_item" USING btree ("request_id");