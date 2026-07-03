CREATE TABLE "wms_production_bom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"input_product_id" uuid,
	"qty" numeric(14, 4) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_production_recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"output_product_id" uuid,
	"output_qty" numeric(14, 4) DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_production_bom" ADD CONSTRAINT "wms_production_bom_recipe_id_wms_production_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."wms_production_recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_production_bom" ADD CONSTRAINT "wms_production_bom_input_product_id_wms_product_id_fk" FOREIGN KEY ("input_product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_production_recipe" ADD CONSTRAINT "wms_production_recipe_output_product_id_wms_product_id_fk" FOREIGN KEY ("output_product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_production_recipe" ADD CONSTRAINT "wms_production_recipe_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_production_bom_recipe_idx" ON "wms_production_bom" USING btree ("recipe_id");