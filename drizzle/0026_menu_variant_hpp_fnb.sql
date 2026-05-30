-- Final MVP: F&B product setup needs selling price and base cost/HPP per variant.

ALTER TABLE "menu_variants"
  ADD COLUMN IF NOT EXISTS "base_cost" integer NOT NULL DEFAULT 0;
