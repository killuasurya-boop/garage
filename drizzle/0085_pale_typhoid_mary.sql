ALTER TABLE "wms_bom_item" ADD COLUMN "line_type" text DEFAULT 'ingredient' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_bom_item" ADD COLUMN "waste_pct" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_bom_item" ADD COLUMN "shrinkage_pct" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_bom_item" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_bom_item" ADD COLUMN "sub_recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "recipe_sku" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "recipe_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "sub_category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "production_area" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "yield_unit" text DEFAULT 'porsi' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "recipe_status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_recipe" ADD COLUMN "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_bom_item" ADD CONSTRAINT "wms_bom_item_sub_recipe_id_wms_production_recipe_id_fk" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."wms_production_recipe"("id") ON DELETE set null ON UPDATE no action;