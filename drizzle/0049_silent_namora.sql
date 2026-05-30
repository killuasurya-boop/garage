CREATE TABLE "staff_payrolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"period" text NOT NULL,
	"base_salary" integer NOT NULL,
	"allowance" integer NOT NULL,
	"bonus" integer DEFAULT 0 NOT NULL,
	"deduction" integer DEFAULT 0 NOT NULL,
	"net_salary" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_salaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"base_salary" integer NOT NULL,
	"allowance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_payrolls" ADD CONSTRAINT "staff_payrolls_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salaries" ADD CONSTRAINT "staff_salaries_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_payrolls_staff_idx" ON "staff_payrolls" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_payrolls_period_idx" ON "staff_payrolls" USING btree ("period");--> statement-breakpoint
CREATE INDEX "staff_payrolls_status_idx" ON "staff_payrolls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_salaries_staff_idx" ON "staff_salaries" USING btree ("staff_id");