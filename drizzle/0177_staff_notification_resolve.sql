-- Smart Notification V2 (3 Nov 2026): notifikasi bisa ditandai "selesai" (tidak perlu aksi lagi).
-- Aditif saja: kolom nullable + index; baris lama = resolved_at NULL = perilaku lama.
ALTER TABLE "staff_notifications" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD COLUMN "resolved_reason" text;--> statement-breakpoint
CREATE INDEX "staff_notifications_order_idx" ON "staff_notifications" USING btree ("order_id");