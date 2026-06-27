DROP INDEX "social_publisher_connections_platform_idx";--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ALTER COLUMN "access_token_encrypted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "content_publishing_results" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "content_publishing_results" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_publishing_results" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ADD COLUMN "resource_type" text DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ADD COLUMN "last_health_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ADD COLUMN "permissions_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ADD COLUMN "webhook_subscribed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "content_publishing_results" SET "idempotency_key" = "queue_id"::text || ':' || "platform" WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "content_publishing_results" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
UPDATE "social_publisher_connections" SET "resource_id" = COALESCE("account_id", "id"::text) WHERE "resource_id" IS NULL;--> statement-breakpoint
ALTER TABLE "social_publisher_connections" ALTER COLUMN "resource_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_publishing_results_idempotency_idx" ON "content_publishing_results" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "social_publisher_connections_resource_idx" ON "social_publisher_connections" USING btree ("platform","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "social_publisher_connections_provider_idx" ON "social_publisher_connections" USING btree ("platform");
