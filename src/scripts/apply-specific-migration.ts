import fs from "fs";
import path from "path";
import { ensureDatabaseReady, getDatabaseDriver, getPgPool } from "../db/index";
import type { PGlite } from "@electric-sql/pglite";
import type pg from "pg";

async function runStatement(
  client: PGlite | pg.Pool,
  driver: ReturnType<typeof getDatabaseDriver>,
  statement: string,
) {
  if (driver === "pglite") {
    await (client as PGlite).exec(statement);
    return;
  }
  await (client as pg.Pool).query(statement);
}

async function main() {
  const migrationFile = "0051_nervous_amphibian.sql";
  console.log(`Applying specific migration: ${migrationFile}`);
  
  await ensureDatabaseReady();
  const driver = getDatabaseDriver();
  console.log(`Driver: ${driver}`);
  const client = getPgPool();
  
  try {
    const sqlContent = fs.readFileSync(path.join("./drizzle", migrationFile), "utf8");
    const statements = sqlContent.split("--> statement-breakpoint").filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      console.log(`Executing statement...`);
      await runStatement(client, driver, statement);
    }
    console.log("Migration applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    if ("end" in client && typeof client.end === "function") {
      await client.end();
    } else if ("close" in client && typeof (client as { close: () => Promise<void> }).close === "function") {
      await (client as { close: () => Promise<void> }).close();
    }
  }
}

main().catch(console.error);
