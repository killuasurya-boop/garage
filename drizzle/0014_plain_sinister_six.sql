ALTER TABLE "orders" ADD COLUMN "invoice_tracking_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_invoice_tracking_token_idx" ON "orders" USING btree ("invoice_tracking_token");