CREATE TABLE "marketing_broadcast_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"customer_id" uuid,
	"recipient_name" text DEFAULT '' NOT NULL,
	"recipient_phone" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"provider" text DEFAULT 'simulation' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"rendered_body" text DEFAULT '' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_broadcast_deliveries" ADD CONSTRAINT "marketing_broadcast_deliveries_broadcast_id_marketing_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."marketing_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_broadcast_deliveries" ADD CONSTRAINT "marketing_broadcast_deliveries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_broadcast_deliveries_broadcast_idx" ON "marketing_broadcast_deliveries" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "marketing_broadcast_deliveries_status_idx" ON "marketing_broadcast_deliveries" USING btree ("status");