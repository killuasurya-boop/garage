ALTER TABLE "wms_internal_order" ADD COLUMN "source_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "wms_internal_order_source_ref_idx" ON "wms_internal_order" USING btree ("source_ref");