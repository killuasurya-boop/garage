import { fail, ok } from "@/lib/api-response";
import { createDbBackup, listBackups, offsiteDir, readOffsiteStatus } from "@/lib/garage-db-backup";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

// Daftar backup database terbaru.
export async function GET() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const [backups, copyToDir, offsite] = await Promise.all([listBackups(), offsiteDir(), readOffsiteStatus()]);
  return ok(
    { backups: backups.slice(0, 10), offsite: { dir: copyToDir, last: offsite } },
    { headers: { "cache-control": "no-store" } },
  );
}

// Backup manual sekarang (mis. sebelum gajian besar).
export async function POST() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  try {
    const backup = await createDbBackup("manual");
    if (!backup) return fail(400, "BACKUP_UNSUPPORTED", "Backup otomatis hanya untuk database lokal (PGlite).");
    return ok(backup, { status: 201 });
  } catch (err) {
    return fail(500, "BACKUP_FAILED", (err as Error).message);
  }
}
