-- Rollback migration 0211 (produk mandiri mitra). Produk yang diajukan mitra tetap ada sebagai produk mitra biasa.
ALTER TABLE "partner_product_links" DROP CONSTRAINT IF EXISTS "partner_product_links_submission_status_check";
ALTER TABLE "partner_product_links" DROP COLUMN IF EXISTS "reviewed_at";
ALTER TABLE "partner_product_links" DROP COLUMN IF EXISTS "submitted_at";
ALTER TABLE "partner_product_links" DROP COLUMN IF EXISTS "review_note";
ALTER TABLE "partner_product_links" DROP COLUMN IF EXISTS "submission_note";
ALTER TABLE "partner_product_links" DROP COLUMN IF EXISTS "submission_status";
