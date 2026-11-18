CREATE TABLE "event_public_finance" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"event_name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'diajukan' NOT NULL,
	"code_hash" text NOT NULL,
	"name" text NOT NULL,
	"pic" text NOT NULL,
	"whatsapp" text NOT NULL,
	"instagram" text,
	"description" text,
	"category" text,
	"address" text,
	"amount" bigint,
	"members" integer,
	"role" text,
	"attendance" text,
	"portfolio" text,
	"tech" text,
	"diet" text,
	"consent" boolean DEFAULT false NOT NULL,
	"logo_url" text,
	"setlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"linked_performer_id" uuid,
	"linked_sponsor_id" uuid,
	"linked_crew_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_registrations_type_check" CHECK ("event_registrations"."type" in ('creator','sponsor','crew')),
	CONSTRAINT "event_registrations_status_check" CHECK ("event_registrations"."status" in ('diajukan','revisi','disetujui','ditolak'))
);
--> statement-breakpoint
ALTER TABLE "event_public_finance" ADD CONSTRAINT "event_public_finance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_public_finance" ADD CONSTRAINT "event_public_finance_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_linked_performer_id_event_performers_id_fk" FOREIGN KEY ("linked_performer_id") REFERENCES "public"."event_performers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_linked_sponsor_id_event_sponsors_id_fk" FOREIGN KEY ("linked_sponsor_id") REFERENCES "public"."event_sponsors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_linked_crew_id_event_crew_id_fk" FOREIGN KEY ("linked_crew_id") REFERENCES "public"."event_crew"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_registrations_event_idx" ON "event_registrations" USING btree ("event_id","type","status");