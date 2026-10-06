import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { CustomerChatLimitError, getCustomerChatMessages, postCustomerChatMessage } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const sendSchema = z
  .object({
    chatToken: z.string().trim().min(12, "Token chat tidak valid.").max(120),
    tableLabel: z.string().trim().min(1).max(40),
    body: z.string().trim().max(500).default(""),
    // Bukti kepemilikan pesanan = token tracking invoice (bukan UUID order).
    orderToken: z.string().trim().min(12).max(120).optional(),
    attachmentUrl: z.string().trim().max(200).optional(),
  })
  .refine((value) => value.body.length > 0 || Boolean(value.attachmentUrl), { message: "Pesan kosong." });

// Kirim pesan chat dari customer (publik, tanpa login). Rate-limit ketat.
export async function POST(request: Request) {
  const limited = rateLimit(request, "customer-chat", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson(request, sendSchema);
  if (body.error) return body.error;

  try {
    const result = await postCustomerChatMessage(body.data);
    if (!result) return fail(400, "CHAT_SEND_FAILED", "Pesan gagal dikirim.");
    return ok(result, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerChatLimitError) return fail(429, "CHAT_RATE_LIMITED", error.message);
    throw error;
  }
}

// Ambil pesan thread customer (polling). Token chat dikirim lewat header
// (x-chat-token) supaya tidak tercatat di log URL; query ?token= tetap didukung.
export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-chat-read", { limit: 90, windowMs: 60_000 });
  if (limited) return limited;
  const url = new URL(request.url);
  const token = (request.headers.get("x-chat-token") ?? url.searchParams.get("token") ?? "").trim();
  const afterId = url.searchParams.get("afterId")?.trim() || undefined;
  if (token.length < 12 || token.length > 120) {
    return fail(400, "INVALID_TOKEN", "Token chat tidak valid.");
  }
  const data = await getCustomerChatMessages({ chatToken: token, afterId });
  return ok(data);
}
