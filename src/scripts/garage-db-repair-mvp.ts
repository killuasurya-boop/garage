/**
 * Repairs schema drift blocking Final MVP seed (payments.cash_session_id).
 * Safe to run multiple times — skips when column already exists.
 */
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const sql = `
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cash_session_id" uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_cash_session_id_cash_sessions_id_fk'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_cash_session_id_cash_sessions_id_fk"
      FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "payments_cash_session_id_idx" ON "payments" USING btree ("cash_session_id");
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString });
  try {
    await pool.query(sql);
    console.log("OK payments.cash_session_id repair applied (or already present).");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
