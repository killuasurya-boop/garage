CREATE TABLE "event_ops_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"pic" text,
	"note" text,
	"done_at" timestamp with time zone,
	"done_by" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"rating" integer,
	"highlights" text,
	"issues" text,
	"incidents" text,
	"next_time" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_reviews_rating_check" CHECK ("event_reviews"."rating" is null or ("event_reviews"."rating" between 1 and 5))
);
--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "hospitality" text;--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "contract_url" text;--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "schedule_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_sponsor_obligations" ADD COLUMN "slot_performer_id" uuid;--> statement-breakpoint
ALTER TABLE "event_ops_checks" ADD CONSTRAINT "event_ops_checks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ops_checks" ADD CONSTRAINT "event_ops_checks_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reviews" ADD CONSTRAINT "event_reviews_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reviews" ADD CONSTRAINT "event_reviews_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_ops_checks_event_key_idx" ON "event_ops_checks" USING btree ("event_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "event_reviews_event_idx" ON "event_reviews" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "event_sponsor_obligations" ADD CONSTRAINT "event_sponsor_obligations_slot_performer_id_event_performers_id_fk" FOREIGN KEY ("slot_performer_id") REFERENCES "public"."event_performers"("id") ON DELETE set null ON UPDATE no action;