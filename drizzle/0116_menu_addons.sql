ALTER TABLE "menu_items" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;