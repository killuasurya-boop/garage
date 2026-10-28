CREATE TABLE "cash_session_final_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"report_id" text NOT NULL,
	"decision" text NOT NULL,
	"final_status" text NOT NULL,
	"summary" jsonb NOT NULL,
	"summary_hash" text NOT NULL,
	"exceptions" jsonb NOT NULL,
	"note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cash_session_final_snapshots_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
ALTER TABLE "cash_session_final_snapshots" ADD CONSTRAINT "cash_session_final_snapshots_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_final_snapshots" ADD CONSTRAINT "cash_session_final_snapshots_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_session_final_snapshots_session_version_idx" ON "cash_session_final_snapshots" USING btree ("cash_session_id","version");--> statement-breakpoint
-- Snapshot final tidak bisa diubah/dihapus (AC-F30). Pengecualian: reset grand opening dan
-- SET NULL decided_by saat akun dihapus.
CREATE OR REPLACE FUNCTION "cash_session_final_snapshots_immutable"() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('garage.cash_ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.decided_by IS NULL AND OLD.decided_by IS NOT NULL
    AND NEW.id = OLD.id AND NEW.cash_session_id = OLD.cash_session_id AND NEW.version = OLD.version
    AND NEW.report_id = OLD.report_id AND NEW.summary_hash = OLD.summary_hash AND NEW.summary = OLD.summary
    AND NEW.decision = OLD.decision AND NEW.final_status = OLD.final_status AND NEW.decided_at = OLD.decided_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Snapshot final tidak bisa diubah atau dihapus — koreksi membuat versi baru.';
END
$fn$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "cash_session_final_snapshots_immutable_trg" BEFORE UPDATE OR DELETE ON "cash_session_final_snapshots"
  FOR EACH ROW EXECUTE FUNCTION "cash_session_final_snapshots_immutable"();
