ALTER TABLE "wms_opname_line" ADD COLUMN "counted_by" text;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD COLUMN "reject_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD CONSTRAINT "wms_opname_line_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD CONSTRAINT "wms_stock_opname_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD CONSTRAINT "wms_stock_opname_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;