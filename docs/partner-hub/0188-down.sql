-- Rollback DARURAT migrasi 0188_partner_hub. Hanya dengan ACC Owner + backup terverifikasi.
-- Rollback normal = matikan setelan "Partner Hub aktif" (data tetap tersimpan, POS kembali seperti semula).
BEGIN;
DROP TRIGGER IF EXISTS "partner_events_immutable_trg" ON "partner_events";
DROP FUNCTION IF EXISTS "partner_events_immutable"();
ALTER TABLE "kitchen_tickets" DROP COLUMN IF EXISTS "partner_id";
ALTER TABLE "production_ticket_items" DROP COLUMN IF EXISTS "partner_id";
DROP TABLE IF EXISTS "partner_reports", "partner_payouts", "partner_settlement_lines", "partner_settlements",
  "partner_adjustments", "partner_events", "partner_order_lines", "partner_price_history",
  "partner_product_links", "partner_accounts", "partner_bank_accounts", "partners";
-- Hapus catatan migrasi (runner menandai per hash file): ganti <HASH> dengan `sha256sum drizzle/0188_partner_hub.sql`.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "hash" = '<HASH>';
COMMIT;
