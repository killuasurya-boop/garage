CREATE TABLE "content_publishing_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"title" text NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asset_url" text,
	"thumbnail_url" text,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"rejection_reason" text,
	"revision_notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_publishing_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_post_id" text,
	"published_url" text,
	"error" text,
	"analytics" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_publisher_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"account_id" text,
	"account_name" text,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"metadata" jsonb,
	"connected_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_publishing_queue" ADD CONSTRAINT "content_publishing_queue_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publishing_queue" ADD CONSTRAINT "content_publishing_queue_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publishing_queue" ADD CONSTRAINT "content_publishing_queue_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publishing_results" ADD CONSTRAINT "content_publishing_results_queue_id_content_publishing_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."content_publishing_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ADD CONSTRAINT "social_publisher_connections_connected_by_user_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_publishing_queue_campaign_idx" ON "content_publishing_queue" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "content_publishing_queue_status_idx" ON "content_publishing_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_publishing_queue_scheduled_at_idx" ON "content_publishing_queue" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_publishing_results_queue_platform_idx" ON "content_publishing_results" USING btree ("queue_id","platform");--> statement-breakpoint
CREATE INDEX "content_publishing_results_status_idx" ON "content_publishing_results" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "social_publisher_connections_platform_idx" ON "social_publisher_connections" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "social_publisher_connections_status_idx" ON "social_publisher_connections" USING btree ("status");