ALTER TABLE "event_crew" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "event_crew" ADD CONSTRAINT "event_crew_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_crew_user_idx" ON "event_crew" USING btree ("user_id");