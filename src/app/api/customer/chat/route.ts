import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getCustomerChatMessages, postCustomerChatMessage } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const sendSchema = z.object({
  chatToken: z.string().trim().min(12, "Token chat tidak valid.").max(120),
  tableLabel: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1, "Pesan kosong.").max(500),
  orderId: z.string().uuid().optional(),
  memberId: z.string().trim().max(120).optional(),
});

// Kirim pesan chat dari customer (publik, tanpa login). Rate-limit ketat.
export async function POST(request: Request) {
  const limited = rateLimit(request, "customer-chat", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson(request, sendSchema);
  if (body.error) return body.error;

  const result = await postCustomerChatMessage(body.data);
  if (!result) return fail(400, "CHAT_SEND_FAILED", "Pesan gagal dikirim.");
  return ok(result, { status: 201 });
}

// Ambil pesan thread customer (polling). token = chatToken acak (kontrol akses).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const afterId = url.searchParams.get("afterId")?.trim() || undefined;
  if (token.length < 12) {
    return fail(400, "INVALID_TOKEN", "Token chat tidak valid.");
  }
  const data = await getCustomerChatMessages({ chatToken: token, afterId });
  return ok(data);
}
