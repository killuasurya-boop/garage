CREATE TABLE "partner_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"key_p256dh" text NOT NULL,
	"key_auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_push_subscriptions" ADD CONSTRAINT "partner_push_subscriptions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_push_subscriptions_endpoint_idx" ON "partner_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "partner_push_subscriptions_partner_idx" ON "partner_push_subscriptions" USING btree ("partner_id");