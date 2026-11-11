CREATE TABLE "partner_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_no" text NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text,
	"city" text,
	"address" text,
	"product_kind" text NOT NULL,
	"instagram" text,
	"legality" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivery_mode" text,
	"operating_hours" text,
	"message" text,
	"status" text DEFAULT 'baru' NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"partner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_applications_no_idx" ON "partner_applications" USING btree ("application_no");--> statement-breakpoint
CREATE INDEX "partner_applications_status_idx" ON "partner_applications" USING btree ("status","created_at");