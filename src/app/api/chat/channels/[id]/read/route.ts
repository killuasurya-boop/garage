import { fail, ok } from "@/lib/api-response";
import { markChannelRead } from "@/lib/chat-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const { id } = await params;
  try {
    await markChannelRead(id, session.data.user.id);
    return ok({ status: "ok" });
  } catch (err) {
    return fail(403, "CHAT_FORBIDDEN", err instanceof Error ? err.message : "Akses ditolak.");
  }
}
