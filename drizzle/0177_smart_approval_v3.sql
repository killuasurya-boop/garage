ALTER TABLE "approvals" ADD COLUMN "outlet_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "amount_value" integer;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "execution_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "execution_error" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "execution_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "executed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "decision_snapshot_hash" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "review_state" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "review_by" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_review_by_user_id_fk" FOREIGN KEY ("review_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_status_outlet_idx" ON "approvals" USING btree ("status","outlet_id");--> statement-breakpoint
-- Backfill (tanpa menghapus/mengubah keputusan lama): nominal angka untuk kategori uang,
-- outlet dari objek yang ditautkan, dan pengajuan yang sudah diputus = execution_status 'legacy'.
UPDATE "approvals" SET "amount_value" = NULLIF(regexp_replace("amount", '[^0-9]', '', 'g'), '')::bigint
WHERE "amount_value" IS NULL
  AND ("id" LIKE 'APP-VOID-%' OR "id" LIKE 'APP-RFD-%' OR "id" LIKE 'APP-DISC-%' OR "id" LIKE 'APP-EXP-%'
       OR "id" LIKE 'APP-CASH-%' OR "id" LIKE 'APP-PCX-%')
  AND length(regexp_replace("amount", '[^0-9]', '', 'g')) BETWEEN 1 AND 9;--> statement-breakpoint
UPDATE "approvals" a SET "outlet_id" = o."outlet_id" FROM "orders" o
WHERE a."outlet_id" IS NULL AND o."id"::text = a."payload"->>'orderId';--> statement-breakpoint
UPDATE "approvals" a SET "outlet_id" = c."outlet_id" FROM "cash_sessions" c
WHERE a."outlet_id" IS NULL AND c."id"::text = a."payload"->>'cashSessionId';--> statement-breakpoint
UPDATE "approvals" a SET "outlet_id" = e."outlet_id" FROM "expenses" e
WHERE a."outlet_id" IS NULL AND e."id"::text = a."payload"->>'expenseId';--> statement-breakpoint
UPDATE "approvals" SET "execution_status" = 'legacy' WHERE "status" <> 'pending';
