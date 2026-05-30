ALTER TABLE "inventory_items" ADD COLUMN "usage_area" text DEFAULT 'dapur' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transfer_requests" ADD COLUMN "station" text DEFAULT 'dapur' NOT NULL;--> statement-breakpoint
UPDATE "inventory_items"
SET "usage_area" = CASE
  WHEN lower("category" || ' ' || "name") LIKE '%operasional%'
    OR lower("category" || ' ' || "name") LIKE '%cleaning%'
    OR lower("category" || ' ' || "name") LIKE '%packaging%'
    OR lower("category" || ' ' || "name") LIKE '%consumable%'
    THEN 'general'
  WHEN lower("category" || ' ' || "name") LIKE '%minuman%'
    OR lower("category" || ' ' || "name") LIKE '%coffee%'
    OR lower("category" || ' ' || "name") LIKE '%kopi%'
    OR lower("category" || ' ' || "name") LIKE '%espresso%'
    OR lower("category" || ' ' || "name") LIKE '%tea%'
    OR lower("category" || ' ' || "name") LIKE '%syrup%'
    OR lower("category" || ' ' || "name") LIKE '%flavor%'
    OR lower("category" || ' ' || "name") LIKE '%susu%'
    OR lower("category" || ' ' || "name") LIKE '%dairy%'
    OR lower("category" || ' ' || "name") LIKE '%matcha%'
    OR lower("category" || ' ' || "name") LIKE '%lemonade%'
    OR lower("category" || ' ' || "name") LIKE '%avocado%'
    OR lower("category" || ' ' || "name") LIKE '%mango%'
    OR lower("category" || ' ' || "name") LIKE '%taro%'
    OR lower("category" || ' ' || "name") LIKE '%red velvet%'
    OR lower("category" || ' ' || "name") LIKE '%cappucino%'
    THEN 'bar'
  ELSE 'dapur'
END;--> statement-breakpoint
CREATE INDEX "inventory_items_usage_area_idx" ON "inventory_items" USING btree ("usage_area");--> statement-breakpoint
CREATE INDEX "inventory_transfer_requests_station_idx" ON "inventory_transfer_requests" USING btree ("station");
