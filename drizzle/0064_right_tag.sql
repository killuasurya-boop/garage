CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text NOT NULL,
	"domicile" text NOT NULL,
	"birth_date" date,
	"gender" text,
	"applied_position" text NOT NULL,
	"preferred_location" text,
	"available_start_date" date,
	"willing_shift" boolean DEFAULT false NOT NULL,
	"willing_relocate" boolean DEFAULT false NOT NULL,
	"education" text,
	"last_experience" text,
	"experience_duration" text,
	"previous_company" text,
	"resign_reason" text,
	"main_skill" text,
	"strength" text,
	"weakness" text,
	"motivation" text,
	"customer_experience" text,
	"expected_salary" integer,
	"interview_availability" text,
	"cv_url" text,
	"photo_url" text,
	"portfolio_url" text,
	"social_media_url" text,
	"status" text DEFAULT 'New Applicant' NOT NULL,
	"score" integer,
	"notes" text,
	"assigned_to" text,
	"follow_up_date" date,
	"final_decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "candidates_status_idx" ON "candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidates_position_idx" ON "candidates" USING btree ("applied_position");--> statement-breakpoint
CREATE INDEX "candidates_location_idx" ON "candidates" USING btree ("preferred_location");--> statement-breakpoint
CREATE INDEX "candidates_created_idx" ON "candidates" USING btree ("created_at");