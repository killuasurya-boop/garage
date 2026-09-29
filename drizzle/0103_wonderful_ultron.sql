CREATE TABLE "staff_thr_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"holiday_name" text NOT NULL,
	"holiday_date" date NOT NULL,
	"months_worked" integer NOT NULL,
	"base_salary" integer NOT NULL,
	"amount" integer NOT NULL,
	"method" text DEFAULT 'Cash' NOT NULL,
	"note" text,
	"expense_id" uuid,
	"status" text DEFAULT 'paid' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_wage_config" ADD COLUMN "join_date" date;--> statement-breakpoint
ALTER TABLE "staff_thr_payments" ADD CONSTRAINT "staff_thr_payments_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_thr_payments" ADD CONSTRAINT "staff_thr_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_thr_payments_staff_idx" ON "staff_thr_payments" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "staff_thr_payments_holiday_idx" ON "staff_thr_payments" USING btree ("holiday_date");