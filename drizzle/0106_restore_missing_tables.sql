-- Temuan gladi G-12: tabel berikut ada di skema & snapshot Drizzle, tetapi tidak
-- pernah dibuat oleh migrasi SQL mana pun, sehingga DB hasil migrasi tidak
-- memilikinya. IF NOT EXISTS → aman untuk DB lama yang (mungkin) sudah punya.
CREATE TABLE IF NOT EXISTS "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"route" text,
	"method" text,
	"user_id" text,
	"user_role" text,
	"message" text NOT NULL,
	"stack_trace" text,
	"status_code" integer,
	"request_id" text,
	"metadata" jsonb,
	"fingerprint" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_source_idx" ON "error_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_fingerprint_idx" ON "error_events" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_occurred_at_idx" ON "error_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_resolved_idx" ON "error_events" USING btree ("resolved");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"user_role" text,
	"outlet_id" uuid,
	"category" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"current_url" text,
	"user_agent" text,
	"status" text DEFAULT 'open' NOT NULL,
	"triaged_by" text,
	"triaged_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_entries_status_idx" ON "feedback_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_entries_priority_idx" ON "feedback_entries" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_entries_category_idx" ON "feedback_entries" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_entries_created_at_idx" ON "feedback_entries" USING btree ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "earnings_failed_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_tried_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earnings_failed_queue_pending_idx" ON "earnings_failed_queue" USING btree ("resolved_at","created_at");
