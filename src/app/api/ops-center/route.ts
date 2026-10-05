import { fail } from "@/lib/api-response";
import { okWithEtag } from "@/lib/http-etag";
import { getOpsCenter } from "@/lib/ops-center";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Garage Control Center — dilihat semua staf aktif (tanpa nominal uang).
export async function GET(request: Request) {
  const session = await requireGarageSession();
  if (session.response) {
    return session.response;
  }
  try {
    return okWithEtag(request, await getOpsCenter(session.data));
  } catch (error) {
    return fail(500, "OPS_CENTER_FAILED", error instanceof Error ? error.message : "Control Center gagal dimuat.");
  }
}
