CREATE TABLE "staff_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"phone" text NOT NULL,
	"requested_position" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending_owner_approval' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"whatsapp_verified" boolean DEFAULT false NOT NULL,
	"info_request" text,
	"decision_reason" text,
	"approved_role" text,
	"approved_outlet_id" uuid,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_access_requests" ADD CONSTRAINT "staff_access_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_access_requests" ADD CONSTRAINT "staff_access_requests_approved_outlet_id_outlets_id_fk" FOREIGN KEY ("approved_outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_access_requests" ADD CONSTRAINT "staff_access_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_access_requests_user_idx" ON "staff_access_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_access_requests_status_idx" ON "staff_access_requests" USING btree ("status","created_at");