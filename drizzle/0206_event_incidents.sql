CREATE TABLE "event_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'sedang' NOT NULL,
	"note" text NOT NULL,
	"reported_by" text,
	"reported_by_name" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_incidents_type_check" CHECK ("event_incidents"."type" in ('keamanan','kesehatan','teknis','kerumunan','cuaca','lainnya')),
	CONSTRAINT "event_incidents_severity_check" CHECK ("event_incidents"."severity" in ('rendah','sedang','tinggi'))
);
--> statement-breakpoint
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_reported_by_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_incidents_event_idx" ON "event_incidents" USING btree ("event_id","created_at");