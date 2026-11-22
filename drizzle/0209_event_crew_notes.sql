CREATE TABLE "event_crew_notes" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"rundown" text DEFAULT '' NOT NULL,
	"readiness" text DEFAULT '' NOT NULL,
	"extra_portions" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_by_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_crew_notes" ADD CONSTRAINT "event_crew_notes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_crew_notes" ADD CONSTRAINT "event_crew_notes_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;