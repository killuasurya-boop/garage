ALTER TABLE "wifi_access_logs" ADD COLUMN "kind" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "wifi_access_logs" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "wifi_access_logs" ADD COLUMN "guest_phone" text;--> statement-breakpoint
CREATE INDEX "wifi_access_logs_guest_phone_idx" ON "wifi_access_logs" USING btree ("guest_phone");