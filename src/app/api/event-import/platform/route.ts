import { fail, ok, readJson } from "@/lib/api-response";
import { importFromPlatformDashboard, PlatformImportError, platformImportSchema } from "@/lib/platform-import-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/**
 * Impor data Dashboard Penyelenggara platform GIGS (Owner, login langsung). `dryRun: true` = pratinjau tanpa menulis.
 * Buku dana SAH → Transparansi (bukan buku kas), kontrak → Kontrak vendor, log → Kejadian Hari-H. Impor ulang aman.
 */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, platformImportSchema);
  if (body.error) return body.error;
  try {
    return ok(await importFromPlatformDashboard(body.data, session.data));
  } catch (error) {
    if (error instanceof PlatformImportError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
