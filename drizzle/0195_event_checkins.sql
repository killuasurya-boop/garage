CREATE TABLE "event_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invitation_id" uuid,
	"guest_id" uuid,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"guest_name" text,
	"pax" integer NOT NULL,
	"note" text,
	"client_key" text,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_by" text,
	"checked_in_by_name" text,
	"undone_at" timestamp with time zone,
	"undone_by" text,
	"undo_reason" text,
	CONSTRAINT "event_checkins_pax_check" CHECK ("event_checkins"."pax" > 0 and "event_checkins"."pax" <= 50)
);
--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_invitation_id_event_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."event_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_guest_id_event_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."event_guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_checked_in_by_user_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_checkins" ADD CONSTRAINT "event_checkins_undone_by_user_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_checkins_event_idx" ON "event_checkins" USING btree ("event_id","checked_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_checkins_client_key_idx" ON "event_checkins" USING btree ("client_key") WHERE client_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_checkins_active_invitation_idx" ON "event_checkins" USING btree ("invitation_id") WHERE undone_at is null and invitation_id is not null;