import { ensureDatabaseReady, getPgPool } from "@/db";

async function main() {
  await ensureDatabaseReady();
  const pool = getPgPool() as unknown as Record<string, unknown>;
  console.log("exec?", typeof pool.exec);
  console.log("query?", typeof pool.query);
  console.log("close?", typeof pool.close);
  console.log("waitReady?", typeof pool.waitReady);
  console.log(
    "ownProps:",
    Object.getOwnPropertyNames(pool).slice(0, 20).join(", "),
  );
}

main().catch(console.error);
