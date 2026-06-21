import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  forwardCustomerChatToWaiter,
  getStaffChatThread,
  postStaffChatMessage,
  resolveCustomerChatThread,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET: buka thread + tandai dibaca oleh kasir.
export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const { threadId } = await context.params;
  const thread = await getStaffChatThread(threadId, { markRead: true });
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
    const res = await forwardCustomerChatToWaiter(threadId, userId);
    if (!res) return fail(404, "THREAD_NOT_FOUND", "Percakapan tidak ditemukan.");
    return ok(res);
  }

  const msg = await postStaffChatMessage({ threadId, userId, body: data.body });
  if (!msg) return fail(400, "CHAT_SEND_FAILED", "Pesan gagal dikirim.");
  return ok(msg, { status: 201 });
}
