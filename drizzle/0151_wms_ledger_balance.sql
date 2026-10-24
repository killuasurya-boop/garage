CREATE TABLE "wms_stock_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"product_id" uuid,
	"ref_doc" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ADD COLUMN "balance_after" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ADD COLUMN "valuation_rate" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_stock_issue" ADD CONSTRAINT "wms_stock_issue_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_issue" ADD CONSTRAINT "wms_stock_issue_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_stock_issue_open_idx" ON "wms_stock_issue" USING btree ("resolved_at","created_at");--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ADD CONSTRAINT "wms_stock_movement_batch_id_wms_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."wms_batch"("id") ON DELETE set null ON UPDATE no action;