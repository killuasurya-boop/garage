CREATE TABLE "wms_opname_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_key" text NOT NULL,
	"rule" text NOT NULL,
	"product_id" uuid,
	"warehouse_id" uuid,
	"finding" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"limitation" text DEFAULT '' NOT NULL,
	"impact_value" integer DEFAULT 0 NOT NULL,
	"recommendation" text NOT NULL,
	"owner_role" text DEFAULT 'Manajer' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_opname_action_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
CREATE TABLE "wms_opname_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"opname_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"kind" text DEFAULT 'count' NOT NULL,
	"physical_qty" numeric(14, 4) NOT NULL,
	"system_qty" numeric(14, 4) NOT NULL,
	"breakdown" jsonb,
	"client_request_id" text,
	"counted_by" text,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "first_physical_qty" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "first_system_qty" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "count_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "needs_recount" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "recount_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "classification" text;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "posted_variance" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "posted_value" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "posted_rate" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD COLUMN "posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "kind" text DEFAULT 'incidental' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "scope" text DEFAULT 'partial' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "business_date" date;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "recount_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_opname_action" ADD CONSTRAINT "wms_opname_action_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_opname_action" ADD CONSTRAINT "wms_opname_action_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_opname_action" ADD CONSTRAINT "wms_opname_action_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_opname_count" ADD CONSTRAINT "wms_opname_count_line_id_wms_opname_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."wms_opname_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_opname_count" ADD CONSTRAINT "wms_opname_count_opname_id_wms_stock_opname_id_fk" FOREIGN KEY ("opname_id") REFERENCES "public"."wms_stock_opname"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_opname_count" ADD CONSTRAINT "wms_opname_count_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_opname_action_status_idx" ON "wms_opname_action" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "wms_opname_count_line_idx" ON "wms_opname_count" USING btree ("line_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_opname_count_client_req_idx" ON "wms_opname_count" USING btree ("line_id","client_request_id");