CREATE TABLE "event_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invitation_id" uuid,
	"guest_name" text NOT NULL,
	"pax" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"void_reason" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_checkins_pax_check" CHECK ("event_checkins"."pax" > 0 and "event_checkins"."pax" <= 50),
	CONSTRAINT "event_checkins_kind_check" CHECK ("event_checkins"."kind" in ('undangan','walkin')),
	CONSTRAINT "event_checkins_status_check" CHECK ("event_checkins"."status" in ('aktif','batal'))
);
--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "actual_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "actual_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_invitation_id_event_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."event_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_checked_by_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_checkins_event_idx" ON "event_checkins" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_checkins_invitation_idx" ON "event_checkins" USING btree ("invitation_id");