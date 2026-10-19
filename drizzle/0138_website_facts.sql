-- Website garagecoffee.id (owner, Okt 2026):
-- 1) Jam buka resmi 15.00–23.00 setiap hari (field lain site.businessInfo tetap).
UPDATE "app_settings"
SET "value_json" = "value_json" || '{"hoursOpen":"15:00","hoursClose":"23:00"}'::jsonb, "updated_at" = now()
WHERE "key" = 'site.businessInfo' AND "outlet_id" IS NULL;
--> statement-breakpoint
INSERT INTO "app_settings" ("outlet_id", "key", "value_json")
SELECT NULL, 'site.businessInfo', '{"hoursOpen":"15:00","hoursClose":"23:00"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'site.businessInfo' AND "outlet_id" IS NULL);
--> statement-breakpoint
-- 2) Brand kini "Garage Coffee" (tanpa "& Motor") — bersihkan setting teks tersimpan (tagline struk, footer, dll).
UPDATE "app_settings"
SET "value_json" = to_jsonb(
      replace(replace(replace("value_json" #>> '{}', 'GARAGE Coffee & Motor', 'GARAGE Coffee'), 'Garage Coffee & Motor', 'Garage Coffee'), 'Coffee & Motor', 'Coffee · Tebing Tinggi')
    ),
    "updated_at" = now()
WHERE jsonb_typeof("value_json") = 'string' AND ("value_json" #>> '{}') ILIKE '%& Motor%';
--> statement-breakpoint
-- 3) Grand Opening tampil di website (banner beranda + /grand-opening).
UPDATE "events"
SET "status" = 'published', "featured_on_home" = true, "updated_at" = now()
WHERE "slug" = 'grand-opening' AND "status" = 'draft';
