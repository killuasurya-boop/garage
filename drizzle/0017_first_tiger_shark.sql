ALTER TABLE "staff_earning_payouts" ADD COLUMN "item_count_service" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_earning_payouts" ADD COLUMN "item_count_cashier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD COLUMN "event" text DEFAULT 'ticket_ready' NOT NULL;