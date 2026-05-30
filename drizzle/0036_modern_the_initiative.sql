CREATE TABLE "inventory_location_stocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_sku" text NOT NULL,
	"location_type" text NOT NULL,
	"location_key" text NOT NULL,
	"outlet_id" uuid,
	"on_hand" real DEFAULT 0 NOT NULL,
	"min_stock" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'safe' NOT NULL,
	"movement" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"item_sku" text,
	"item_name" text NOT NULL,
	"unit" text NOT NULL,
	"requested_qty" real NOT NULL,
	"issued_qty" real DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_no" text NOT NULL,
	"outlet_id" uuid,
	"status" text DEFAULT 'requested' NOT NULL,
	"note" text,
	"requested_by" text,
	"approved_by" text,
	"issued_by" text,
	"rejected_by" text,
	"approved_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_transfer_requests_request_no_unique" UNIQUE("request_no")
);
--> statement-breakpoint
CREATE TABLE "supplier_receiving_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receiving_id" uuid NOT NULL,
	"item_sku" text,
	"item_name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" real NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"line_total" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_receivings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"supplier_id" uuid,
	"supplier_invoice_id" uuid,
	"invoice_no" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"note" text,
	"received_by" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_receivings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "inventory_location_stocks" ADD CONSTRAINT "inventory_location_stocks_item_sku_inventory_items_sku_fk" FOREIGN KEY ("item_sku") REFERENCES "public"."inventory_items"("sku") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location_stocks" ADD CONSTRAINT "inventory_location_stocks_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_request_id_inventory_transfer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."inventory_transfer_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_item_sku_inventory_items_sku_fk" FOREIGN KEY ("item_sku") REFERENCES "public"."inventory_items"("sku") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_requests" ADD CONSTRAINT "inventory_transfer_requests_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_requests" ADD CONSTRAINT "inventory_transfer_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_requests" ADD CONSTRAINT "inventory_transfer_requests_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_requests" ADD CONSTRAINT "inventory_transfer_requests_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_requests" ADD CONSTRAINT "inventory_transfer_requests_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receiving_items" ADD CONSTRAINT "supplier_receiving_items_receiving_id_supplier_receivings_id_fk" FOREIGN KEY ("receiving_id") REFERENCES "public"."supplier_receivings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receiving_items" ADD CONSTRAINT "supplier_receiving_items_item_sku_inventory_items_sku_fk" FOREIGN KEY ("item_sku") REFERENCES "public"."inventory_items"("sku") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receivings" ADD CONSTRAINT "supplier_receivings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receivings" ADD CONSTRAINT "supplier_receivings_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receivings" ADD CONSTRAINT "supplier_receivings_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_location_stocks_sku_location_idx" ON "inventory_location_stocks" USING btree ("item_sku","location_key");--> statement-breakpoint
CREATE INDEX "inventory_location_stocks_sku_idx" ON "inventory_location_stocks" USING btree ("item_sku");--> statement-breakpoint
CREATE INDEX "inventory_location_stocks_outlet_idx" ON "inventory_location_stocks" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "inventory_location_stocks_type_idx" ON "inventory_location_stocks" USING btree ("location_type");--> statement-breakpoint
CREATE INDEX "inventory_location_stocks_status_idx" ON "inventory_location_stocks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_transfer_items_request_idx" ON "inventory_transfer_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "inventory_transfer_items_sku_idx" ON "inventory_transfer_items" USING btree ("item_sku");--> statement-breakpoint
CREATE INDEX "inventory_transfer_requests_outlet_idx" ON "inventory_transfer_requests" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "inventory_transfer_requests_status_idx" ON "inventory_transfer_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_transfer_requests_created_at_idx" ON "inventory_transfer_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "supplier_receiving_items_receiving_idx" ON "supplier_receiving_items" USING btree ("receiving_id");--> statement-breakpoint
CREATE INDEX "supplier_receiving_items_sku_idx" ON "supplier_receiving_items" USING btree ("item_sku");--> statement-breakpoint
CREATE INDEX "supplier_receivings_supplier_idx" ON "supplier_receivings" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_receivings_invoice_idx" ON "supplier_receivings" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "supplier_receivings_received_at_idx" ON "supplier_receivings" USING btree ("received_at");--> statement-breakpoint
INSERT INTO "inventory_location_stocks" (
  "item_sku",
  "location_type",
  "location_key",
  "outlet_id",
  "on_hand",
  "min_stock",
  "status",
  "movement",
  "created_at",
  "updated_at"
)
SELECT
  "sku",
  'warehouse',
  'warehouse',
  NULL,
  "on_hand",
  "min_stock",
  "status",
  COALESCE(NULLIF("movement", ''), 'Backfill stok awal Gudang pusat'),
  now(),
  COALESCE("updated_at", now())
FROM "inventory_items"
ON CONFLICT ("item_sku", "location_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "inventory_location_stocks" (
  "item_sku",
  "location_type",
  "location_key",
  "outlet_id",
  "on_hand",
  "min_stock",
  "status",
  "movement",
  "created_at",
  "updated_at"
)
SELECT
  inventory_items."sku",
  'outlet',
  'outlet:' || outlets."id"::text,
  outlets."id",
  0,
  inventory_items."min_stock",
  'safe',
  'Backfill stok awal Outlet 0',
  now(),
  now()
FROM "inventory_items"
CROSS JOIN "outlets"
ON CONFLICT ("item_sku", "location_key") DO NOTHING;
