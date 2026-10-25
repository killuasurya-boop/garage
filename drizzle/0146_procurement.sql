CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_cost" numeric(14, 4) DEFAULT 0 NOT NULL,
	"received_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"request_item_id" uuid
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"supplier_id" uuid,
	"supplier_name" text DEFAULT '' NOT NULL,
	"area" text DEFAULT 'umum' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_term" text DEFAULT 'cash' NOT NULL,
	"due_days" integer DEFAULT 0 NOT NULL,
	"expected_date" date,
	"note" text DEFAULT '' NOT NULL,
	"total_estimate" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"approved_qty" numeric(14, 4),
	"usable_at_request" numeric(14, 4) DEFAULT 0 NOT NULL,
	"incoming_at_request" numeric(14, 4) DEFAULT 0 NOT NULL,
	"ref_unit_cost" numeric(14, 4) DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"area" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"requested_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_requests_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "receiving_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "po_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_internal_order" ADD COLUMN "source_warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_internal_order" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "wms_internal_order" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_internal_order" ADD COLUMN "decision_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "po_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "payment_term" text DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "invoice_no" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ADD COLUMN "po_item_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "review_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_request_item_id_purchase_request_items_id_fk" FOREIGN KEY ("request_item_id") REFERENCES "public"."purchase_request_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_order_items_po_idx" ON "purchase_order_items" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_request_items_request_idx" ON "purchase_request_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests" USING btree ("status","area");--> statement-breakpoint
ALTER TABLE "wms_internal_order" ADD CONSTRAINT "wms_internal_order_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD CONSTRAINT "wms_stock_opname_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD CONSTRAINT "wms_stock_opname_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;