CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"target_role" text DEFAULT 'All' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_outlet_idx" ON "announcements" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "staff_advances_staff_idx" ON "staff_advances" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_advances_period_idx" ON "staff_advances" USING btree ("period");--> statement-breakpoint
CREATE INDEX "staff_advances_status_idx" ON "staff_advances" USING btree ("status");