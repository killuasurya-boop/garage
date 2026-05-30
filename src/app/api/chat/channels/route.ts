import { z } from "zod";

import { ok, readJson, fail } from "@/lib/api-response";
import {
  ensureUserAutoChannels,
  getOrCreateDirectChannel,
  listUserChannels,
} from "@/lib/chat-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  // Pastikan user terdaftar di channel global + role channel
  await ensureUserAutoChannels(session.data.user.id, session.data.profile.role);

  const channels = await listUserChannels(session.data.user.id);
  return ok({ channels });
}

const createSchema = z.object({
  type: z.literal("direct"),
  peerUserId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  if (body.data.peerUserId === session.data.user.id) {
    return fail(400, "INVALID_PEER", "Tidak bisa DM diri sendiri.");
  }

  try {
    const channelId = await getOrCreateDirectChannel(
      session.data.user.id,
      body.data.peerUserId,
    );
    return ok({ channelId });
  } catch (err) {
    return fail(400, "CHAT_ERROR", err instanceof Error ? err.message : "Gagal membuat DM.");
  }
}
