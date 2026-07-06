CREATE TABLE "wms_recipe_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"snapshot" text NOT NULL,
	"cogs" integer DEFAULT 0 NOT NULL,
	"sell_price" integer DEFAULT 0 NOT NULL,
	"food_cost_pct" real DEFAULT 0 NOT NULL,
	"actor_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_recipe_version" ADD CONSTRAINT "wms_recipe_version_recipe_id_wms_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."wms_recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_recipe_version_recipe_idx" ON "wms_recipe_version" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "wms_recipe_version_recipe_no_idx" ON "wms_recipe_version" USING btree ("recipe_id","version_no");