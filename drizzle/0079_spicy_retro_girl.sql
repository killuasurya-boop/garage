ALTER TABLE "wms_product" ADD COLUMN "barcode" text;--> statement-breakpoint
CREATE INDEX "wms_product_barcode_idx" ON "wms_product" USING btree ("barcode");