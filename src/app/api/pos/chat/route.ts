import { ok } from "@/lib/api-response";
import { listStaffChatThreads } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Inbox chat customer untuk kasir. ?status=resolved → riwayat percakapan selesai.
export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const status = new URL(request.url).searchParams.get("status") === "resolved" ? "resolved" : "open";
  const threads = await listStaffChatThreads({ outletId: session.data.profile.outlet.id, status });
  return ok({ threads });
}
