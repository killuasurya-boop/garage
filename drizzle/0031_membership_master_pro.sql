ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "member_code" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "card_tier" text DEFAULT 'Silver' NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "membership_since" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ultra_candidate" boolean DEFAULT false NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ultra_approved_at" timestamp with time zone;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ultra_approved_by" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_ultra_approved_by_user_id_fk" FOREIGN KEY ("ultra_approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_member_code_idx" ON "customers" USING btree ("member_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_card_tier_idx" ON "customers" USING btree ("card_tier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_ultra_candidate_idx" ON "customers" USING btree ("ultra_candidate");
--> statement-breakpoint
UPDATE "customers"
SET "card_tier" = CASE
  WHEN upper(coalesce("tier", '')) = 'ULTRA' OR upper(coalesce("flag", '')) LIKE '%ULTRA%' THEN 'Ultra'
  WHEN upper(coalesce("tier", '')) = 'PLATINUM' THEN 'Platinum'
  WHEN upper(coalesce("tier", '')) = 'GOLD' THEN 'Gold'
  ELSE 'Silver'
END
WHERE "card_tier" IS NULL OR "card_tier" = 'Silver';
