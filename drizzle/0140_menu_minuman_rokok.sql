-- Produk baru (owner, 19 Okt 2026). Insert-only: produk/harga yang sudah diedit owner tidak ditimpa.
-- Minuman Botol & Rokok = produk jadi, diserahkan langsung kasir (tanpa tiket Bar/Dapur).
-- Rokok tidak tampil di menu digital pelanggan.
INSERT INTO "menu_items" ("id", "name", "category", "section", "stock", "status", "prep", "tags", "show_in_digital_menu", "sort_order", "updated_at")
VALUES
  ('noncoffee-choco-kiss', 'Choco Kiss', 'Non-Coffee', 'Non-Coffee', 'ready', 'active', '4m', '["Non-Coffee"]'::jsonb, true, 900, now()),
  ('noncoffee-dark-charm', 'Dark Charm', 'Non-Coffee', 'Non-Coffee', 'ready', 'active', '4m', '["Non-Coffee"]'::jsonb, true, 901, now()),
  ('minuman-mineral', 'Mineral', 'Minuman Botol', 'Minuman Botol', 'ready', 'active', '0m', '["Minuman"]'::jsonb, true, 902, now()),
  ('rokok-apel-djarum', 'Apel Djarum', 'Rokok', 'Rokok', 'ready', 'active', '0m', '["Rokok"]'::jsonb, false, 903, now()),
  ('rokok-black-matcha', 'Black Matcha', 'Rokok', 'Rokok', 'ready', 'active', '0m', '["Rokok"]'::jsonb, false, 904, now()),
  ('rokok-la-purple', 'LA Purple', 'Rokok', 'Rokok', 'ready', 'active', '0m', '["Rokok"]'::jsonb, false, 905, now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "menu_variants" ("item_id", "variant_id", "label", "price", "base_cost", "sort_order", "updated_at")
VALUES
  ('noncoffee-choco-kiss', 'regular', 'Regular', 16000, 0, 0, now()),
  ('noncoffee-dark-charm', 'regular', 'Regular', 15000, 0, 0, now()),
  ('minuman-mineral', 'regular', 'Regular', 5000, 0, 0, now()),
  ('rokok-apel-djarum', 'regular', 'Regular', 18000, 0, 0, now()),
  ('rokok-black-matcha', 'regular', 'Regular', 18000, 0, 0, now()),
  ('rokok-la-purple', 'regular', 'Regular', 37000, 0, 0, now())
ON CONFLICT ("item_id", "variant_id") DO NOTHING;
