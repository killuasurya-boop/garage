ALTER TABLE "point_redemptions" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "point_redemptions" ADD COLUMN "source" text DEFAULT 'MEMBER_APP' NOT NULL;--> statement-breakpoint
ALTER TABLE "point_redemptions" ADD COLUMN "status" text DEFAULT 'redeemed' NOT NULL;--> statement-breakpoint
ALTER TABLE "point_redemptions" ADD COLUMN "returned_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "point_redemptions" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "point_redemptions_order_id_idx" ON "point_redemptions" USING btree ("order_id");--> statement-breakpoint
-- Cashback member lebih sehat (owner, Okt 2026): 1 poin per Rp2.000 menu (±5% Silver).
UPDATE "app_settings" SET "value_json" = '0.5'::jsonb, "updated_at" = now() WHERE "key" = 'pointsPerThousand' AND "value_json" = '1'::jsonb;
