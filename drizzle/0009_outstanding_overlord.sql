ALTER TABLE "orders" ADD COLUMN "order_source" text DEFAULT 'pos' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_mode" text DEFAULT 'cashier' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "campaign" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "whatsapp_invoice_status" text DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "whatsapp_invoice_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "accepted_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejected_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_order_source_idx" ON "orders" USING btree ("order_source");--> statement-breakpoint
CREATE INDEX "orders_customer_phone_idx" ON "orders" USING btree ("customer_phone");