ALTER TABLE "event_incidents" ADD COLUMN "platform_ref" text;--> statement-breakpoint
ALTER TABLE "event_vendor_contracts" ADD COLUMN "platform_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "event_incidents_platform_ref_idx" ON "event_incidents" USING btree ("event_id","platform_ref") WHERE "event_incidents"."platform_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_vendor_contracts_platform_ref_idx" ON "event_vendor_contracts" USING btree ("event_id","platform_ref") WHERE "event_vendor_contracts"."platform_ref" IS NOT NULL;