ALTER TABLE "member_accounts" ADD COLUMN "pin_set_at" timestamp with time zone;--> statement-breakpoint
-- Akun yang sudah ada memilih PIN sendiri saat daftar (kasir/website), kecuali yang dibuat lewat Google.
UPDATE "member_accounts" SET "pin_set_at" = "created_at" WHERE "google_sub" IS NULL;
