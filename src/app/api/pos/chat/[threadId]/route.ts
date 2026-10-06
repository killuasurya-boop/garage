import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  ChatForwardError,
  forwardCustomerChatToWaiter,
  getStaffChatThread,
  postStaffChatMessage,
  resolveCustomerChatThread,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// GET: buka thread + tandai dibaca oleh kasir.
export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const { threadId } = await context.params;
  if (!isUuid(threadId)) return fail(400, "INVALID_THREAD", "ID percakapan tidak valid.");
  const afterId = new URL(request.url).searchParams.get("afterId")?.trim() || undefined;
  const thread = await getStaffChatThread(threadId, { markRead: true, afterId });
  if (!thread) return fail(404, "THREAD_NOT_FOUND", "Percakapan tidak ditemukan.");
  return ok(thread);
}

const actionSchema = z.union([
  z.object({ body: z.string().trim().min(1, "Pesan kosong.").max(500) }),
  z.object({ action: z.enum(["resolve", "forward"]) }),
]);

// POST: balas pesan, atau aksi resolve / forward (teruskan ke waiter).
export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const { threadId } = await context.params;
  if (!isUuid(threadId)) return fail(400, "INVALID_THREAD", "ID percakapan tidak valid.");
  const parsed = await readJson(request, actionSchema);
  if (parsed.error) return parsed.error;
  const userId = session.data.user.id;
  const data = parsed.data;

  if ("action" in data) {
    if (data.action === "resolve") {
      const res = await resolveCustomerChatThread(threadId, userId);
      if (!res) return fail(404, "THREAD_NOT_FOUND", "Percakapan tidak ditemukan.");
      return ok(res);
    }
    try {
      const res = await forwardCustomerChatToWaiter(threadId, userId);
      if (!res) return fail(404, "THREAD_NOT_FOUND", "Percakapan tidak ditemukan.");
      return ok(res);
    } catch (error) {
      if (error instanceof ChatForwardError) return fail(400, "FORWARD_NOT_ALLOWED", error.message);
      throw error;
    }
  }

  const msg = await postStaffChatMessage({ threadId, userId, body: data.body });
  if (!msg) return fail(404, "THREAD_NOT_FOUND", "Percakapan tidak ditemukan.");
  return ok(msg, { status: 201 });
}
