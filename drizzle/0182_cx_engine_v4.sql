CREATE TABLE "customer_experience_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"order_id" uuid,
	"customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_marketing_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"granted" boolean NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_experience_events" ADD CONSTRAINT "customer_experience_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_experience_events" ADD CONSTRAINT "customer_experience_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_marketing_consents" ADD CONSTRAINT "customer_marketing_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_experience_events_event_created_idx" ON "customer_experience_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "customer_experience_events_order_event_idx" ON "customer_experience_events" USING btree ("order_id","event");--> statement-breakpoint
CREATE INDEX "customer_marketing_consents_customer_idx" ON "customer_marketing_consents" USING btree ("customer_id","channel","created_at");