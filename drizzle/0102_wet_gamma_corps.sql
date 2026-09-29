ALTER TABLE "staff_cash_advances" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_cash_advances" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_cash_advances" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "staff_payroll_payments" ADD COLUMN "status" text DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_payroll_payments" ADD COLUMN "advance_allocations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_payroll_payments" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_payroll_payments" ADD COLUMN "cancel_reason" text;