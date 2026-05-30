ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_expires_at_idx" ON "customers" USING btree ("expires_at");
