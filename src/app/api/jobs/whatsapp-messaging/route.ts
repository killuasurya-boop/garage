import { ok } from "@/lib/api-response";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";
import { processWhatsappQueue } from "@/lib/garage-whatsapp-messaging";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = requireGarageAiJobAuthorization(request);
  if (auth) return auth;
  return ok(await processWhatsappQueue());
}

export const GET = POST;
