import { ok } from "@/lib/api-response";
import { listStaffChatThreads } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Inbox chat customer untuk kasir (polling). Daftar thread open + unread.
export async function GET() {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const threads = await listStaffChatThreads();
  return ok({ threads });
}
