CREATE TABLE "audit_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_kind" text NOT NULL,
	"severity" text DEFAULT 'watch' NOT NULL,
	"actor_user_id" text,
	"actor_name" text,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_cases" ADD CONSTRAINT "audit_cases_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_cases" ADD CONSTRAINT "audit_cases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_cases_status_idx" ON "audit_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_cases_actor_idx" ON "audit_cases" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_cases_created_at_idx" ON "audit_cases" USING btree ("created_at");