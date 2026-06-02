CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "employee_attendances_staff_time_idx" ON "employee_attendances" USING btree ("staff_id","timestamp");--> statement-breakpoint
CREATE INDEX "kitchen_tickets_status_created_idx" ON "kitchen_tickets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_outlet_created_idx" ON "orders" USING btree ("outlet_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");