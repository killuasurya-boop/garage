ALTER TABLE "petty_cash_entries" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD COLUMN "paid_by" text;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD COLUMN "ledger_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD COLUMN "reversal_ledger_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD COLUMN "fund_source" text;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD COLUMN "self_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Entri petty cash lama yang sudah disetujui = uangnya sudah bergerak (aturan lama):
-- tandai dibayar saat disetujui & catat di buku kas akun petty dengan waktu entri
-- aslinya, supaya saldo historis tetap sama. Entri dibatalkan/ditolak tidak dicatat.
INSERT INTO "cash_ledger_entries" ("idempotency_key", "request_hash", "occurred_at", "business_date", "outlet_id",
  "from_account", "to_account", "amount", "source_type", "source_id", "source_ref", "note")
SELECT 'petty_legacy:' || e."id", 'legacy', e."entry_at", to_char(e."entry_at" AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'), e."outlet_id",
  CASE WHEN e."type" = 'expense' OR (e."type" = 'adjustment' AND e."amount" < 0) THEN 'petty' ELSE 'external' END,
  CASE WHEN e."type" = 'expense' OR (e."type" = 'adjustment' AND e."amount" < 0) THEN 'external' ELSE 'petty' END,
  abs(e."amount"),
  CASE e."type" WHEN 'topup' THEN 'petty_topup' WHEN 'expense' THEN 'petty_expense' ELSE 'petty_adjustment' END,
  e."id"::text, e."entry_no", 'Entri petty cash sebelum buku kas'
FROM "petty_cash_entries" e
WHERE e."status" = 'approved' AND e."amount" <> 0
ON CONFLICT ("idempotency_key") DO NOTHING;--> statement-breakpoint
UPDATE "petty_cash_entries" e
SET "paid_at" = coalesce(e."approved_at", e."entry_at"), "paid_by" = e."approved_by", "ledger_entry_id" = l."id"
FROM "cash_ledger_entries" l
WHERE l."idempotency_key" = 'petty_legacy:' || e."id" AND e."paid_at" IS NULL;
