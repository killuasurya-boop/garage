CREATE TABLE "wms_product_uom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"uom" text NOT NULL,
	"factor" numeric(14, 4) NOT NULL,
	"is_purchase" boolean DEFAULT false NOT NULL,
	"is_count" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD COLUMN "uom" text;--> statement-breakpoint
ALTER TABLE "wms_purchase_order_item" ADD COLUMN "uom_factor" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_product_uom" ADD CONSTRAINT "wms_product_uom_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wms_product_uom_product_uom_idx" ON "wms_product_uom" USING btree ("product_id",lower("uom"));--> statement-breakpoint
-- Owner Okt 2026: Biang Teh Prendjak dibeli jadi, 1 kotak = 1000 ml (dulu "seduhan 1 ml").
-- HPP per ml tetap (harga per kotak = HPP/ml × 1000); hanya bila masih data awal.
UPDATE "inventory_items"
SET "package_qty" = 1000, "package_size" = 'kotak 1000 ml',
    "purchase_price" = round(("unit_cost" * 1000)::numeric, 4), "updated_at" = now()
WHERE "sku" = 'BAR-035' AND "package_qty" <= 1;
--> statement-breakpoint
-- Kemasan dari katalog OS: isi kemasan > 1 → 1 kemasan default beli & hitung.
INSERT INTO "wms_product_uom" ("product_id", "uom", "factor", "is_purchase", "is_count")
SELECT p."id",
       CASE WHEN lower(split_part(trim(i."package_size"), ' ', 1)) ~ '^[a-z]+$'
                 AND lower(split_part(trim(i."package_size"), ' ', 1)) <> lower(p."unit")
            THEN lower(split_part(trim(i."package_size"), ' ', 1)) ELSE 'kemasan' END,
       i."package_qty", true, true
FROM "wms_product" p
JOIN "inventory_items" i ON i."sku" = p."sku"
WHERE i."package_qty" > 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Fresh Milk: dus (24 × 946 ml) untuk beli, botol 946 ml untuk hitung/minta.
UPDATE "wms_product_uom" u SET "is_count" = false
FROM "wms_product" p WHERE p."id" = u."product_id" AND p."sku" = 'BAR-018' AND u."factor" > 946;
--> statement-breakpoint
INSERT INTO "wms_product_uom" ("product_id", "uom", "factor", "is_purchase", "is_count")
SELECT p."id", 'botol', 946, false, true FROM "wms_product" p WHERE p."sku" = 'BAR-018' AND lower(p."unit") = 'ml'
ON CONFLICT DO NOTHING;
