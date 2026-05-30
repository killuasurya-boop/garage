CREATE TABLE "staff_earning_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"outlet_id" uuid,
	"cycle_start" timestamp with time zone NOT NULL,
	"cycle_end" timestamp with time zone NOT NULL,
	"item_count_food" integer DEFAULT 0 NOT NULL,
	"item_count_drink" integer DEFAULT 0 NOT NULL,
	"item_count_packaging" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"requested_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"paid_by" text,
	"paid_at" timestamp with time zone,
	"payment_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"outlet_id" uuid,
	"ticket_id" uuid,
	"order_id" uuid,
	"order_item_id" uuid,
	"item_kind" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_fee" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'accrued' NOT NULL,
	"payout_id" uuid,
	"cycle_start" timestamp with time zone NOT NULL,
	"cycle_end" timestamp with time zone NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reverse_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_earning_payouts" ADD CONSTRAINT "staff_earning_payouts_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earning_payouts" ADD CONSTRAINT "staff_earning_payouts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earning_payouts" ADD CONSTRAINT "staff_earning_payouts_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earning_payouts" ADD CONSTRAINT "staff_earning_payouts_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earning_payouts" ADD CONSTRAINT "staff_earning_payouts_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD CONSTRAINT "staff_earnings_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD CONSTRAINT "staff_earnings_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD CONSTRAINT "staff_earnings_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD CONSTRAINT "staff_earnings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD CONSTRAINT "staff_earnings_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_earnings" ADD CONSTRAINT "staff_earnings_payout_id_staff_earning_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."staff_earning_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_earning_payouts_staff_idx" ON "staff_earning_payouts" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "staff_earning_payouts_status_idx" ON "staff_earning_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_earning_payouts_cycle_idx" ON "staff_earning_payouts" USING btree ("cycle_start");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_earning_payouts_staff_cycle_idx" ON "staff_earning_payouts" USING btree ("staff_user_id","cycle_start");--> statement-breakpoint
CREATE INDEX "staff_earnings_staff_idx" ON "staff_earnings" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "staff_earnings_status_idx" ON "staff_earnings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_earnings_payout_idx" ON "staff_earnings" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "staff_earnings_cycle_idx" ON "staff_earnings" USING btree ("cycle_start");--> statement-breakpoint
CREATE INDEX "staff_earnings_ticket_idx" ON "staff_earnings" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "staff_earnings_order_idx" ON "staff_earnings" USING btree ("order_id");