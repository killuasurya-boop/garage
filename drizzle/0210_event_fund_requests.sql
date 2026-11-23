CREATE TABLE "event_fund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"amount" integer NOT NULL,
	"party" text DEFAULT '' NOT NULL,
	"budget_code" text,
	"pay_kind" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"proof_file" text,
	"status" text DEFAULT 'diajukan' NOT NULL,
	"submitted_by" text,
	"submitted_by_name" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_fund_requests_kind_check" CHECK ("event_fund_requests"."kind" in ('masuk','keluar')),
	CONSTRAINT "event_fund_requests_status_check" CHECK ("event_fund_requests"."status" in ('diajukan','disahkan','ditolak')),
	CONSTRAINT "event_fund_requests_amount_check" CHECK ("event_fund_requests"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "event_fund_requests" ADD CONSTRAINT "event_fund_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_fund_requests" ADD CONSTRAINT "event_fund_requests_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_fund_requests" ADD CONSTRAINT "event_fund_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_fund_requests_event_idx" ON "event_fund_requests" USING btree ("event_id","status");