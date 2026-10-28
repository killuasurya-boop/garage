// Owner Access Approval Center (I3, PRD V4.0 §06.6, SYS-01): daftar pengajuan.
// Data pribadi pemohon (email, WA tersamarkan) hanya untuk Owner.
import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { ACCESS_REQUEST_STATUSES, listAccessRequests, type AccessRequestStatus } from "@/lib/staff-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const status = new URL(request.url).searchParams.get("status") ?? "open";
  if (status !== "open" && status !== "all" && !(ACCESS_REQUEST_STATUSES as readonly string[]).includes(status)) {
    return fail(400, "INVALID_STATUS", "Status tidak dikenal.");
  }
  const { listOutlets } = await import("@/lib/garage-service");
  const [requests, outletRows] = await Promise.all([listAccessRequests({ status: status as AccessRequestStatus | "open" | "all" }), listOutlets()]);
  return ok({ requests, outlets: outletRows });
}
