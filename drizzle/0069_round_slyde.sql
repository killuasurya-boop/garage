ALTER TABLE "candidates" ALTER COLUMN "status" SET DEFAULT 'Baru';--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_type" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "skill_level" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "ktp_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "certificate_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "instagram_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "tiktok_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "referral_source" text;
