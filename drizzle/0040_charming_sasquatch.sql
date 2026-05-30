ALTER TABLE "staff_profiles" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "staff_profiles_status_idx" ON "staff_profiles" USING btree ("status");