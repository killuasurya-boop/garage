CREATE INDEX IF NOT EXISTS "kitchen_tickets_order_id_idx" ON "kitchen_tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_batch_allocations_ticket_id_idx" ON "production_batch_allocations" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_batch_allocations_order_id_idx" ON "production_batch_allocations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_ticket_items_order_id_idx" ON "production_ticket_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_earnings_order_item_id_idx" ON "staff_earnings" USING btree ("order_item_id");