import { ensureDatabaseReady, getPgPool } from "@/db";

async function main() {
  await ensureDatabaseReady();
  const pool = getPgPool() as {
    query: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
    end?: () => Promise<void>;
  };

  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='staff_shift_handovers' ORDER BY ordinal_position;`,
  );
  console.log("columns:", cols.rows.map((r) => r.column_name).join(", "));

  const constraints = await pool.query(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'staff_shift_handovers'::regclass;`,
  );
  console.log("constraints:", constraints.rows.map((r) => r.conname).join(", "));

  const indexes = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename='staff_shift_handovers';`,
  );
  console.log("indexes:", indexes.rows.map((r) => r.indexname).join(", "));

  if (pool.end) await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
