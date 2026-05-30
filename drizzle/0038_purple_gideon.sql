ALTER TABLE "stock_opname_sessions" ADD COLUMN "location_type" text DEFAULT 'outlet' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_opname_sessions" ADD COLUMN "location_key" text DEFAULT 'outlet' NOT NULL;--> statement-breakpoint
UPDATE "stock_opname_sessions"
SET "location_key" = CASE
  WHEN "outlet_id" IS NOT NULL THEN 'outlet:' || "outlet_id"::text
  ELSE 'warehouse'
END;
