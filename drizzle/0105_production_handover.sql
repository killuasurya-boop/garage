ALTER TABLE "kitchen_tickets" ADD COLUMN "handover_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "handover_by_name" text;--> statement-breakpoint
-- Tiket READY lama (sebelum alur helper) dianggap sudah diserahkan supaya waiter tetap bisa mengantarnya.
UPDATE "kitchen_tickets" SET "handover_at" = COALESCE("claimed_at", "ready_at", now()), "handover_by_name" = 'Migrasi' WHERE "status" = 'ready' AND "handover_at" IS NULL;
