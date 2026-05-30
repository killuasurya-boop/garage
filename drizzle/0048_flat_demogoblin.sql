CREATE TABLE "kpi_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"evaluator_id" text,
	"period" text NOT NULL,
	"score" real NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"date" date NOT NULL,
	"shift_type" text NOT NULL,
	"start_time" text,
	"end_time" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"role_target" text NOT NULL,
	"shift_target" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kpi_evaluations" ADD CONSTRAINT "kpi_evaluations_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_evaluations" ADD CONSTRAINT "kpi_evaluations_evaluator_id_user_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_checklists" ADD CONSTRAINT "sop_checklists_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_logs" ADD CONSTRAINT "sop_logs_checklist_id_sop_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."sop_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_logs" ADD CONSTRAINT "sop_logs_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kpi_evaluations_staff_idx" ON "kpi_evaluations" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "kpi_evaluations_period_idx" ON "kpi_evaluations" USING btree ("period");--> statement-breakpoint
CREATE INDEX "shift_schedules_staff_idx" ON "shift_schedules" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "shift_schedules_date_idx" ON "shift_schedules" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sop_logs_checklist_idx" ON "sop_logs" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "sop_logs_date_idx" ON "sop_logs" USING btree ("date");