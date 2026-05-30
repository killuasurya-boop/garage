import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { listChannelMessages, sendChatMessage } from "@/lib/chat-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  body: z.string().max(4000).optional().default(""),
  attachmentUrl: z.string().url().optional().nullable(),
  attachmentType: z.string().max(80).optional().nullable(),
  attachmentSize: z.number().int().min(0).max(50_000_000).optional().nullable(),
  replyToId: z.string().uuid().optional().nullable(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const { id } = await params;
  const url = new URL(request.url);
  const before = url.searchParams.get("before") ?? undefined;
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : undefined;

  try {
    const messages = await listChannelMessages(id, session.data.user.id, {
      before,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return ok({ messages });
  } catch (err) {
    return fail(403, "CHAT_FORBIDDEN", err instanceof Error ? err.message : "Akses ditolak.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const { id } = await params;
  const body = await readJson(request, sendSchema);
  if (body.error) return body.error;

  try {
    const message = await sendChatMessage(id, session.data.user.id, body.data);
    return ok({ message });
  } catch (err) {
    return fail(400, "CHAT_ERROR", err instanceof Error ? err.message : "Gagal mengirim pesan.");
  }
}
