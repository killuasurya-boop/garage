CREATE TABLE "wifi_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"mac" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "wa_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "wa_verified_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_proof_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_proof_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wifi_access_logs" ADD CONSTRAINT "wifi_access_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wifi_access_logs_customer_idx" ON "wifi_access_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wifi_access_logs_created_idx" ON "wifi_access_logs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_wa_verified_by_user_id_fk" FOREIGN KEY ("wa_verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;