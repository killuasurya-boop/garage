import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diset di .env.local");
  process.exit(1);
}

const sql = `
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "photo_url" text;
`;

async function main() {
  const pool = new Pool({ connectionString: url });
  try {
    console.log("Applying migration: customers.address, customers.photo_url …");
    const result = await pool.query(sql);
    console.log("OK", Array.isArray(result) ? `(${result.length} stmts)` : "");

    const inspect = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'customers' AND column_name IN ('address', 'photo_url')
       ORDER BY column_name;`,
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
