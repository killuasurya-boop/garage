CREATE TABLE "staff_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_role" text NOT NULL,
	"assignee_user_id" text,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_run_id" uuid,
	"due_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" text,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_tasks_target_role_idx" ON "staff_tasks" USING btree ("target_role");--> statement-breakpoint
CREATE INDEX "staff_tasks_status_idx" ON "staff_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_tasks_assignee_idx" ON "staff_tasks" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "staff_tasks_source_idx" ON "staff_tasks" USING btree ("source");--> statement-breakpoint
CREATE INDEX "staff_tasks_created_at_idx" ON "staff_tasks" USING btree ("created_at");