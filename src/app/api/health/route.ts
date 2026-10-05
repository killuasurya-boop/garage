import { sql } from "drizzle-orm";

import { ensureDatabaseReady, getDatabaseDriver, isDatabaseConfigured } from "@/db";
import { fail, ok } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  if (!isDatabaseConfigured()) {
    // Production tanpa DATABASE_URL = salah konfigurasi → 503 agar health check
    // deploy gagal & rollback. Dev/PC lokal tetap 200 supaya layar login bisa
    // menampilkan status "belum dikonfigurasi".
    if (process.env.NODE_ENV === "production") {
      return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum diatur.");
    }
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
    // Detail error (host, user, dll.) hanya ke log server, bukan ke publik.
    console.error("[health] database check failed:", error);
    return fail(503, "DATABASE_UNREACHABLE", "Database tidak dapat dijangkau.");
  }
}
