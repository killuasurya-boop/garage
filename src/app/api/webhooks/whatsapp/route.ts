import { fail, ok } from "@/lib/api-response";
import {
  extractWhatsappDeliveryEvents,
  updateWhatsappDeliveryStatus,
} from "@/lib/garage-whatsapp-messaging";
import { verifyMetaWebhookSignature } from "@/lib/garage-provider-adapters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") ===
      process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() &&
    url.searchParams.get("hub.challenge")
  ) {
    return new Response(url.searchParams.get("hub.challenge"));
  }
  return fail(403, "WEBHOOK_VERIFY_FAILED", "Verifikasi webhook WhatsApp gagal.");
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaWebhookSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return fail(401, "WEBHOOK_SIGNATURE_INVALID", "Signature webhook WhatsApp tidak valid.");
  }
  const payload = JSON.parse(raw) as unknown;
  let updated = 0;
  for (const event of extractWhatsappDeliveryEvents(payload)) {
    const row = await updateWhatsappDeliveryStatus(
      event.providerMessageId,
      event.status,
      event.error,
    );
    if (row) updated += 1;
  }
  return ok({ received: true, updated });
}
