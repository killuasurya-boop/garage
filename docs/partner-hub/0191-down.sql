-- Rollback migrasi 0191 (pengajuan harga mitra). Aman: tabel baru tanpa referensi masuk.
-- Harga yang sudah disetujui tetap ada di partner_price_history & menu_variants (tidak ikut dihapus).
DROP INDEX IF EXISTS "partner_price_proposals_pending_idx";
DROP INDEX IF EXISTS "partner_price_proposals_partner_idx";
DROP INDEX IF EXISTS "partner_price_proposals_no_idx";
DROP TABLE IF EXISTS "partner_price_proposals";
