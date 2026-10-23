-- Menu Event GARAGE (owner, 24 Okt 2026, Menu_Event_GARAGE_1.xlsx): event + 4 paket bundling + menu a la carte
-- terpasang otomatis saat deploy. Idempoten: event per slug, entri hanya bila event belum punya entri,
-- menu utama digital hanya diisi bila belum dipilih owner. Harga = data owner; ubah di modul Event.
-- Rokok satuan tidak dibuat entri (aturan: rokok hanya komponen paket; satuan tetap dijual di POS).
INSERT INTO "events" ("slug", "title", "tagline", "starts_at", "ends_at", "timezone", "venue_name", "address", "maps_url", "contact_whatsapp", "status", "age_gate", "featured_on_home", "outlet_id", "updated_at")
SELECT 'garage-coffee-event-2026-10-24', 'Garage Coffee Event', 'Paket bundling & menu a la carte spesial acara', '2026-10-24 10:00:00+07'::timestamptz, '2026-10-25 03:00:00+07'::timestamptz, 'Asia/Jakarta',
  'Garage Coffee', 'GARAGE Coffee, Tebing Tinggi', '', '', 'published', true, false,
  (SELECT "id" FROM "outlets" WHERE "status" = 'active' ORDER BY "code" LIMIT 1), now()
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "event_menu_entries" ("event_id", "kind", "name", "description", "price", "status", "starts_at", "ends_at", "quota", "sort_order", "groups", "updated_at")
SELECT e."id", 'bundle', b."name", b."description", b."price", 'active', '2026-10-24 10:00:00+07'::timestamptz, '2026-10-25 03:00:00+07'::timestamptz, NULL, b."sort_order", b."groups", now()
FROM "events" e
CROSS JOIN (VALUES
  ('Bundling 45.000 (Nongkrong Santai)', '1 bungkus Black Matcha + 1 minuman + 1 cemilan pilihan.', 45000, 0, '[{"id": "rokok", "name": "Rokok", "quantity": 1, "options": [{"itemId": "rokok-black-matcha", "variantId": "regular"}]}, {"id": "minuman", "name": "Minuman", "quantity": 1, "options": [{"itemId": "bar-sanger", "variantId": "hot"}, {"itemId": "bar-sanger", "variantId": "cold"}, {"itemId": "bar-lychee-tea", "variantId": "cold"}, {"itemId": "bar-lemon-tea", "variantId": "hot"}, {"itemId": "bar-lemon-tea", "variantId": "cold"}]}, {"id": "cemilan", "name": "Cemilan", "quantity": 1, "options": [{"itemId": "cemilan-kentang-ori", "variantId": "regular"}, {"itemId": "cemilan-sosis", "variantId": "regular"}, {"itemId": "cemilan-nugget", "variantId": "regular"}]}]'::jsonb),
  ('Bundling 50.000 (Best Seller)', '1 bungkus Black Matcha + 1 kopi susu/milk series (Hot/Cold) + 1 cemilan pilihan.', 50000, 1, '[{"id": "rokok", "name": "Rokok", "quantity": 1, "options": [{"itemId": "rokok-black-matcha", "variantId": "regular"}]}, {"id": "minuman", "name": "Minuman", "quantity": 1, "options": [{"itemId": "bar-gula-aren", "variantId": "hot"}, {"itemId": "bar-gula-aren", "variantId": "cold"}, {"itemId": "bar-hazelnut-latte", "variantId": "hot"}, {"itemId": "bar-hazelnut-latte", "variantId": "cold"}, {"itemId": "bar-vanilla-latte", "variantId": "hot"}, {"itemId": "bar-vanilla-latte", "variantId": "cold"}, {"itemId": "bar-matcha", "variantId": "hot"}, {"itemId": "bar-matcha", "variantId": "cold"}, {"itemId": "bar-coklat", "variantId": "hot"}, {"itemId": "bar-coklat", "variantId": "cold"}]}, {"id": "cemilan", "name": "Cemilan", "quantity": 1, "options": [{"itemId": "cemilan-kentang-ori", "variantId": "regular"}, {"itemId": "cemilan-sosis", "variantId": "regular"}, {"itemId": "cemilan-nugget", "variantId": "regular"}]}]'::jsonb),
  ('Bundling 55.000 (Mabar/Ramean)', '1 bungkus Black Matcha + 1 minuman pilihan + Mix Plater untuk ramean.', 55000, 2, '[{"id": "rokok", "name": "Rokok", "quantity": 1, "options": [{"itemId": "rokok-black-matcha", "variantId": "regular"}]}, {"id": "minuman", "name": "Minuman", "quantity": 1, "options": [{"itemId": "bar-sanger", "variantId": "hot"}, {"itemId": "bar-sanger", "variantId": "cold"}, {"itemId": "bar-lychee-tea", "variantId": "cold"}, {"itemId": "bar-lemon-tea", "variantId": "hot"}, {"itemId": "bar-lemon-tea", "variantId": "cold"}]}, {"id": "cemilan", "name": "Cemilan", "quantity": 1, "options": [{"itemId": "cemilan-mix-plater", "variantId": "regular"}]}]'::jsonb),
  ('Bundling 60.000 (Premium)', '1 bungkus Black Matcha + Caramel Macchiato (Cold) + 1 cemilan pilihan.', 60000, 3, '[{"id": "rokok", "name": "Rokok", "quantity": 1, "options": [{"itemId": "rokok-black-matcha", "variantId": "regular"}]}, {"id": "minuman", "name": "Minuman", "quantity": 1, "options": [{"itemId": "bar-caramel-macchiato", "variantId": "cold"}]}, {"id": "cemilan", "name": "Cemilan", "quantity": 1, "options": [{"itemId": "cemilan-kentang-balado", "variantId": "regular"}, {"itemId": "cemilan-sosis", "variantId": "regular"}, {"itemId": "cemilan-nugget", "variantId": "regular"}]}]'::jsonb)
) AS b("name", "description", "price", "sort_order", "groups")
WHERE e."slug" = 'garage-coffee-event-2026-10-24'
  AND NOT EXISTS (SELECT 1 FROM "event_menu_entries" x WHERE x."event_id" = e."id");
--> statement-breakpoint
INSERT INTO "event_menu_entries" ("event_id", "kind", "name", "menu_item_id", "variant_id", "price", "status", "starts_at", "ends_at", "quota", "sort_order", "groups", "updated_at")
SELECT e."id", 'item', v."name", v."item_id", v."variant_id", v."price", 'active', '2026-10-24 10:00:00+07'::timestamptz, '2026-10-25 03:00:00+07'::timestamptz, NULL, v."sort_order", '[]'::jsonb, now()
FROM "events" e
CROSS JOIN (VALUES
  ('Americano (Cold)', 'bar-americano', 'cold', 15000, 100),
  ('Americano (Hot)', 'bar-americano', 'hot', 15000, 101),
  ('Americano Berry (Cold)', 'bar-americano-berry', 'cold', 23000, 102),
  ('Americano Cranberry (Cold)', 'bar-americano-cranberry', 'cold', 23000, 103),
  ('Americano Peach', 'bar-americano-peach', 'cold', 23000, 104),
  ('Americano Pongah (Cold)', 'bar-americano-pongah', 'cold', 23000, 105),
  ('Biscoff (Cold)', 'bar-biscoff', 'cold', 31000, 106),
  ('Cappuccino (Cold)', 'bar-cappuccino', 'cold', 25000, 107),
  ('Cappuccino (Hot)', 'bar-cappuccino', 'hot', 23000, 108),
  ('Coffee Latte (Cold)', 'bar-coffee-latte', 'cold', 20000, 109),
  ('Coffee Latte (Hot)', 'bar-coffee-latte', 'hot', 18000, 110),
  ('Gula Aren (Cold)', 'bar-gula-aren', 'cold', 23000, 111),
  ('Gula Aren (Hot)', 'bar-gula-aren', 'hot', 23000, 112),
  ('Hazelnut Latte (Cold)', 'bar-hazelnut-latte', 'cold', 23000, 113),
  ('Hazelnut Latte (Hot)', 'bar-hazelnut-latte', 'hot', 23000, 114),
  ('Mont Blanc (Cold)', 'bar-mont-blanc', 'cold', 23000, 115),
  ('Sanger (Cold)', 'bar-sanger', 'cold', 16000, 116),
  ('Sanger (Hot)', 'bar-sanger', 'hot', 15000, 117),
  ('Spanish Latte (Cold)', 'bar-spanish-latte', 'cold', 26000, 118),
  ('Vanilla Latte (Cold)', 'bar-vanilla-latte', 'cold', 23000, 119),
  ('Vanilla Latte (Hot)', 'bar-vanilla-latte', 'hot', 23000, 120),
  ('Choco Kiss', 'noncoffee-choco-kiss', 'regular', 16000, 121),
  ('Choco Cloud', 'bar-choco-cloud', 'cold', 26000, 122),
  ('Coklat (Cold)', 'bar-coklat', 'cold', 22000, 123),
  ('Coklat (Hot)', 'bar-coklat', 'hot', 20000, 124),
  ('Dark Charm', 'noncoffee-dark-charm', 'regular', 15000, 125),
  ('Ice Tea (Cold)', 'bar-ice-tea', 'cold', 8000, 126),
  ('Ice Tea (Hot)', 'bar-ice-tea', 'hot', 8000, 127),
  ('Lemon Tea (Cold)', 'bar-lemon-tea', 'cold', 15000, 128),
  ('Lemon Tea (Hot)', 'bar-lemon-tea', 'hot', 15000, 129),
  ('Lychee Tea (Cold)', 'bar-lychee-tea', 'cold', 15000, 130),
  ('Matcha (Cold)', 'bar-matcha', 'cold', 22000, 131),
  ('Matcha (Hot)', 'bar-matcha', 'hot', 20000, 132),
  ('Peach Tea (Cold)', 'bar-peach-tea', 'cold', 15000, 133),
  ('Peach Tea (Hot)', 'bar-peach-tea', 'hot', 15000, 134),
  ('Red Velvet (Cold)', 'bar-red-velvet', 'cold', 22000, 135),
  ('Red Velvet (Hot)', 'bar-red-velvet', 'hot', 20000, 136),
  ('Strawberry Milk (Cold)', 'bar-strawberry-milk', 'cold', 20000, 137),
  ('Taro (Cold)', 'bar-taro', 'cold', 22000, 138),
  ('Taro (Hot)', 'bar-taro', 'hot', 20000, 139),
  ('Tea Pahit (Cold)', 'bar-tea-pahit', 'cold', 8000, 140),
  ('Tea Pahit (Hot)', 'bar-tea-pahit', 'hot', 8000, 141),
  ('Ayam Penyet', 'makanan-ayam-penyet', 'regular', 18000, 142),
  ('Indomie Goreng', 'makanan-indomie-goreng', 'regular', 12000, 143),
  ('Indomie Kuah', 'makanan-indomie-kuah', 'regular', 12000, 144),
  ('Nasi', 'makanan-nasi', 'regular', 5000, 145),
  ('Nasi Goreng', 'makanan-nasi-goreng', 'regular', 15000, 146),
  ('Kentang Balado', 'cemilan-kentang-balado', 'regular', 14000, 147),
  ('Kentang Ori', 'cemilan-kentang-ori', 'regular', 12000, 148),
  ('Mix Plater', 'cemilan-mix-plater', 'regular', 18000, 149),
  ('Nugget', 'cemilan-nugget', 'regular', 12000, 150),
  ('Sosis', 'cemilan-sosis', 'regular', 12000, 151),
  ('Strawberry Tea (Cold)', 'bar-strawberry-tea', 'cold', 15000, 152),
  ('Strawberry Tea (Hot)', 'bar-strawberry-tea', 'hot', 8000, 153),
  ('Mineral Cleo', 'minuman-mineral', 'regular', 5000, 154)
) AS v("name", "item_id", "variant_id", "price", "sort_order")
JOIN "menu_items" mi ON mi."id" = v."item_id" AND mi."status" = 'active' AND mi."show_in_digital_menu" = true
JOIN "menu_variants" mv ON mv."item_id" = v."item_id" AND mv."variant_id" = v."variant_id"
WHERE e."slug" = 'garage-coffee-event-2026-10-24'
  AND NOT EXISTS (SELECT 1 FROM "event_menu_entries" x WHERE x."event_id" = e."id" AND x."kind" = 'item');
--> statement-breakpoint
-- Jadikan menu utama digital hanya bila owner belum memilih event lain.
INSERT INTO "app_settings" ("outlet_id", "key", "value_json", "updated_by", "updated_at")
SELECT e."outlet_id", 'digitalMenu.featuredEventId', jsonb_build_object('eventId', e."id"::text), 'migration-0150', now()
FROM "events" e
WHERE e."slug" = 'garage-coffee-event-2026-10-24' AND e."outlet_id" IS NOT NULL
ON CONFLICT ("outlet_id", "key") DO UPDATE SET "value_json" = EXCLUDED."value_json", "updated_by" = EXCLUDED."updated_by", "updated_at" = now()
WHERE "app_settings"."value_json" IS NULL
   OR "app_settings"."value_json" = 'null'::jsonb
   OR coalesce("app_settings"."value_json"->>'eventId', '') = '';
--> statement-breakpoint
INSERT INTO "audit_logs" ("time", "actor", "action", "object", "device", "status", "metadata")
SELECT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'System / Migrasi 0150', 'Seed event menu (Menu_Event_GARAGE_1.xlsx)', e."title", 'Event Menu Manager', 'recorded',
  jsonb_build_object('eventId', e."id", 'entries', (SELECT count(*) FROM "event_menu_entries" x WHERE x."event_id" = e."id"))
FROM "events" e
WHERE e."slug" = 'garage-coffee-event-2026-10-24'
  AND NOT EXISTS (SELECT 1 FROM "audit_logs" a WHERE a."action" = 'Seed event menu (Menu_Event_GARAGE_1.xlsx)');
