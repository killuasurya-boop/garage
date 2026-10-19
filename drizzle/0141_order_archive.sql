ALTER TABLE "orders" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "archive_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_archived_at_idx" ON "orders" USING btree ("archived_at");