CREATE TABLE "ai_action_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"action_type" text NOT NULL,
	"agent_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"risk_level" text NOT NULL,
	"safety_level" text NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_action_registry" (
	"action_type" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"safety_level" text NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"allowed_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_configs" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"autonomy_mode" text DEFAULT 'controlled' NOT NULL,
	"max_risk_level" text DEFAULT 'medium' NOT NULL,
	"allowed_intents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"agent_id" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD COLUMN "supervisor_decision" jsonb;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD COLUMN "agents_used" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD COLUMN "handoffs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD COLUMN "risk_level" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD COLUMN "approval_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_action_drafts" ADD CONSTRAINT "ai_action_drafts_run_id_ai_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_drafts" ADD CONSTRAINT "ai_action_drafts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_drafts" ADD CONSTRAINT "ai_action_drafts_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_events" ADD CONSTRAINT "ai_agent_events_run_id_ai_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_action_drafts_run_idx" ON "ai_action_drafts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_action_drafts_action_idx" ON "ai_action_drafts" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "ai_action_drafts_status_idx" ON "ai_action_drafts" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "ai_action_registry_safety_idx" ON "ai_action_registry" USING btree ("safety_level");--> statement-breakpoint
CREATE INDEX "ai_action_registry_enabled_idx" ON "ai_action_registry" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "ai_agent_configs_enabled_idx" ON "ai_agent_configs" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "ai_agent_configs_sort_idx" ON "ai_agent_configs" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "ai_agent_events_run_idx" ON "ai_agent_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_agent_events_agent_idx" ON "ai_agent_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "ai_agent_events_created_idx" ON "ai_agent_events" USING btree ("created_at");