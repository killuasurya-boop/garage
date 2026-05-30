CREATE TABLE "ai_owner_chat_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"run_id" uuid,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"provider" text,
	"model" text,
	"profile" text,
	"tool" text,
	"data_access_level" text,
	"latency_ms" integer,
	"token_usage" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_owner_chat_history" ADD CONSTRAINT "ai_owner_chat_history_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_owner_chat_history" ADD CONSTRAINT "ai_owner_chat_history_run_id_ai_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_owner_chat_history_owner_idx" ON "ai_owner_chat_history" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ai_owner_chat_history_owner_created_idx" ON "ai_owner_chat_history" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_owner_chat_history_run_idx" ON "ai_owner_chat_history" USING btree ("run_id");