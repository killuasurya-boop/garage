CREATE TABLE "cash_opening_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_key" text NOT NULL,
	"account" text NOT NULL,
	"outlet_id" uuid,
	"as_of" timestamp with time zone NOT NULL,
	"ledger_balance" integer NOT NULL,
	"counted_balance" integer NOT NULL,
	"adjustment" integer NOT NULL,
	"adjustment_entry_id" uuid,
	"legacy_entries" integer DEFAULT 0 NOT NULL,
	"legacy_total" integer DEFAULT 0 NOT NULL,
	"evidence_ref" text NOT NULL,
	"note" text,
	"certified_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cash_opening_cert_scope_idx" ON "cash_opening_certifications" USING btree ("scope_key");--> statement-breakpoint
ALTER TABLE "cash_opening_certifications" ADD CONSTRAINT "cash_opening_cert_amounts" CHECK ("counted_balance" >= 0 AND "adjustment" = "counted_balance" - "ledger_balance");--> statement-breakpoint
-- Pengesahan saldo pembuka (P6) sama dengan buku kas: tidak bisa diubah/dihapus, kecuali
-- hapus massal reset grand opening (SET LOCAL garage.cash_ledger_purge = 'on').
CREATE TRIGGER "cash_opening_cert_immutable_trg" BEFORE UPDATE OR DELETE ON "cash_opening_certifications"
  FOR EACH ROW EXECUTE FUNCTION "cash_ledger_immutable"();
