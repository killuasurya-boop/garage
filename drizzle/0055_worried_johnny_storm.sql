CREATE TABLE "compliance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"ref_number" text,
	"issued_at" date,
	"expires_at" date,
	"reminder_days" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"attachment_url" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "password_reset_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_items_outlet_idx" ON "compliance_items" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "compliance_items_category_idx" ON "compliance_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "compliance_items_expires_idx" ON "compliance_items" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "compliance_items_status_idx" ON "compliance_items" USING btree ("status");