ALTER TABLE "kitchen_tickets" ADD COLUMN "target_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "target_group" text DEFAULT 'food' NOT NULL;--> statement-breakpoint
UPDATE "kitchen_tickets"
SET
  "target_minutes" = CASE WHEN "station" = 'Bar' THEN 5 ELSE 15 END,
  "target_group" = CASE WHEN "station" = 'Bar' THEN 'drink' ELSE 'food' END;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "accepted_by_name" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "ready_by_name" text;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "delivered_by_name" text;--> statement-breakpoint
CREATE INDEX "kitchen_tickets_ready_at_idx" ON "kitchen_tickets" USING btree ("ready_at");
