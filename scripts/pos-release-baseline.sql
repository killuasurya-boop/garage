-- Read-only deployment invariant; deliberately excludes HPP, stock and timestamps.
-- Includes category definitions in addition to the public POS baseline endpoint.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
  'items', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM (
    SELECT id, sku, name, category, category_id, section, product_type, status,
           promo_active, promo_price FROM menu_items
  ) p), '[]'::jsonb),
  'variants', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.item_id, v.variant_id) FROM (
    SELECT id, item_id, variant_id, label, price, sku, barcode, sell_unit, unit_contents
    FROM menu_variants
  ) v), '[]'::jsonb),
  'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM (
    SELECT id, name, description, kind, default_product_type, station, pos_group,
           sku_prefix, icon, sort_order, status, archived_at FROM product_categories
  ) c), '[]'::jsonb)
)::text;
COMMIT;
