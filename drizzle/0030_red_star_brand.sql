CREATE TABLE "marketing_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"segment_key" text DEFAULT 'atRisk' NOT NULL,
	"template_body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"clicked_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"objective" text DEFAULT 'retention' NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"segment_key" text DEFAULT 'atRisk' NOT NULL,
	"audience_size" integer DEFAULT 0 NOT NULL,
	"budget" integer DEFAULT 0 NOT NULL,
	"spend" integer DEFAULT 0 NOT NULL,
	"target_orders" integer DEFAULT 0 NOT NULL,
	"target_revenue" integer DEFAULT 0 NOT NULL,
	"actual_orders" integer DEFAULT 0 NOT NULL,
	"actual_revenue" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"owner_name" text,
	"notes" text,
	"voucher_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_broadcasts" ADD CONSTRAINT "marketing_broadcasts_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_broadcasts" ADD CONSTRAINT "marketing_broadcasts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_broadcasts_campaign_idx" ON "marketing_broadcasts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "marketing_broadcasts_status_idx" ON "marketing_broadcasts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketing_broadcasts_channel_idx" ON "marketing_broadcasts" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "marketing_broadcasts_scheduled_at_idx" ON "marketing_broadcasts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_campaigns_code_idx" ON "marketing_campaigns" USING btree ("code");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_status_idx" ON "marketing_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_channel_idx" ON "marketing_campaigns" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_segment_idx" ON "marketing_campaigns" USING btree ("segment_key");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_starts_at_idx" ON "marketing_campaigns" USING btree ("starts_at");