import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { askBot } from "@/lib/chat-bot-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const askSchema = z.object({
  channelId: z.string(),
  text: z.string().max(1000),
});

export async function POST(request: Request) {
  const session = await requirePermission("chat:use");
  if (session.response) return session.response;

  const body = await readJson(request, askSchema);
  if (body.error) return body.error;

  try {
    // Jalankan askBot di background tanpa menunggu sampai selesai
    // agar request klien segera return dan UI "loading" hilang, 
    // atau biarkan await jika ingin menunggu.
    // Karena kita sudah pakai delay 800ms di dalam askBot untuk simulasi ngetik,
    // biarkan saja Promise-nya lepas atau await. Kita lepas saja.
    askBot(body.data.channelId, body.data.text).catch(console.error);
    
    return ok({ status: "processing" });
  } catch {
    return fail(500, "BOT_ERROR", "Gagal memproses permintaan bot.");
  }
}
