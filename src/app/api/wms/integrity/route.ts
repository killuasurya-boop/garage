import { fail, ok } from "@/lib/api-response";
import { fixWmsBatchIntegrity, getWmsBatchIntegrity } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Selisih Σ batch vs saldo per ruang (cek integritas ledger). Owner/Manajer. */
export async function GET() {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  return ok(await getWmsBatchIntegrity());
}

/** Samakan batch dengan saldo (tanpa mengubah saldo). Owner saja. */
export async function POST() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  try {
    const actorName = `${session.data.user.name} / ${session.data.profile.role}`;
    return ok(await fixWmsBatchIntegrity({ userId: session.data.user.id, actorName }));
  } catch (e) {
    return fail(400, "WMS_INTEGRITY_FIX_FAILED", e instanceof Error ? e.message : "Gagal menyamakan batch.");
  }
}
