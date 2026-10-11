ALTER TABLE "orders" ADD COLUMN "delivery_proof_url" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "courier_availability" text DEFAULT 'offline' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "courier_availability_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "held_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "held_token_hash" text;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "join_code" text;