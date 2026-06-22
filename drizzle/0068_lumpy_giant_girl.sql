CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_key" text NOT NULL,
	"table_no" text,
	"order_no" text,
	"audio_url" text,
	"audio_source" text,
	"voice_generated_at" timestamp with time zone,
	"tts_provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notification_logs_trigger_key_idx" ON "notification_logs" USING btree ("trigger_key");--> statement-breakpoint
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs" USING btree ("created_at");