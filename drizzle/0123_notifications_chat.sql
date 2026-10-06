CREATE TABLE "order_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"key_p256dh" text NOT NULL,
	"key_auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_notification_reads" (
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"audience" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"order_id" uuid,
	"dedup_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_chat_messages" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "order_push_subscriptions" ADD CONSTRAINT "order_push_subscriptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notification_reads" ADD CONSTRAINT "staff_notification_reads_notification_id_staff_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."staff_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notification_reads" ADD CONSTRAINT "staff_notification_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_push_subscriptions_order_endpoint_idx" ON "order_push_subscriptions" USING btree ("order_id","endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_notification_reads_pk" ON "staff_notification_reads" USING btree ("notification_id","user_id");--> statement-breakpoint
CREATE INDEX "staff_notifications_outlet_created_idx" ON "staff_notifications" USING btree ("outlet_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_notifications_user_idx" ON "staff_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_notifications_dedup_idx" ON "staff_notifications" USING btree ("dedup_key");