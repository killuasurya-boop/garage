CREATE TABLE "menu_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" text,
	"variant_id" text DEFAULT 'all' NOT NULL,
	"inventory_sku" text,
	"qty" real NOT NULL,
	"unit" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"target" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"order_id" uuid,
	"ticket_no" text,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"printed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_handover_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_session_id" uuid,
	"outlet_id" uuid,
	"status" text DEFAULT 'recorded' NOT NULL,
	"summary" jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"table_number" text NOT NULL,
	"table_label" text NOT NULL,
	"status" text DEFAULT 'empty' NOT NULL,
	"current_order_id" uuid,
	"needs_cleaning" boolean DEFAULT false NOT NULL,
	"last_status_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleaned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid,
	"order_id" uuid,
	"customer_id" uuid,
	"customer_phone" text,
	"discount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'redeemed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'fixed' NOT NULL,
	"value" integer NOT NULL,
	"min_spend" integer DEFAULT 0 NOT NULL,
	"max_discount" integer,
	"audience" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_recipes" ADD CONSTRAINT "menu_recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_recipes" ADD CONSTRAINT "menu_recipes_inventory_sku_inventory_items_sku_fk" FOREIGN KEY ("inventory_sku") REFERENCES "public"."inventory_items"("sku") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handover_reports" ADD CONSTRAINT "shift_handover_reports_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handover_reports" ADD CONSTRAINT "shift_handover_reports_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handover_reports" ADD CONSTRAINT "shift_handover_reports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_current_order_id_orders_id_fk" FOREIGN KEY ("current_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_recipes_menu_variant_sku_idx" ON "menu_recipes" USING btree ("menu_item_id","variant_id","inventory_sku");--> statement-breakpoint
CREATE INDEX "menu_recipes_menu_item_idx" ON "menu_recipes" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "menu_recipes_inventory_sku_idx" ON "menu_recipes" USING btree ("inventory_sku");--> statement-breakpoint
CREATE INDEX "menu_recipes_status_idx" ON "menu_recipes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "print_jobs_status_idx" ON "print_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "print_jobs_order_id_idx" ON "print_jobs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "print_jobs_ticket_no_idx" ON "print_jobs" USING btree ("ticket_no");--> statement-breakpoint
CREATE INDEX "print_jobs_created_at_idx" ON "print_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shift_handover_reports_outlet_idx" ON "shift_handover_reports" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "shift_handover_reports_cash_session_idx" ON "shift_handover_reports" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "shift_handover_reports_created_at_idx" ON "shift_handover_reports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_outlet_table_idx" ON "table_sessions" USING btree ("outlet_id","table_number");--> statement-breakpoint
CREATE INDEX "table_sessions_status_idx" ON "table_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "table_sessions_current_order_idx" ON "table_sessions" USING btree ("current_order_id");--> statement-breakpoint
CREATE INDEX "voucher_redemptions_voucher_id_idx" ON "voucher_redemptions" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "voucher_redemptions_order_id_idx" ON "voucher_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "voucher_redemptions_customer_id_idx" ON "voucher_redemptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "voucher_redemptions_customer_phone_idx" ON "voucher_redemptions" USING btree ("customer_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_code_idx" ON "vouchers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "vouchers_status_idx" ON "vouchers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vouchers_audience_idx" ON "vouchers" USING btree ("audience");