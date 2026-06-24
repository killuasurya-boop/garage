CREATE TABLE "menu_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text,
	"product_name" text NOT NULL,
	"taste_notes" text DEFAULT '' NOT NULL,
	"recipe_notes" text DEFAULT '' NOT NULL,
	"hpp_notes" text DEFAULT '' NOT NULL,
	"selling_price_notes" text DEFAULT '' NOT NULL,
	"decision" text DEFAULT 'research' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "stage" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_research" ADD CONSTRAINT "menu_research_product_id_menu_items_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_research" ADD CONSTRAINT "menu_research_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_research_decision_idx" ON "menu_research" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "menu_research_product_idx" ON "menu_research" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_items_stage_idx" ON "inventory_items" USING btree ("stage");