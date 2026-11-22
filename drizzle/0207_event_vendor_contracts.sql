CREATE TABLE "event_vendor_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"budget_line_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"pic" text,
	"phone" text,
	"value" integer DEFAULT 0 NOT NULL,
	"terms" text,
	"due_date" date,
	"status" text DEFAULT 'aktif' NOT NULL,
	"done_note" text,
	"cancel_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_vendor_contracts_value_check" CHECK ("event_vendor_contracts"."value" >= 0),
	CONSTRAINT "event_vendor_contracts_status_check" CHECK ("event_vendor_contracts"."status" in ('aktif','selesai','batal'))
);
--> statement-breakpoint
ALTER TABLE "event_vendor_contracts" ADD CONSTRAINT "event_vendor_contracts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_vendor_contracts" ADD CONSTRAINT "event_vendor_contracts_budget_line_id_event_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."event_budget_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_vendor_contracts" ADD CONSTRAINT "event_vendor_contracts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_vendor_contracts_event_idx" ON "event_vendor_contracts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_vendor_contracts_line_idx" ON "event_vendor_contracts" USING btree ("budget_line_id");