CREATE TABLE "wms_po_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"channel" text NOT NULL,
	"event" text NOT NULL,
	"supplier_id" uuid,
	"supplier_name" text DEFAULT '' NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"pdf_sha256" text,
	"provider_message_id" text,
	"provider_status" text,
	"note" text DEFAULT '' NOT NULL,
	"user_id" text,
	"user_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_supplier_bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"supplier_id" uuid,
	"supplier_name" text DEFAULT '' NOT NULL,
	"purchase_order_id" uuid,
	"receiving_id" uuid,
	"invoice_no" text DEFAULT '' NOT NULL,
	"invoice_date" date,
	"due_date" date,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"invoice_url" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_supplier_bill_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "wms_supplier_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"bill_id" uuid,
	"purchase_order_id" uuid,
	"supplier_id" uuid,
	"kind" text DEFAULT 'payment' NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"fund_source" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"proof_url" text,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_by_name" text DEFAULT '' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_supplier_payment_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "wms_supplier_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ref_price" numeric(14, 4) DEFAULT 0 NOT NULL,
	"role" text DEFAULT 'alternative' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "wa_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "sent_by" text;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "sent_revision" integer;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "show_prices" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "payment_terms" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD COLUMN "delivery_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD COLUMN "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_supplier" ADD COLUMN "pic_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_supplier" ADD COLUMN "areas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_supplier" ADD COLUMN "product_categories" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_supplier" ADD COLUMN "payment_method" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_supplier" ADD COLUMN "payment_term_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_po_dispatch" ADD CONSTRAINT "wms_po_dispatch_purchase_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_po_dispatch" ADD CONSTRAINT "wms_po_dispatch_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_po_dispatch" ADD CONSTRAINT "wms_po_dispatch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_bill" ADD CONSTRAINT "wms_supplier_bill_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_bill" ADD CONSTRAINT "wms_supplier_bill_purchase_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_bill" ADD CONSTRAINT "wms_supplier_bill_receiving_id_wms_receiving_id_fk" FOREIGN KEY ("receiving_id") REFERENCES "public"."wms_receiving"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_bill" ADD CONSTRAINT "wms_supplier_bill_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_payment" ADD CONSTRAINT "wms_supplier_payment_bill_id_wms_supplier_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."wms_supplier_bill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_payment" ADD CONSTRAINT "wms_supplier_payment_purchase_order_id_wms_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."wms_purchase_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_payment" ADD CONSTRAINT "wms_supplier_payment_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_payment" ADD CONSTRAINT "wms_supplier_payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_payment" ADD CONSTRAINT "wms_supplier_payment_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_product" ADD CONSTRAINT "wms_supplier_product_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_supplier_product" ADD CONSTRAINT "wms_supplier_product_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_po_dispatch_po_idx" ON "wms_po_dispatch" USING btree ("purchase_order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_supplier_bill_receiving_uidx" ON "wms_supplier_bill" USING btree ("receiving_id");--> statement-breakpoint
CREATE INDEX "wms_supplier_bill_status_idx" ON "wms_supplier_bill" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "wms_supplier_payment_bill_idx" ON "wms_supplier_payment" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "wms_supplier_payment_po_idx" ON "wms_supplier_payment" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_supplier_product_sp_idx" ON "wms_supplier_product" USING btree ("supplier_id","product_id");--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_purchase_order" ADD CONSTRAINT "wms_purchase_order_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;