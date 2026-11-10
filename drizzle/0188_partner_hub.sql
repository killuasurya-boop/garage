-- 0188 Smart Partner Hub (Owner, 10 Nov 2026, docs/partner-hub/00-GATE0-AUDIT-PLAN.md): aditif saja.
-- Rollback darurat: docs/partner-hub/0188-down.sql (hanya dengan ACC Owner).
CREATE TABLE "partner_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"display_name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"order_line_id" uuid,
	"kind" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"sales_delta" integer DEFAULT 0 NOT NULL,
	"liability_delta" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"source_ref" text,
	"created_by" text,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_last4" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"ticket_id" uuid,
	"menu_item_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"item_name" text NOT NULL,
	"variant_label" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"price_history_id" uuid,
	"status" text DEFAULT 'queue' NOT NULL,
	"fulfilled_qty" integer DEFAULT 0 NOT NULL,
	"cancelled_qty" integer DEFAULT 0 NOT NULL,
	"table_label" text,
	"customer_name" text,
	"order_no" text NOT NULL,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"bank_account_id" uuid,
	"amount" integer NOT NULL,
	"fund_source" text NOT NULL,
	"reference" text NOT NULL,
	"proof_url" text,
	"status" text DEFAULT 'recorded' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by" text,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"self_verified" boolean DEFAULT false NOT NULL,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"variant_id" text NOT NULL,
	"unit_cost" integer NOT NULL,
	"sell_price" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_product_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"menu_item_id" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"availability_updated_at" timestamp with time zone,
	"availability_updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_no" text NOT NULL,
	"settlement_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"checksum" text NOT NULL,
	"total_lines" integer NOT NULL,
	"file_path" text NOT NULL,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_settlement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"order_line_id" uuid,
	"adjustment_id" uuid,
	"qty" integer NOT NULL,
	"sales" integer NOT NULL,
	"cost" integer NOT NULL,
	"liability" integer NOT NULL,
	"active_line_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_no" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_qty" integer DEFAULT 0 NOT NULL,
	"gross_sales" integer DEFAULT 0 NOT NULL,
	"sales_adjustments" integer DEFAULT 0 NOT NULL,
	"total_cost" integer DEFAULT 0 NOT NULL,
	"liability_adjustments" integer DEFAULT 0 NOT NULL,
	"garage_profit" integer DEFAULT 0 NOT NULL,
	"liability_total" integer DEFAULT 0 NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"summary_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"note" text,
	"created_by" text,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"pic_name" text,
	"phone" text,
	"address" text,
	"product_kind" text,
	"handover_point" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"operational_status" text DEFAULT 'tutup' NOT NULL,
	"operational_status_at" timestamp with time zone,
	"operational_status_by" text,
	"last_order_by_day" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payout_schedule" text,
	"terms" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "production_ticket_items" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_adjustments" ADD CONSTRAINT "partner_adjustments_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_adjustments" ADD CONSTRAINT "partner_adjustments_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_adjustments" ADD CONSTRAINT "partner_adjustments_order_line_id_partner_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."partner_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_events" ADD CONSTRAINT "partner_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_price_history_id_partner_price_history_id_fk" FOREIGN KEY ("price_history_id") REFERENCES "public"."partner_price_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payouts" ADD CONSTRAINT "partner_payouts_settlement_id_partner_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."partner_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payouts" ADD CONSTRAINT "partner_payouts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payouts" ADD CONSTRAINT "partner_payouts_bank_account_id_partner_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."partner_bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payouts" ADD CONSTRAINT "partner_payouts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payouts" ADD CONSTRAINT "partner_payouts_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_price_history" ADD CONSTRAINT "partner_price_history_link_id_partner_product_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."partner_product_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_price_history" ADD CONSTRAINT "partner_price_history_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD CONSTRAINT "partner_product_links_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD CONSTRAINT "partner_product_links_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD CONSTRAINT "partner_product_links_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_reports" ADD CONSTRAINT "partner_reports_settlement_id_partner_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."partner_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_reports" ADD CONSTRAINT "partner_reports_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlement_lines" ADD CONSTRAINT "partner_settlement_lines_settlement_id_partner_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."partner_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlement_lines" ADD CONSTRAINT "partner_settlement_lines_order_line_id_partner_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."partner_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlement_lines" ADD CONSTRAINT "partner_settlement_lines_adjustment_id_partner_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."partner_adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_accounts_phone_idx" ON "partner_accounts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "partner_accounts_partner_idx" ON "partner_accounts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_adjustments_partner_idx" ON "partner_adjustments" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_adjustments_source_idx" ON "partner_adjustments" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "partner_bank_accounts_partner_idx" ON "partner_bank_accounts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_events_partner_created_idx" ON "partner_events" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_order_lines_order_item_idx" ON "partner_order_lines" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "partner_order_lines_partner_created_idx" ON "partner_order_lines" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_order_lines_ticket_idx" ON "partner_order_lines" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_payouts_reference_idx" ON "partner_payouts" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_payouts_idem_idx" ON "partner_payouts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "partner_payouts_settlement_idx" ON "partner_payouts" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "partner_price_history_link_idx" ON "partner_price_history" USING btree ("link_id","variant_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_product_links_menu_item_idx" ON "partner_product_links" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "partner_product_links_partner_idx" ON "partner_product_links" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_product_links_code_idx" ON "partner_product_links" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_reports_no_idx" ON "partner_reports" USING btree ("report_no");--> statement-breakpoint
CREATE INDEX "partner_reports_settlement_idx" ON "partner_reports" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "partner_settlement_lines_settlement_idx" ON "partner_settlement_lines" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_settlement_lines_active_idx" ON "partner_settlement_lines" USING btree ("active_line_key");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_settlements_no_idx" ON "partner_settlements" USING btree ("settlement_no");--> statement-breakpoint
CREATE INDEX "partner_settlements_partner_idx" ON "partner_settlements" USING btree ("partner_id","period_from");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_code_idx" ON "partners" USING btree ("code");--> statement-breakpoint
CREATE INDEX "partners_outlet_idx" ON "partners" USING btree ("outlet_id");--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_ticket_items" ADD CONSTRAINT "production_ticket_items_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Smart Partner Hub: jejak status mitra append-only (koreksi = event baru). Hapus massal hanya
-- saat reset grand opening (SET LOCAL garage.cash_ledger_purge = 'on').
CREATE OR REPLACE FUNCTION "partner_events_immutable"() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('garage.cash_ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Jejak mitra tidak bisa diubah atau dihapus — catat event baru.';
END
$fn$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "partner_events_immutable_trg" BEFORE UPDATE OR DELETE ON "partner_events"
  FOR EACH ROW EXECUTE FUNCTION "partner_events_immutable"();
