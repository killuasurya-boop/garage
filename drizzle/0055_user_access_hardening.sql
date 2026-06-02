ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "password_reset_required" boolean DEFAULT false NOT NULL;
