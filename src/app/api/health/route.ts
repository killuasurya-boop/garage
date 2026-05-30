import { sql } from "drizzle-orm";

import { ensureDatabaseReady, getDatabaseDriver, isDatabaseConfigured } from "@/db";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return ok({
      ok: false,
      database: {
        configured: false,
        status: "missing DATABASE_URL",
      },
    });
  }

  try {
    const db = await ensureDatabaseReady();
    const driver = getDatabaseDriver();
    await db.execute(sql`select 1`);

    return ok({
      ok: true,
      database: {
        configured: true,
        status: driver === "pglite" ? "reachable (local PGlite)" : "reachable",
        driver,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database health check failed.";

    return fail(503, "DATABASE_UNREACHABLE", message);
  }
}
