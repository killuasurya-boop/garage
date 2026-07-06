CREATE TABLE "wms_recipe_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"action" text NOT NULL,
	"step" text DEFAULT '' NOT NULL,
	"actor_id" text,
	"actor_name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_recipe_audit_log" ADD CONSTRAINT "wms_recipe_audit_log_recipe_id_wms_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."wms_recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_recipe_audit_log" ADD CONSTRAINT "wms_recipe_audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_recipe_audit_recipe_idx" ON "wms_recipe_audit_log" USING btree ("recipe_id");