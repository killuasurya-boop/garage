import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { marketingBroadcastDeliveries, marketingBroadcasts } from "@/db/schema";
import { listCrmSegments } from "@/lib/garage-service";
import { updateMarketingBroadcast } from "@/lib/garage-marketing-service";
import { getSender, resolveProvider } from "@/lib/messaging/senders";
import type { MessageChannel } from "@/lib/messaging/types";

// ============================================================================
// Dispatcher broadcast: resolve segment -> render template per penerima ->
// kirim via MessageSender aktif -> catat delivery -> update count/status.
//
// Mode default (simulation) tidak mengirim apa pun; semua penerima tercatat
// sebagai "simulated". Saat provider asli dicolok, alur ini tidak berubah.
// ============================================================================

type SegmentCustomer = {
  id: string;
  name: string;
  phone: string;
  tier: string;
  reason: string;
};

export type DispatchSummary = {
  broadcastId: string;
  provider: string;
  total: number;
  sent: number;
  simulated: number;
  failed: number;
  status: string;
};

// Ganti placeholder sederhana: {{name}}, {{tier}}, {{reason}}.
function renderTemplate(body: string, c: SegmentCustomer): string {
  return body
    .replace(/\{\{\s*name\s*\}\}/gi, c.name || "Pelanggan")
    .replace(/\{\{\s*tier\s*\}\}/gi, c.tier || "")
    .replace(/\{\{\s*reason\s*\}\}/gi, c.reason || "");
}

function asChannel(value: string): MessageChannel {
  switch (value) {
    case "whatsapp":
    case "instagram":
    case "in_store":
    case "multi":
    case "email":
      return value;
    default:
      return "whatsapp";
  }
}

export async function dispatchBroadcast(
  broadcastId: string,
): Promise<DispatchSummary> {
  const db = await getDb();

  const [broadcast] = await db
    .select()
    .from(marketingBroadcasts)
    .where(eq(marketingBroadcasts.id, broadcastId))
    .limit(1);

  if (!broadcast) {
    throw new Error("Broadcast tidak ditemukan.");
  }
  if (broadcast.status === "sent") {
    throw new Error("Broadcast ini sudah pernah dikirim.");
  }
  if (broadcast.status === "sending") {
    throw new Error("Broadcast ini sedang dalam proses pengiriman.");
  }
  if (broadcast.status === "cancelled") {
    throw new Error("Broadcast ini sudah dibatalkan.");
  }

  // Resolve penerima dari segmen CRM.
  const segments = await listCrmSegments();
  const segment = (segments as Record<string, { customers?: SegmentCustomer[] } | undefined>)[
    broadcast.segmentKey
  ];
  const recipients = (segment?.customers ?? []).filter((c) => c.phone || c.id);

  const channel = asChannel(broadcast.channel);
  const provider = resolveProvider();
  const sender = getSender(provider);

  // Tandai sedang mengirim.
  await updateMarketingBroadcast(broadcastId, { status: "sending" });

  let sent = 0;
  let simulated = 0;
  let failed = 0;
  const deliveryRows: (typeof marketingBroadcastDeliveries.$inferInsert)[] = [];

  for (const c of recipients) {
    const body = renderTemplate(broadcast.templateBody, c);
    const result = await sender.send({
      channel,
      to: c.phone,
      recipientName: c.name,
      body,
    });

    if (result.status === "sent") sent += 1;
    else if (result.status === "simulated") simulated += 1;
    else failed += 1;

    deliveryRows.push({
      broadcastId,
      customerId: c.id || null,
      recipientName: c.name ?? "",
      recipientPhone: c.phone ?? "",
      channel,
      provider,
      status: result.status,
      renderedBody: body.slice(0, 2000),
      providerMessageId: result.providerMessageId ?? null,
      error: result.error ?? null,
    });
  }

  if (deliveryRows.length > 0) {
    await db.insert(marketingBroadcastDeliveries).values(deliveryRows);
  }

  const successCount = sent + simulated;
  await updateMarketingBroadcast(broadcastId, {
    status: "sent",
    sentAt: new Date().toISOString(),
    totalRecipients: recipients.length,
    sentCount: successCount,
  });

  return {
    broadcastId,
    provider,
    total: recipients.length,
    sent,
    simulated,
    failed,
    status: "sent",
  };
}
