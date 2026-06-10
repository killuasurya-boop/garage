ALTER TABLE "kitchen_tickets" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "claimed_by_name" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_claimed_by_user_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;