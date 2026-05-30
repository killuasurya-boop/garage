import fs from "fs";
import path from "path";
import type pg from "pg";

import { ensureDatabaseReady, getDatabaseDriver, getPgPool } from "./index";
import type { PGlite } from "@electric-sql/pglite";

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

async function run() {
  await ensureDatabaseReady();
  const driver = getDatabaseDriver();
  console.log(`Running migrations via ${driver}...`);
  const client = getPgPool();
  
  try {
    const files = fs.readdirSync("./drizzle").filter(f => f.endsWith(".sql")).sort();
    for (const file of files) {
      console.log(`Applying ${file}...`);
      const sqlContent = fs.readFileSync(path.join("./drizzle", file), "utf8");
      const statements = sqlContent.split("--> statement-breakpoint").filter(s => s.trim().length > 0);
      
      for (const statement of statements) {
        await runStatement(client, driver, statement);
      }
    }
    console.log("Migrations applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    // Pool punya .end(); PGlite punya .close(). Narrow runtime-safe.
    if ("end" in client && typeof client.end === "function") {
      await client.end();
    } else if ("close" in client && typeof (client as { close: () => Promise<void> }).close === "function") {
      await (client as { close: () => Promise<void> }).close();
    }
  }
}

run();
