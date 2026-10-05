ALTER TABLE "orders" ADD COLUMN "courier_user_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier_location_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_courier_user_id_user_id_fk" FOREIGN KEY ("courier_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;