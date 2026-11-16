CREATE TABLE "event_sponsor_inkind" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"item" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit" text,
	"estimated_value" integer DEFAULT 0 NOT NULL,
	"received_at" date,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_sponsor_inkind_qty_check" CHECK ("event_sponsor_inkind"."qty" > 0 and "event_sponsor_inkind"."estimated_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_sponsor_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_sponsor_installments_amount_check" CHECK ("event_sponsor_installments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "event_sponsor_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"done_at" timestamp with time zone,
	"done_by" text,
	"done_note" text,
	"proof_path" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sponsor_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"reference" text NOT NULL,
	"proof_path" text,
	"note" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"void_reason" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_sponsor_payments_amount_check" CHECK ("event_sponsor_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "event_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_no" text NOT NULL,
	"outlet_id" uuid,
	"event_id" uuid,
	"event_name" text NOT NULL,
	"event_date" date,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"package_name" text,
	"agreed_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"notes" text,
	"cancel_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_sponsors_agreed_check" CHECK ("event_sponsors"."agreed_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "event_sponsor_inkind" ADD CONSTRAINT "event_sponsor_inkind_sponsor_id_event_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."event_sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_inkind" ADD CONSTRAINT "event_sponsor_inkind_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_installments" ADD CONSTRAINT "event_sponsor_installments_sponsor_id_event_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."event_sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_obligations" ADD CONSTRAINT "event_sponsor_obligations_sponsor_id_event_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."event_sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_obligations" ADD CONSTRAINT "event_sponsor_obligations_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_payments" ADD CONSTRAINT "event_sponsor_payments_sponsor_id_event_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."event_sponsors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_payments" ADD CONSTRAINT "event_sponsor_payments_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsor_payments" ADD CONSTRAINT "event_sponsor_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_sponsor_inkind_sponsor_idx" ON "event_sponsor_inkind" USING btree ("sponsor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sponsor_installments_seq_idx" ON "event_sponsor_installments" USING btree ("sponsor_id","seq");--> statement-breakpoint
CREATE INDEX "event_sponsor_obligations_sponsor_idx" ON "event_sponsor_obligations" USING btree ("sponsor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sponsor_payments_idem_idx" ON "event_sponsor_payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sponsor_payments_ref_idx" ON "event_sponsor_payments" USING btree ("reference") WHERE status = 'posted';--> statement-breakpoint
CREATE INDEX "event_sponsor_payments_sponsor_idx" ON "event_sponsor_payments" USING btree ("sponsor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sponsors_no_idx" ON "event_sponsors" USING btree ("sponsor_no");--> statement-breakpoint
CREATE INDEX "event_sponsors_event_idx" ON "event_sponsors" USING btree ("event_name");