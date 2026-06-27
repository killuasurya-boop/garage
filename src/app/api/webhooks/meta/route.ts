import { fail, ok } from "@/lib/api-response";
import { recordMetaWebhookPublishEvents } from "@/lib/garage-content-publishing";
import {
  extractMetaPublishEvents,
  verifyMetaWebhookSignature,
} from "@/lib/garage-provider-adapters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (
    mode === "subscribe" &&
    token &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() &&
    challenge
  ) {
    return new Response(challenge);
  }
  return fail(403, "WEBHOOK_VERIFY_FAILED", "Verifikasi webhook Meta gagal.");
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaWebhookSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return fail(401, "WEBHOOK_SIGNATURE_INVALID", "Signature webhook Meta tidak valid.");
  }
  const payload = JSON.parse(raw);
  const events = extractMetaPublishEvents(payload);
  const updates = await recordMetaWebhookPublishEvents(events);
  return ok({ received: true, events: events.length, updates });
}
