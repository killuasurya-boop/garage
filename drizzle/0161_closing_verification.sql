ALTER TABLE "cash_movements" ADD COLUMN "deposit_account" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "deposit_confirmed_by" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "deposit_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "deposit_bank_ref" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "deposit_ledger_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "count_skipped_reason" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "recount_cash" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "recount_denominations" jsonb;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "recount_by" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "recount_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "discrepancy_acknowledged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "review_self_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_deposit_confirmed_by_user_id_fk" FOREIGN KEY ("deposit_confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_recount_by_user_id_fk" FOREIGN KEY ("recount_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Setoran ke rekening (owner, 25 Okt 2026): uang keluar laci masuk "dalam perjalanan"
-- dulu, baru ke Rekening Jago/BNI saat penerima mengonfirmasi bukti setor.
INSERT INTO "cash_accounts" ("code", "kind", "name") VALUES
  ('deposit_transit', 'clearing', 'Setoran dalam perjalanan')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Status selisih jujur: hanya Rp0 = "ok". Shift lama berselisih kecil (dulu "ok" s.d. Rp10.000)
-- diberi label "minor" (selisih kecil) — nominal & hitungan tidak berubah.
UPDATE "cash_sessions" SET "discrepancy_status" = 'minor'
WHERE "status" = 'closed' AND "discrepancy" <> 0 AND "discrepancy_status" = 'ok';
