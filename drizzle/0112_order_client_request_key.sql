ALTER TABLE "orders" ADD COLUMN "client_request_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_client_request_key_idx" ON "orders" USING btree ("client_request_key");