CREATE TABLE "cash_session_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"denominations" jsonb NOT NULL,
	"total" integer NOT NULL,
	"counted_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_up_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"subject_id" text NOT NULL,
	"summary_hash" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"code_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "final_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "final_decided_by" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "final_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "final_note" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "final_summary_hash" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "final_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_session_counts" ADD CONSTRAINT "cash_session_counts_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_counts" ADD CONSTRAINT "cash_session_counts_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_up_challenges" ADD CONSTRAINT "step_up_challenges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_session_counts_session_idx" ON "cash_session_counts" USING btree ("cash_session_id","created_at");--> statement-breakpoint
CREATE INDEX "step_up_challenges_user_idx" ON "step_up_challenges" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_final_decided_by_user_id_fk" FOREIGN KEY ("final_decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Hitungan laci tidak bisa diubah/dihapus (PRD §10.8 penguncian). Pengecualian: reset grand
-- opening (garage.cash_ledger_purge = 'on') dan SET NULL counted_by saat akun dihapus.
CREATE OR REPLACE FUNCTION "cash_session_counts_immutable"() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('garage.cash_ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.counted_by IS NULL AND OLD.counted_by IS NOT NULL
    AND NEW.id = OLD.id AND NEW.cash_session_id = OLD.cash_session_id AND NEW.kind = OLD.kind
    AND NEW.denominations = OLD.denominations AND NEW.total = OLD.total
    AND NEW.note IS NOT DISTINCT FROM OLD.note AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Hitungan laci tidak bisa diubah atau dihapus — catat hitungan baru.';
END
$fn$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "cash_session_counts_immutable_trg" BEFORE UPDATE OR DELETE ON "cash_session_counts"
  FOR EACH ROW EXECUTE FUNCTION "cash_session_counts_immutable"();--> statement-breakpoint
-- Shift yang sudah ditutup sebelum B4 tidak masuk antrean final Owner.
UPDATE "cash_sessions" SET "final_status" = 'legacy' WHERE "status" = 'closed' AND "final_status" = 'pending';
