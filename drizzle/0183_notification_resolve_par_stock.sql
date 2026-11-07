-- Smart Notification V2 (3 Nov 2026): notifikasi bisa ditandai "selesai" (resolved_at/reason, aditif).
-- Minta Bahan pintar: stok par per bahan + qty diterima per baris. Dulu 0177/0178 di branch ini (bentrok nomor dengan main).
ALTER TABLE "staff_notifications" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD COLUMN "resolved_reason" text;--> statement-breakpoint
ALTER TABLE "wms_material_request_item" ADD COLUMN "received_qty" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_product" ADD COLUMN "par_stock" numeric(14, 4) DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "staff_notifications_order_idx" ON "staff_notifications" USING btree ("order_id");