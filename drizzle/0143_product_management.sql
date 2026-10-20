CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'fnb' NOT NULL,
	"default_product_type" text DEFAULT 'menu' NOT NULL,
	"station" text DEFAULT 'dapur' NOT NULL,
	"pos_group" text DEFAULT 'Dapur' NOT NULL,
	"sku_prefix" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "product_type" text DEFAULT 'menu' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "menu_variants" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "menu_variants" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "menu_variants" ADD COLUMN "sell_unit" text;--> statement-breakpoint
ALTER TABLE "menu_variants" ADD COLUMN "unit_contents" real;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_name_idx" ON "product_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "product_categories_status_idx" ON "product_categories" USING btree ("status");--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_barcode_idx" ON "menu_items" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "menu_items_category_id_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_variants_sku_idx" ON "menu_variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_variants_barcode_idx" ON "menu_variants" USING btree ("barcode");
--> statement-breakpoint
-- Kategori awal = kategori yang SUDAH dipakai Garage OS (audit Okt 2026), tanpa
-- menambah kategori tebakan. Owner menambah kategori baru lewat Manajemen Kategori.
INSERT INTO "product_categories" ("name", "description", "kind", "default_product_type", "station", "pos_group", "sku_prefix", "sort_order")
VALUES
  ('Makanan', 'Menu makanan berat dapur', 'fnb', 'menu', 'dapur', 'Dapur', 'FOOD', 10),
  ('Cemilan', 'Snack & cemilan dapur', 'fnb', 'menu', 'dapur', 'Dapur', 'SNCK', 20),
  ('Coffee', 'Minuman berbasis kopi (bar)', 'fnb', 'menu', 'bar', 'Bar', 'COF', 30),
  ('Non-Coffee', 'Minuman non-kopi (bar)', 'fnb', 'menu', 'bar', 'Bar', 'NCOF', 40),
  ('Minuman Botol', 'Air mineral & minuman kemasan — diserahkan langsung kasir', 'retail', 'retail', 'none', 'Lainnya', 'BTL', 50),
  ('Rokok', 'Rokok — diserahkan langsung kasir, tidak tampil di menu digital', 'retail', 'retail', 'none', 'Lainnya', 'RKK', 60)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Kategori lain yang ternyata sudah dipakai produk (data lama) ikut didaftarkan.
INSERT INTO "product_categories" ("name", "kind", "default_product_type", "station", "pos_group", "sort_order")
SELECT DISTINCT mi."category", 'fnb', 'menu', 'dapur', 'Dapur', 900
FROM "menu_items" mi
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" pc WHERE lower(pc."name") = lower(mi."category"))
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "menu_items" mi SET "category_id" = pc."id"
FROM "product_categories" pc
WHERE mi."category_id" IS NULL AND lower(pc."name") = lower(mi."category");
--> statement-breakpoint
UPDATE "menu_items" SET "product_type" = 'retail'
WHERE "category" IN ('Minuman Botol', 'Rokok') AND "product_type" = 'menu';
