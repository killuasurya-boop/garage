import { ok } from "@/lib/api-response";
import { rebuildFinanceSnapshots } from "@/lib/finance-control";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hitung ulang snapshot harian otomatis (snapshot "locked" tidak disentuh).
export async function POST() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) {
    return session.response;
  }
  return ok(await rebuildFinanceSnapshots());
}
