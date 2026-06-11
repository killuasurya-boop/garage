ALTER TABLE "menu_items" ADD COLUMN "sku" text;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_sku_idx" ON "menu_items" USING btree ("sku");