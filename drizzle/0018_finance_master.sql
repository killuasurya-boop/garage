CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'COGS' NOT NULL,
	"contact_name" text,
	"phone" text,
	"address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid,
	"outlet_id" uuid,
	"invoice_no" text NOT NULL,
	"category" text DEFAULT 'COGS' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"created_by" text,
	"paid_by" text,
	"payment_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_invoices_invoice_no_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"supplier_id" uuid,
	"supplier_invoice_id" uuid,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"payment_method" text DEFAULT 'Cash' NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"receipt_url" text,
	"notes" text,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"settlement_no" text NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"expected_amount" integer NOT NULL,
	"settled_amount" integer DEFAULT 0 NOT NULL,
	"fee_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"settlement_date" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"reference" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settlements_settlement_no_unique" UNIQUE("settlement_no")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_session_id" uuid,
	"outlet_id" uuid,
	"type" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"movement_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_idx" ON "suppliers" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "suppliers_outlet_idx" ON "suppliers" USING btree ("outlet_id");
--> statement-breakpoint
CREATE INDEX "suppliers_status_idx" ON "suppliers" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "supplier_invoices_supplier_idx" ON "supplier_invoices" USING btree ("supplier_id");
--> statement-breakpoint
CREATE INDEX "supplier_invoices_outlet_idx" ON "supplier_invoices" USING btree ("outlet_id");
--> statement-breakpoint
CREATE INDEX "supplier_invoices_status_idx" ON "supplier_invoices" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "supplier_invoices_due_idx" ON "supplier_invoices" USING btree ("due_date");
--> statement-breakpoint
CREATE INDEX "expenses_outlet_idx" ON "expenses" USING btree ("outlet_id");
--> statement-breakpoint
CREATE INDEX "expenses_supplier_idx" ON "expenses" USING btree ("supplier_id");
--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "expenses_status_idx" ON "expenses" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expense_date");
--> statement-breakpoint
CREATE INDEX "payment_settlements_outlet_idx" ON "payment_settlements" USING btree ("outlet_id");
--> statement-breakpoint
CREATE INDEX "payment_settlements_method_idx" ON "payment_settlements" USING btree ("method");
--> statement-breakpoint
CREATE INDEX "payment_settlements_status_idx" ON "payment_settlements" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "payment_settlements_date_idx" ON "payment_settlements" USING btree ("settlement_date");
--> statement-breakpoint
CREATE INDEX "cash_movements_session_idx" ON "cash_movements" USING btree ("cash_session_id");
--> statement-breakpoint
CREATE INDEX "cash_movements_outlet_idx" ON "cash_movements" USING btree ("outlet_id");
--> statement-breakpoint
CREATE INDEX "cash_movements_type_idx" ON "cash_movements" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "cash_movements_at_idx" ON "cash_movements" USING btree ("movement_at");
