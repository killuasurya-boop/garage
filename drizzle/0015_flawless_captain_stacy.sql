ALTER TABLE "kitchen_tickets" ADD COLUMN "item_notes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "internal_notes" text;--> statement-breakpoint
CREATE INDEX "kitchen_tickets_priority_idx" ON "kitchen_tickets" USING btree ("priority");