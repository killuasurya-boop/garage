CREATE TABLE "ai_provider_configs" (
	"provider" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"api_key_encrypted" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"last_status" text DEFAULT 'untested' NOT NULL,
	"last_error" text,
	"last_latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_provider_configs_enabled_idx" ON "ai_provider_configs" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "ai_provider_configs_priority_idx" ON "ai_provider_configs" USING btree ("priority");