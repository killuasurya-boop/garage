WITH unit_costs(name, unit_cost) AS (
  VALUES
    ('Roti burger', 18000),
    ('Tortilla kebab', 20000),
    ('Daging kebab slice', 90000),
    ('Fillet ayam beku', 65000),
    ('Nugget ayam', 45000),
    ('Nugget stick', 35000),
    ('Sosis ayam', 45000),
    ('Keju slice', 18000),
    ('Tepung crispy', 13000),
    ('Kertas burger', 8000),
    ('Kertas kebab', 8000),
    ('Kotak burger', 35000)
)
UPDATE inventory_items
SET unit_cost = unit_costs.unit_cost,
    updated_at = now()
FROM unit_costs
WHERE inventory_items.name = unit_costs.name;

INSERT INTO menu_items (
  id,
  name,
  category,
  section,
  stock,
  status,
  prep,
  tags,
  sort_order,
  updated_at
)
VALUES
  (
    'burger-garage',
    'Burger Garage',
    'Cemilan',
    'Burger',
    'ready',
    'active',
    '12m',
    '["Burger", "Garage"]'::jsonb,
    250,
    now()
  ),
  (
    'kebab-garage',
    'Kebab Garage',
    'Cemilan',
    'Kebab',
    'ready',
    'active',
    '12m',
    '["Kebab", "Garage"]'::jsonb,
    251,
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  category = excluded.category,
  section = excluded.section,
  stock = excluded.stock,
  status = excluded.status,
  prep = excluded.prep,
  tags = excluded.tags,
  sort_order = excluded.sort_order,
  updated_at = now();

UPDATE menu_items
SET status = 'archived',
    updated_at = now()
WHERE (id LIKE 'burger-%' OR id LIKE 'kebab-%')
  AND id NOT IN ('burger-garage', 'kebab-garage');

DELETE FROM menu_recipes
WHERE menu_item_id IN ('burger-garage', 'kebab-garage');

DELETE FROM menu_variants
WHERE item_id IN ('burger-garage', 'kebab-garage');

INSERT INTO menu_variants (
  item_id,
  variant_id,
  label,
  price,
  base_cost,
  sort_order,
  updated_at
)
VALUES
  ('burger-garage', 'telur', 'Telur', 8000, 0, 0, now()),
  ('burger-garage', 'telur-keju', 'Telur Keju', 12000, 0, 1, now()),
  ('burger-garage', 'telur-ayam', 'Telur Ayam', 10000, 0, 2, now()),
  ('burger-garage', 'telur-sosis', 'Telur Sosis', 15000, 0, 3, now()),
  ('burger-garage', 'telur-nugget', 'Telur Nugget', 12000, 0, 4, now()),
  ('burger-garage', 'telur-crispy', 'Telur Crispy', 15000, 0, 5, now()),
  ('burger-garage', 'telur-keju-crispy', 'Telur Keju Crispy', 18000, 0, 6, now()),
  ('burger-garage', 'spesial-komplit', 'Spesial Komplit', 25000, 0, 7, now()),
  ('kebab-garage', 'telur', 'Telur', 10000, 0, 0, now()),
  ('kebab-garage', 'telur-ayam', 'Telur Ayam', 12000, 0, 1, now()),
  ('kebab-garage', 'telur-sosis', 'Telur Sosis', 17000, 0, 2, now()),
  ('kebab-garage', 'telur-nugget', 'Telur Nugget', 17000, 0, 3, now()),
  ('kebab-garage', 'telur-ayam-sosis', 'Telur Ayam Sosis', 20000, 0, 4, now()),
  ('kebab-garage', 'telur-ayam-nugget', 'Telur Ayam Nugget', 20000, 0, 5, now()),
  ('kebab-garage', 'spesial-komplit', 'Spesial Komplit', 28000, 0, 6, now());

WITH recipe_values(menu_item_id, variant_id, inventory_name, qty, unit, waste_pct) AS (
  VALUES
    ('burger-garage', 'all', 'Roti burger', 0.1, 'pack', 0),
    ('burger-garage', 'all', 'Telur ayam', 1, 'pcs', 0),
    ('burger-garage', 'all', 'Kertas burger', 0.01, 'pack', 0),
    ('burger-garage', 'telur-keju', 'Keju slice', 0.05, 'pack', 0),
    ('burger-garage', 'telur-ayam', 'Fillet ayam beku', 0.08, 'pack', 0),
    ('burger-garage', 'telur-sosis', 'Sosis ayam', 0.05, 'pack', 0),
    ('burger-garage', 'telur-nugget', 'Nugget stick', 0.08, 'pack', 0),
    ('burger-garage', 'telur-crispy', 'Fillet ayam beku', 0.08, 'pack', 0),
    ('burger-garage', 'telur-crispy', 'Tepung crispy', 0.03, 'kg', 0),
    ('burger-garage', 'telur-keju-crispy', 'Keju slice', 0.05, 'pack', 0),
    ('burger-garage', 'telur-keju-crispy', 'Fillet ayam beku', 0.08, 'pack', 0),
    ('burger-garage', 'telur-keju-crispy', 'Tepung crispy', 0.03, 'kg', 0),
    ('burger-garage', 'spesial-komplit', 'Keju slice', 0.05, 'pack', 0),
    ('burger-garage', 'spesial-komplit', 'Fillet ayam beku', 0.08, 'pack', 0),
    ('burger-garage', 'spesial-komplit', 'Sosis ayam', 0.05, 'pack', 0),
    ('burger-garage', 'spesial-komplit', 'Nugget stick', 0.08, 'pack', 0),
    ('burger-garage', 'spesial-komplit', 'Tepung crispy', 0.03, 'kg', 0),
    ('burger-garage', 'spesial-komplit', 'Kotak burger', 0.01, 'pack', 0),
    ('kebab-garage', 'all', 'Tortilla kebab', 0.1, 'pack', 0),
    ('kebab-garage', 'all', 'Telur ayam', 1, 'pcs', 0),
    ('kebab-garage', 'all', 'Daging kebab slice', 0.05, 'pack', 0),
    ('kebab-garage', 'all', 'Kertas kebab', 0.01, 'pack', 0),
    ('kebab-garage', 'telur-ayam', 'Fillet ayam beku', 0.06, 'pack', 0),
    ('kebab-garage', 'telur-sosis', 'Sosis ayam', 0.05, 'pack', 0),
    ('kebab-garage', 'telur-nugget', 'Nugget ayam', 0.08, 'pack', 0),
    ('kebab-garage', 'telur-ayam-sosis', 'Fillet ayam beku', 0.06, 'pack', 0),
    ('kebab-garage', 'telur-ayam-sosis', 'Sosis ayam', 0.05, 'pack', 0),
    ('kebab-garage', 'telur-ayam-nugget', 'Fillet ayam beku', 0.06, 'pack', 0),
    ('kebab-garage', 'telur-ayam-nugget', 'Nugget ayam', 0.08, 'pack', 0),
    ('kebab-garage', 'spesial-komplit', 'Fillet ayam beku', 0.06, 'pack', 0),
    ('kebab-garage', 'spesial-komplit', 'Sosis ayam', 0.05, 'pack', 0),
    ('kebab-garage', 'spesial-komplit', 'Nugget ayam', 0.08, 'pack', 0)
)
INSERT INTO menu_recipes (
  menu_item_id,
  variant_id,
  inventory_sku,
  qty,
  unit,
  waste_pct,
  status,
  updated_at
)
SELECT
  recipe_values.menu_item_id,
  recipe_values.variant_id,
  inventory_items.sku,
  recipe_values.qty,
  recipe_values.unit,
  recipe_values.waste_pct,
  'active',
  now()
FROM recipe_values
INNER JOIN inventory_items
  ON inventory_items.name = recipe_values.inventory_name;

WITH variant_costs AS (
  SELECT
    menu_variants.item_id,
    menu_variants.variant_id,
    ROUND(
      SUM(inventory_items.unit_cost * menu_recipes.qty * (1 + menu_recipes.waste_pct / 100.0))
    )::int AS recipe_cost
  FROM menu_variants
  INNER JOIN menu_recipes
    ON menu_recipes.menu_item_id = menu_variants.item_id
   AND menu_recipes.status = 'active'
   AND (menu_recipes.variant_id = menu_variants.variant_id OR menu_recipes.variant_id = 'all')
  INNER JOIN inventory_items
    ON inventory_items.sku = menu_recipes.inventory_sku
  WHERE menu_variants.item_id IN ('burger-garage', 'kebab-garage')
  GROUP BY menu_variants.item_id, menu_variants.variant_id
)
UPDATE menu_variants
SET base_cost = COALESCE(variant_costs.recipe_cost, 0),
    updated_at = now()
FROM variant_costs
WHERE menu_variants.item_id = variant_costs.item_id
  AND menu_variants.variant_id = variant_costs.variant_id;
