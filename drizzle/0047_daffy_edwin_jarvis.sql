CREATE TABLE "employee_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"action" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "pin_code" text;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD CONSTRAINT "employee_attendances_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendances" ADD CONSTRAINT "employee_attendances_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_attendances_staff_idx" ON "employee_attendances" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "employee_attendances_outlet_idx" ON "employee_attendances" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "employee_attendances_time_idx" ON "employee_attendances" USING btree ("timestamp");