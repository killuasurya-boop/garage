ALTER TABLE "orders" ADD COLUMN "parent_order_id" uuid;--> statement-breakpoint
CREATE INDEX "orders_parent_order_id_idx" ON "orders" USING btree ("parent_order_id");