ALTER TABLE "kitchen_tickets" ADD COLUMN "fifo_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "fifo_override_by" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "fifo_override_by_name" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "fifo_override_reason" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_fifo_override_by_user_id_fk" FOREIGN KEY ("fifo_override_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;