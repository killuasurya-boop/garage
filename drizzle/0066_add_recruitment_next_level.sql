ALTER TABLE "candidates" ADD COLUMN "interview_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "interview_link" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "cv_parsed_data" jsonb;