CREATE TABLE "production_batch_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"ticket_item_id" uuid NOT NULL,
	"ticket_id" uuid,
	"order_id" uuid,
	"qty" integer NOT NULL,
	"customer_name" text,
	"table_label" text NOT NULL,
	"order_no" text,
	"note" text,
	"allocated_at" timestamp with time zone,
	"allocated_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_no" text NOT NULL,
	"outlet_id" uuid,
	"station" text NOT NULL,
	"menu_item_id" text,
	"variant_id" text,
	"item_label" text NOT NULL,
	"note" text,
	"total_qty" integer NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"started_by_name" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by_name" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batches_batch_no_unique" UNIQUE("batch_no")
);
--> statement-breakpoint
CREATE TABLE "production_ticket_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"order_id" uuid,
	"order_item_id" uuid,
	"menu_item_id" text,
	"variant_id" text,
	"item_name" text NOT NULL,
	"variant_label" text NOT NULL,
	"qty" integer NOT NULL,
	"note" text,
	"station" text NOT NULL,
	"batch_eligible" boolean DEFAULT true NOT NULL,
	"batch_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"customer_name" text,
	"table_label" text NOT NULL,
	"order_no" text,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "order_no" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "issue_reason" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "issue_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "station" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "batch_eligible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "workstation" text;--> statement-breakpoint
ALTER TABLE "production_batch_allocations" ADD CONSTRAINT "production_batch_allocations_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_allocations" ADD CONSTRAINT "production_batch_allocations_ticket_item_id_production_ticket_items_id_fk" FOREIGN KEY ("ticket_item_id") REFERENCES "public"."production_ticket_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_allocations" ADD CONSTRAINT "production_batch_allocations_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_allocations" ADD CONSTRAINT "production_batch_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_ticket_items" ADD CONSTRAINT "production_ticket_items_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_ticket_items" ADD CONSTRAINT "production_ticket_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_ticket_items" ADD CONSTRAINT "production_ticket_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_ticket_items" ADD CONSTRAINT "production_ticket_items_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_batch_allocations_batch_id_idx" ON "production_batch_allocations" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_batch_allocations_ticket_item_idx" ON "production_batch_allocations" USING btree ("batch_id","ticket_item_id");--> statement-breakpoint
CREATE INDEX "production_batches_station_status_idx" ON "production_batches" USING btree ("station","status");--> statement-breakpoint
CREATE INDEX "production_batches_created_at_idx" ON "production_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "production_ticket_items_ticket_id_idx" ON "production_ticket_items" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "production_ticket_items_batch_id_idx" ON "production_ticket_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "production_ticket_items_station_status_idx" ON "production_ticket_items" USING btree ("station","status");--> statement-breakpoint
-- Backfill: kasir lama selama ini memegang dapur+bar. Pertahankan perilaku itu
-- ("all") sampai Owner/Manajer menugaskan workstation per akun.
UPDATE "staff_profiles" SET "workstation" = 'all' WHERE "role" = 'Kasir' AND "workstation" IS NULL;--> statement-breakpoint
-- Backfill snapshot identitas tiket lama dari order-nya.
UPDATE "kitchen_tickets" AS kt SET "customer_name" = o."customer_name", "order_no" = o."order_no" FROM "orders" AS o WHERE kt."order_id" = o."id" AND kt."order_no" IS NULL;