import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diset di .env.local");
  process.exit(1);
}

const sql = `
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "customers_expires_at_idx" ON "customers" USING btree ("expires_at");
`;

async function main() {
  const pool = new Pool({ connectionString: url });
  try {
    console.log("Applying migration: customers.expires_at …");
    await pool.query(sql);
    const inspect = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'customers' AND column_name = 'expires_at';`,
    );
    console.table(inspect.rows);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration gagal:", err);
  process.exit(1);
});
