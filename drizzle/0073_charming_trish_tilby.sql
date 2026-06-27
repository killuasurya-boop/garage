CREATE TABLE "whatsapp_messaging_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" text NOT NULL,
	"message_type" text DEFAULT 'template' NOT NULL,
	"template_name" text,
	"template_language" text DEFAULT 'id' NOT NULL,
	"template_parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"scheduled_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_publishing_queue" ADD COLUMN "asset_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_messaging_queue" ADD CONSTRAINT "whatsapp_messaging_queue_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messaging_queue_idempotency_idx" ON "whatsapp_messaging_queue" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "whatsapp_messaging_queue_status_schedule_idx" ON "whatsapp_messaging_queue" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messaging_queue_provider_message_idx" ON "whatsapp_messaging_queue" USING btree ("provider_message_id");