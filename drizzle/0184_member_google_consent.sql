ALTER TABLE "member_accounts" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "member_accounts" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_accounts" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "member_accounts" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_accounts" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "member_accounts_google_sub_idx" ON "member_accounts" USING btree ("google_sub");