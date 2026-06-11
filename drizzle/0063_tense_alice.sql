ALTER TABLE "menu_items" ADD COLUMN "promo_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "promo_price" integer;