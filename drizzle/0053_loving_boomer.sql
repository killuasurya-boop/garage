ALTER TABLE "employee_attendances" ADD COLUMN "latitude" real;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD COLUMN "longitude" real;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD COLUMN "distance_meters" real;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD COLUMN "status" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD CONSTRAINT "employee_attendances_schedule_id_shift_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."shift_schedules"("id") ON DELETE set null ON UPDATE no action;