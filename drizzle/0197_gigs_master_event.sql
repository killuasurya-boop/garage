ALTER TABLE "event_crew" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "event_crew_tasks" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "platform_slug" text;--> statement-breakpoint
ALTER TABLE "event_crew" ADD CONSTRAINT "event_crew_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_crew_tasks" ADD CONSTRAINT "event_crew_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_performers" ADD CONSTRAINT "event_performers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_crew_event_id_idx" ON "event_crew" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_crew_tasks_event_id_idx" ON "event_crew_tasks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_performers_event_id_idx" ON "event_performers" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_platform_slug_unique" ON "events" USING btree ("platform_slug") WHERE "events"."platform_slug" IS NOT NULL;--> statement-breakpoint
-- Backfill: data lama (sponsor/lineup/panitia/tugas) yang nama eventnya sama persis (tanpa peduli huruf) dengan satu judul master event.
UPDATE "event_performers" p SET "event_id" = e."id" FROM "events" e WHERE p."event_id" IS NULL AND lower(trim(p."event_name")) = lower(trim(e."title")) AND (SELECT count(*) FROM "events" e2 WHERE lower(trim(e2."title")) = lower(trim(e."title"))) = 1;--> statement-breakpoint
UPDATE "event_crew" c SET "event_id" = e."id" FROM "events" e WHERE c."event_id" IS NULL AND lower(trim(c."event_name")) = lower(trim(e."title")) AND (SELECT count(*) FROM "events" e2 WHERE lower(trim(e2."title")) = lower(trim(e."title"))) = 1;--> statement-breakpoint
UPDATE "event_crew_tasks" t SET "event_id" = e."id" FROM "events" e WHERE t."event_id" IS NULL AND lower(trim(t."event_name")) = lower(trim(e."title")) AND (SELECT count(*) FROM "events" e2 WHERE lower(trim(e2."title")) = lower(trim(e."title"))) = 1;--> statement-breakpoint
UPDATE "event_sponsors" s SET "event_id" = e."id" FROM "events" e WHERE s."event_id" IS NULL AND lower(trim(s."event_name")) = lower(trim(e."title")) AND (SELECT count(*) FROM "events" e2 WHERE lower(trim(e2."title")) = lower(trim(e."title"))) = 1;
