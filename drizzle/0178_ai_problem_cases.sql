CREATE TABLE "ai_problem_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"actor_name" text,
	"case_version" integer NOT NULL,
	"operation_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_problem_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_no" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"outlet_id" uuid,
	"question" text NOT NULL,
	"mode" text DEFAULT 'quick' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"analysis_status" text NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diagnosis" jsonb NOT NULL,
	"diagnosis_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_problem_case_events" ADD CONSTRAINT "ai_problem_case_events_case_id_ai_problem_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."ai_problem_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_problem_case_events" ADD CONSTRAINT "ai_problem_case_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_problem_case_events" ADD CONSTRAINT "ai_problem_case_events_operation_id_mcp_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."mcp_operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_problem_cases" ADD CONSTRAINT "ai_problem_cases_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_problem_cases" ADD CONSTRAINT "ai_problem_cases_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_problem_case_events_case_idx" ON "ai_problem_case_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_problem_cases_case_no_idx" ON "ai_problem_cases" USING btree ("case_no");--> statement-breakpoint
CREATE INDEX "ai_problem_cases_owner_idx" ON "ai_problem_cases" USING btree ("owner_user_id","created_at");--> statement-breakpoint
-- Linimasa kasus AYA = append-only: baris tidak boleh diubah (koreksi = event baru).
-- DELETE tetap diizinkan untuk retensi/hapus kasus (cascade dari ai_problem_cases).
CREATE OR REPLACE FUNCTION "ai_problem_case_events_immutable"() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'ai_problem_case_events bersifat append-only';
END;
$fn$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "ai_problem_case_events_no_update" BEFORE UPDATE ON "ai_problem_case_events"
FOR EACH ROW EXECUTE FUNCTION "ai_problem_case_events_immutable"();
