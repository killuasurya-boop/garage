CREATE TABLE "cash_accounts" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_date" text NOT NULL,
	"outlet_id" uuid,
	"cash_session_id" uuid,
	"from_account" text NOT NULL,
	"to_account" text NOT NULL,
	"amount" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"source_ref" text,
	"reverses_id" uuid,
	"actor_user_id" text,
	"approver_user_id" text,
	"note" text,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "ledger_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "ledger_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "cash_source" text;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_ledger_idempotency_idx" ON "cash_ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_ledger_seq_idx" ON "cash_ledger_entries" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "cash_ledger_session_idx" ON "cash_ledger_entries" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "cash_ledger_outlet_date_idx" ON "cash_ledger_entries" USING btree ("outlet_id","business_date");--> statement-breakpoint
CREATE INDEX "cash_ledger_source_idx" ON "cash_ledger_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "cash_ledger_reverses_idx" ON "cash_ledger_entries" USING btree ("reverses_id");--> statement-breakpoint
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_amount_positive" CHECK ("amount" > 0);--> statement-breakpoint
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_accounts_differ" CHECK ("from_account" <> "to_account");--> statement-breakpoint
-- Akun uang (owner, 25 Okt 2026): laci, petty cash, Rekening Jago, Rekening BNI (QRIS),
-- QRIS belum settle, dan pihak luar (pelanggan/supplier/uang pribadi Owner).
INSERT INTO "cash_accounts" ("code", "kind", "name") VALUES
  ('drawer', 'drawer', 'Laci kasir'),
  ('petty', 'petty', 'Petty cash'),
  ('bank_jago', 'bank', 'Rekening Jago'),
  ('bank_bni', 'bank', 'Rekening BNI / QRIS BNI'),
  ('qris_clearing', 'clearing', 'QRIS belum settle'),
  ('external', 'external', 'Pihak luar (pelanggan, supplier, uang pribadi)')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_from_account_fk" FOREIGN KEY ("from_account") REFERENCES "cash_accounts"("code");--> statement-breakpoint
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_to_account_fk" FOREIGN KEY ("to_account") REFERENCES "cash_accounts"("code");--> statement-breakpoint
-- Buku kas tidak bisa diubah/dihapus: koreksi = baris pembalik. Hapus massal hanya untuk
-- reset grand opening (SET LOCAL garage.cash_ledger_purge = 'on' di transaksinya).
CREATE OR REPLACE FUNCTION "cash_ledger_immutable"() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('garage.cash_ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Buku kas tidak bisa diubah atau dihapus — catat baris pembalik.';
END
$fn$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "cash_ledger_immutable_trg" BEFORE UPDATE OR DELETE ON "cash_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "cash_ledger_immutable"();--> statement-breakpoint
-- Shift yang masih buka saat buku kas aktif: saldo laci saat itu = saldo pembuka buku.
INSERT INTO "cash_ledger_entries" ("idempotency_key", "request_hash", "business_date", "outlet_id", "cash_session_id",
  "from_account", "to_account", "amount", "source_type", "source_id", "source_ref", "note")
SELECT 'legacy_opening:' || s."id", 'legacy', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'), s."outlet_id", s."id",
  CASE WHEN s."expected_cash" >= 0 THEN 'external' ELSE 'drawer' END,
  CASE WHEN s."expected_cash" >= 0 THEN 'drawer' ELSE 'external' END,
  abs(s."expected_cash"), 'legacy_opening', s."id"::text, s."code",
  'Saldo laci saat buku kas diaktifkan (shift berjalan)'
FROM "cash_sessions" s
WHERE s."status" = 'open' AND s."expected_cash" <> 0
ON CONFLICT ("idempotency_key") DO NOTHING;--> statement-breakpoint
UPDATE "cash_sessions" SET "ledger_mode" = true WHERE "status" = 'open';
