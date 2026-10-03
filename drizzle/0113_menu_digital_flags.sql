ALTER TABLE "menu_items" ADD COLUMN "show_in_digital_menu" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;