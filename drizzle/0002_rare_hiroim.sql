CREATE TABLE "ai_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text NOT NULL,
	"intent" text NOT NULL,
	"profile" text DEFAULT 'fast' NOT NULL,
	"data_access_level" text DEFAULT 'operational' NOT NULL,
	"provider" text,
	"model" text,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"latency_ms" integer,
	"token_usage" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_context_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"snapshot_key" text NOT NULL,
	"data_access_level" text NOT NULL,
	"summary" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_context_snapshots" ADD CONSTRAINT "ai_context_snapshots_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_agent_runs_created_at_idx" ON "ai_agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_agent_runs_provider_idx" ON "ai_agent_runs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "ai_agent_runs_intent_idx" ON "ai_agent_runs" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "ai_context_snapshots_outlet_idx" ON "ai_context_snapshots" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "ai_context_snapshots_key_idx" ON "ai_context_snapshots" USING btree ("snapshot_key");--> statement-breakpoint
CREATE INDEX "ai_context_snapshots_expires_idx" ON "ai_context_snapshots" USING btree ("expires_at");