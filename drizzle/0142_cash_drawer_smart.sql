ALTER TABLE "cash_movements" ADD COLUMN "ref_no" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "category_key" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "cash_group" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "vendor_name" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "receipt_no" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "order_no" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "employee_user_id" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "related_movement_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "corrects_movement_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "balance_before" integer;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "balance_after" integer;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "effects" jsonb;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "rejected_by" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_employee_user_id_user_id_fk" FOREIGN KEY ("employee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_movements_outlet_ref_idx" ON "cash_movements" USING btree ("outlet_id","ref_no");--> statement-breakpoint
CREATE INDEX "cash_movements_status_idx" ON "cash_movements" USING btree ("status");