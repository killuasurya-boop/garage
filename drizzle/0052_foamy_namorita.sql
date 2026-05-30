CREATE TABLE "staff_shift_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"from_staff_id" uuid NOT NULL,
	"to_staff_id" uuid,
	"from_shift" text NOT NULL,
	"to_shift" text NOT NULL,
	"cash_in_drawer" integer NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending_validation' NOT NULL,
	"dispute_reason" text,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_shift_handovers" ADD CONSTRAINT "staff_shift_handovers_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_shift_handovers" ADD CONSTRAINT "staff_shift_handovers_from_staff_id_staff_profiles_id_fk" FOREIGN KEY ("from_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_shift_handovers" ADD CONSTRAINT "staff_shift_handovers_to_staff_id_staff_profiles_id_fk" FOREIGN KEY ("to_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_shift_handovers_outlet_idx" ON "staff_shift_handovers" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "staff_shift_handovers_status_idx" ON "staff_shift_handovers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_shift_handovers_created_at_idx" ON "staff_shift_handovers" USING btree ("created_at");