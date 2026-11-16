CREATE TABLE "event_crew" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text,
	"duties" text,
	"status" text DEFAULT 'aktif' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_crew_status_check" CHECK ("event_crew"."status" in ('aktif','nonaktif'))
);
--> statement-breakpoint
CREATE TABLE "event_crew_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"title" text NOT NULL,
	"crew_id" uuid,
	"due_date" date,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"notes" text,
	"done_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_crew_tasks_status_check" CHECK ("event_crew_tasks"."status" in ('todo','proses','selesai','batal')),
	CONSTRAINT "event_crew_tasks_priority_check" CHECK ("event_crew_tasks"."priority" in ('rendah','normal','tinggi'))
);
--> statement-breakpoint
CREATE TABLE "event_performers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"event_date" date,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"genre" text,
	"contact_name" text,
	"contact_phone" text,
	"instagram" text,
	"member_count" integer,
	"status" text DEFAULT 'calon' NOT NULL,
	"slot_order" integer,
	"set_start" text,
	"set_minutes" integer,
	"tech_rider" text,
	"notes" text,
	"show_on_website" boolean DEFAULT true NOT NULL,
	"cancel_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_performers_kind_check" CHECK ("event_performers"."kind" in ('band','standup','akustik','dj','kreator')),
	CONSTRAINT "event_performers_status_check" CHECK ("event_performers"."status" in ('calon','konfirmasi','batal')),
	CONSTRAINT "event_performers_minutes_check" CHECK ("event_performers"."set_minutes" is null or ("event_performers"."set_minutes" > 0 and "event_performers"."set_minutes" <= 600))
);
--> statement-breakpoint
ALTER TABLE "event_crew" ADD CONSTRAINT "event_crew_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_crew_tasks" ADD CONSTRAINT "event_crew_tasks_crew_id_event_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."event_crew"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_crew_tasks" ADD CONSTRAINT "event_crew_tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_performers" ADD CONSTRAINT "event_performers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_crew_event_idx" ON "event_crew" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "event_crew_tasks_event_idx" ON "event_crew_tasks" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "event_crew_tasks_crew_idx" ON "event_crew_tasks" USING btree ("crew_id");--> statement-breakpoint
CREATE INDEX "event_performers_event_idx" ON "event_performers" USING btree ("event_name");