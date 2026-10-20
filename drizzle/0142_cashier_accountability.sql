CREATE TABLE "petty_cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_no" text NOT NULL,
	"outlet_id" uuid,
	"cash_session_id" uuid,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"recipient" text,
	"receipt_no" text,
	"receipt_url" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"decision_note" text,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"entry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "petty_cash_entries_entry_no_unique" UNIQUE("entry_no")
);
--> statement-breakpoint
CREATE TABLE "shift_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"cash_session_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"order_no" text,
	"financial_impact" integer,
	"action_taken" text,
	"status" text DEFAULT 'open' NOT NULL,
	"responsible_name" text,
	"manager_note" text,
	"reported_by" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "reference_no" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "order_no" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "opening_denominations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "opening_verified_by" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "opening_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_incidents" ADD CONSTRAINT "shift_incidents_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_incidents" ADD CONSTRAINT "shift_incidents_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_incidents" ADD CONSTRAINT "shift_incidents_reported_by_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_incidents" ADD CONSTRAINT "shift_incidents_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "petty_cash_outlet_idx" ON "petty_cash_entries" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "petty_cash_session_idx" ON "petty_cash_entries" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "petty_cash_entry_at_idx" ON "petty_cash_entries" USING btree ("entry_at");--> statement-breakpoint
CREATE INDEX "shift_incidents_session_idx" ON "shift_incidents" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "shift_incidents_occurred_idx" ON "shift_incidents" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_verified_by_user_id_fk" FOREIGN KEY ("opening_verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;