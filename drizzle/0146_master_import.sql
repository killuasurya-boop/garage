CREATE TABLE "master_crosswalk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source_key" text NOT NULL,
	"source_name" text DEFAULT '' NOT NULL,
	"target_sku" text,
	"target_menu_item_id" text,
	"target_variant_id" text,
	"status" text NOT NULL,
	"validated" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"import_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"mode" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_crosswalk" ADD CONSTRAINT "master_crosswalk_import_id_master_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."master_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_imports" ADD CONSTRAINT "master_imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "master_crosswalk_kind_key_unique" ON "master_crosswalk" USING btree ("kind","source_key");--> statement-breakpoint
CREATE INDEX "master_imports_created_idx" ON "master_imports" USING btree ("created_at");