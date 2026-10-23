-- Menu Event GARAGE (owner, Okt 2026, Menu_Event_GARAGE_1.xlsx). Insert-only: harga/varian yang
-- sudah ada (termasuk hasil edit owner) tidak ditimpa, resep tidak dihapus.
-- 1) Varian Hot untuk minuman yang dipakai paket bundling / menu a la carte.
INSERT INTO "menu_variants" ("item_id", "variant_id", "label", "price", "base_cost", "sort_order", "updated_at")
SELECT v."item_id", 'hot', 'Hot', v."price", 0, 1, now()
FROM (VALUES
  ('bar-gula-aren', 23000),
  ('bar-sanger', 15000),
  ('bar-hazelnut-latte', 23000),
  ('bar-vanilla-latte', 23000),
  ('bar-matcha', 20000),
  ('bar-coklat', 20000),
  ('bar-lemon-tea', 15000),
  ('bar-peach-tea', 15000),
  ('bar-ice-tea', 8000)
) AS v("item_id", "price")
WHERE EXISTS (SELECT 1 FROM "menu_items" mi WHERE mi."id" = v."item_id")
ON CONFLICT ("item_id", "variant_id") DO NOTHING;
--> statement-breakpoint
-- 2) Resep bersama ('all') dari minuman yang kini punya Hot dipindah ke 'cold' (UPDATE, bukan DELETE),
--    hanya bila belum ada resep per varian — supaya Hot tidak ikut memotong es batu.
UPDATE "menu_recipes" r SET "variant_id" = 'cold', "updated_at" = now()
WHERE r."variant_id" = 'all'
  AND r."menu_item_id" IN ('bar-gula-aren', 'bar-sanger', 'bar-hazelnut-latte', 'bar-vanilla-latte', 'bar-matcha', 'bar-coklat', 'bar-lemon-tea', 'bar-peach-tea', 'bar-ice-tea')
  AND EXISTS (SELECT 1 FROM "menu_variants" mv WHERE mv."item_id" = r."menu_item_id" AND mv."variant_id" = 'hot')
  AND NOT EXISTS (SELECT 1 FROM "menu_recipes" x WHERE x."menu_item_id" = r."menu_item_id" AND x."variant_id" IN ('cold', 'hot'));
--> statement-breakpoint
-- 3) Resep Hot = resep Cold tanpa es batu (BAR-032), pola HOT_PACK (cup + sedotan). Dosis Hot perlu dicek owner.
INSERT INTO "menu_recipes" ("menu_item_id", "variant_id", "inventory_sku", "qty", "unit", "waste_pct", "status", "updated_at")
SELECT r."menu_item_id", 'hot', r."inventory_sku", r."qty", r."unit", r."waste_pct", r."status", now()
FROM "menu_recipes" r
WHERE r."variant_id" = 'cold'
  AND r."status" = 'active'
  AND r."inventory_sku" IS DISTINCT FROM 'BAR-032'
  AND r."menu_item_id" IN ('bar-gula-aren', 'bar-sanger', 'bar-hazelnut-latte', 'bar-vanilla-latte', 'bar-matcha', 'bar-coklat', 'bar-lemon-tea', 'bar-peach-tea', 'bar-ice-tea')
  AND NOT EXISTS (SELECT 1 FROM "menu_recipes" x WHERE x."menu_item_id" = r."menu_item_id" AND x."variant_id" = 'hot')
ON CONFLICT ("menu_item_id", "variant_id", "inventory_sku") DO NOTHING;
--> statement-breakpoint
-- 4) HPP varian Hot baru = Σ(qty × HPP bahan × (1 + waste%)), sama dengan syncRecipeBaseCosts.
UPDATE "menu_variants" mv SET "base_cost" = c."cost", "updated_at" = now()
FROM (
  SELECT r."menu_item_id", round(sum(r."qty" * coalesce(i."unit_cost", 0) * (1 + greatest(0, r."waste_pct") / 100)))::integer AS "cost"
  FROM "menu_recipes" r
  LEFT JOIN "inventory_items" i ON i."sku" = r."inventory_sku"
  WHERE r."variant_id" = 'hot' AND r."status" = 'active'
  GROUP BY r."menu_item_id"
) c
WHERE mv."item_id" = c."menu_item_id" AND mv."variant_id" = 'hot' AND mv."base_cost" = 0
  AND mv."item_id" IN ('bar-gula-aren', 'bar-sanger', 'bar-hazelnut-latte', 'bar-vanilla-latte', 'bar-matcha', 'bar-coklat', 'bar-lemon-tea', 'bar-peach-tea', 'bar-ice-tea');
--> statement-breakpoint
-- 5) Produk baru dari daftar a la carte event. Minuman belum ada resep → HPP 0 sampai owner mengisi.
INSERT INTO "menu_items" ("id", "name", "category", "section", "stock", "status", "prep", "tags", "show_in_digital_menu", "sort_order", "product_type", "updated_at")
VALUES
  ('bar-red-velvet', 'Red Velvet', 'Non-Coffee', 'Milk Series', 'ready', 'active', '4m', '["Non-Coffee"]'::jsonb, true, 906, 'menu', now()),
  ('bar-taro', 'Taro', 'Non-Coffee', 'Milk Series', 'ready', 'active', '4m', '["Non-Coffee"]'::jsonb, true, 907, 'menu', now()),
  ('bar-tea-pahit', 'Tea Pahit', 'Non-Coffee', 'Tea Series', 'ready', 'active', '4m', '["Non-Coffee"]'::jsonb, true, 908, 'menu', now()),
  ('bar-strawberry-tea', 'Strawberry Tea', 'Non-Coffee', 'Tea Series', 'ready', 'active', '4m', '["Non-Coffee"]'::jsonb, true, 909, 'menu', now()),
  ('rokok-la-manggo', 'LA Manggo', 'Rokok', 'Rokok', 'ready', 'active', '0m', '["Rokok"]'::jsonb, false, 910, 'retail', now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "menu_variants" ("item_id", "variant_id", "label", "price", "base_cost", "sort_order", "updated_at")
VALUES
  ('bar-red-velvet', 'cold', 'Cold', 22000, 0, 0, now()),
  ('bar-red-velvet', 'hot', 'Hot', 20000, 0, 1, now()),
  ('bar-taro', 'cold', 'Cold', 22000, 0, 0, now()),
  ('bar-taro', 'hot', 'Hot', 20000, 0, 1, now()),
  ('bar-tea-pahit', 'cold', 'Cold', 8000, 0, 0, now()),
  ('bar-tea-pahit', 'hot', 'Hot', 8000, 0, 1, now()),
  ('bar-strawberry-tea', 'cold', 'Cold', 15000, 0, 0, now()),
  ('bar-strawberry-tea', 'hot', 'Hot', 8000, 0, 1, now()),
  ('rokok-la-manggo', 'regular', 'Regular', 37000, 0, 0, now())
ON CONFLICT ("item_id", "variant_id") DO NOTHING;
--> statement-breakpoint
UPDATE "menu_items" mi SET "category_id" = pc."id"
FROM "product_categories" pc
WHERE mi."category_id" IS NULL AND lower(pc."name") = lower(mi."category")
  AND mi."id" IN ('bar-red-velvet', 'bar-taro', 'bar-tea-pahit', 'bar-strawberry-tea', 'rokok-la-manggo');
