CREATE TABLE "staff_cash_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" integer NOT NULL,
	"settled_amount" integer DEFAULT 0 NOT NULL,
	"method" text DEFAULT 'Cash' NOT NULL,
	"note" text,
	"expense_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_payroll_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"paid_until" date NOT NULL,
	"gross_gaji" integer DEFAULT 0 NOT NULL,
	"gross_fee" integer DEFAULT 0 NOT NULL,
	"advance_deducted" integer DEFAULT 0 NOT NULL,
	"net_paid" integer DEFAULT 0 NOT NULL,
	"method" text DEFAULT 'Cash' NOT NULL,
	"note" text,
	"gaji_expense_id" uuid,
	"fee_expense_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_pool_splits" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_cash_advances" ADD CONSTRAINT "staff_cash_advances_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_cash_advances" ADD CONSTRAINT "staff_cash_advances_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payroll_payments" ADD CONSTRAINT "staff_payroll_payments_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payroll_payments" ADD CONSTRAINT "staff_payroll_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_cash_advances_staff_idx" ON "staff_cash_advances" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "staff_payroll_payments_staff_idx" ON "staff_payroll_payments" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "staff_payroll_payments_created_idx" ON "staff_payroll_payments" USING btree ("created_at");