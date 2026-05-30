ALTER TABLE "cash_sessions" ADD COLUMN "discrepancy_status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "denominations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "closing_note" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "manager_sign_off_by" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "manager_sign_off_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "unit_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_recipes" ADD COLUMN "waste_pct" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_manager_sign_off_by_user_id_fk" FOREIGN KEY ("manager_sign_off_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
