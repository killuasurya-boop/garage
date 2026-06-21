import { getDb, ensureDatabaseReady } from "@/db";
import { recruitmentPositions } from "@/db/schema";

async function main() {
  await ensureDatabaseReady();
  const db = getDb();
  
  try {
    const existing = await db.select({ id: recruitmentPositions.id }).from(recruitmentPositions).limit(1);
    console.log("SUKSES: Tabel recruitment_positions terbaca. Hasil:", existing);
  } catch (e) {
    console.error("ERROR 1 (recruitment_positions):", e);
  }

  try {
    const result = await db.execute(`SELECT 1 FROM ai_provider_configs LIMIT 1`);
    console.log("SUKSES: Tabel ai_provider_configs terbaca.");
  } catch(e) {
    console.error("ERROR 2 (ai_provider_configs):", e);
  }

  process.exit(0);
}

main();
