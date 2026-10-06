ALTER TABLE "wms_receiving" ADD COLUMN "payment_method" text DEFAULT 'Cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "received_date" date;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD CONSTRAINT "wms_receiving_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;