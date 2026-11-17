CREATE TABLE "event_budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"planned_amount" integer DEFAULT 0 NOT NULL,
	"performer_id" uuid,
	"notes" text,
	"status" text DEFAULT 'aktif' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_budget_lines_planned_check" CHECK ("event_budget_lines"."planned_amount" >= 0),
	CONSTRAINT "event_budget_lines_status_check" CHECK ("event_budget_lines"."status" in ('aktif','arsip')),
	CONSTRAINT "event_budget_lines_category_check" CHECK ("event_budget_lines"."category" in ('honor','sound','venue','dekorasi','promosi','konsumsi','keamanan','perizinan','transport','lain'))
);
--> statement-breakpoint
CREATE TABLE "event_expense_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"budget_line_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"payee" text NOT NULL,
	"reference" text,
	"proof_path" text,
	"note" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"void_reason" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_expense_payments_amount_check" CHECK ("event_expense_payments"."amount" > 0),
	CONSTRAINT "event_expense_payments_source_check" CHECK ("event_expense_payments"."source" in ('bank_jago','bank_bni','external')),
	CONSTRAINT "event_expense_payments_status_check" CHECK ("event_expense_payments"."status" in ('posted','void'))
);
--> statement-breakpoint
ALTER TABLE "event_budget_lines" ADD CONSTRAINT "event_budget_lines_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_budget_lines" ADD CONSTRAINT "event_budget_lines_performer_id_event_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."event_performers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_budget_lines" ADD CONSTRAINT "event_budget_lines_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_expense_payments" ADD CONSTRAINT "event_expense_payments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_expense_payments" ADD CONSTRAINT "event_expense_payments_budget_line_id_event_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."event_budget_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_expense_payments" ADD CONSTRAINT "event_expense_payments_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_expense_payments" ADD CONSTRAINT "event_expense_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_budget_lines_event_idx" ON "event_budget_lines" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_expense_payments_idem_idx" ON "event_expense_payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "event_expense_payments_event_idx" ON "event_expense_payments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_expense_payments_line_idx" ON "event_expense_payments" USING btree ("budget_line_id");--> statement-breakpoint
-- Kategori P&L "Biaya Event" (non-operasional, berpasangan dengan pendapatan lain sponsor).
INSERT INTO "finance_expense_categories" ("name", "group_key", "cost_class", "cost_item_code") VALUES ('Biaya Event', 'non_operating', 'variable', NULL) ON CONFLICT DO NOTHING;
