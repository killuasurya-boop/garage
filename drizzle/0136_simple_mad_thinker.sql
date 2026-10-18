CREATE TABLE "event_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invitation_id" uuid,
	"guest_id" uuid,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"phone_normalized" text,
	"notes" text,
	"max_pax" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_enc" text NOT NULL,
	"token_ref" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"shared_at" timestamp with time zone,
	"shared_by" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"response" text NOT NULL,
	"pax" integer DEFAULT 0 NOT NULL,
	"note" text,
	"source" text DEFAULT 'guest' NOT NULL,
	"change_count" integer DEFAULT 0 NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"venue_name" text NOT NULL,
	"address" text NOT NULL,
	"maps_url" text NOT NULL,
	"contact_whatsapp" text NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"about" text,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured_on_home" boolean DEFAULT true NOT NULL,
	"rsvp_deadline" timestamp with time zone,
	"default_max_pax" integer DEFAULT 2 NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_activity_logs" ADD CONSTRAINT "event_activity_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_activity_logs" ADD CONSTRAINT "event_activity_logs_invitation_id_event_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."event_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_activity_logs" ADD CONSTRAINT "event_activity_logs_guest_id_event_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."event_guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_guest_id_event_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."event_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_invitation_id_event_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."event_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_activity_logs_event_idx" ON "event_activity_logs" USING btree ("event_id","occurred_at");--> statement-breakpoint
CREATE INDEX "event_guests_event_idx" ON "event_guests" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_guests_event_phone_unique" ON "event_guests" USING btree ("event_id","phone_normalized") WHERE "event_guests"."phone_normalized" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_token_hash_unique" ON "event_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_active_guest_unique" ON "event_invitations" USING btree ("guest_id") WHERE "event_invitations"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "event_invitations_event_idx" ON "event_invitations" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvps_invitation_unique" ON "event_rsvps" USING btree ("invitation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
-- Data awal Grand Opening (PRD Lampiran B, fakta terkonfirmasi owner). Status draft: owner menerbitkan setelah UAT.
INSERT INTO "events" ("slug", "title", "tagline", "starts_at", "ends_at", "timezone", "venue_name", "address", "maps_url", "contact_whatsapp", "highlights", "status", "featured_on_home", "rsvp_deadline", "default_max_pax")
VALUES ('grand-opening', 'Grand Opening Garage Coffee', NULL, '2026-10-24T15:00:00+07:00', '2026-10-24T23:00:00+07:00', 'Asia/Jakarta', 'Garage Coffee', 'Jl. Mayjen Sutoyo, Rambung, Kec. Tebing Tinggi Kota, Kota Tebing Tinggi, Sumatera Utara 20631', 'https://maps.app.goo.gl/vRtbhd7KdMhqm9Kw9?g_st=ac', '6285121552341', '["Live Music", "Diskoyoks"]'::jsonb, 'draft', true, '2026-10-24T15:00:00+07:00', 2)
ON CONFLICT ("slug") DO NOTHING;
