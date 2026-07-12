import { and, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { getDb } from "@/db";
import { whatsappMessagingQueue, whatsappMessages } from "@/db/schema";
import { getConnectedAccessToken } from "@/lib/garage-integrations";

export function normalizeWhatsappRecipient(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 16) {
    throw new Error("Nomor WhatsApp harus 8-16 digit.");
  }
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

export async function enqueueWhatsappMessage(input: {
  recipient: string;
  templateName: string;
  templateLanguage?: string;
  templateParameters?: string[];
  scheduledAt?: string | null;
  idempotencyKey: string;
  createdBy: string;
}) {
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Jadwal WhatsApp tidak valid.");
  }
  const [row] = await getDb()
    .insert(whatsappMessagingQueue)
    .values({
      recipient: normalizeWhatsappRecipient(input.recipient),
      templateName: input.templateName.trim(),
      templateLanguage: input.templateLanguage?.trim() || "id",
      templateParameters: input.templateParameters ?? [],
      scheduledAt,
      idempotencyKey: input.idempotencyKey.trim(),
      createdBy: input.createdBy,
    })
    .onConflictDoNothing({ target: whatsappMessagingQueue.idempotencyKey })
    .returning();
  if (row) return row;
  const [existing] = await getDb()
    .select()
    .from(whatsappMessagingQueue)
    .where(eq(whatsappMessagingQueue.idempotencyKey, input.idempotencyKey))
    .limit(1);
  return existing;
}

async function whatsappAccessToken() {
  const envToken = process.env.WHATSAPP_CLOUD_API_TOKEN?.trim();
  if (envToken) return envToken;
  return (await getConnectedAccessToken("whatsapp", "phone_number")).token;
}

export async function sendWhatsappQueueItem(id: string) {
  const db = getDb();
  const [item] = await db
    .select()
    .from(whatsappMessagingQueue)
    .where(eq(whatsappMessagingQueue.id, id))
    .limit(1);
  if (!item) return null;
  if (["sent", "delivered", "read"].includes(item.status)) return item;
  if (!item.templateName) throw new Error("Template WhatsApp wajib tersedia.");

  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) throw new Error("WHATSAPP_CLOUD_PHONE_NUMBER_ID belum dikonfigurasi.");
  const token = await whatsappAccessToken();
  const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: item.recipient,
        type: "template",
        template: {
          name: item.templateName,
          language: { code: item.templateLanguage },
          ...(item.templateParameters.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: item.templateParameters.map((text) => ({ type: "text", text })),
                  },
                ],
              }
            : {}),
        },
      }),
      cache: "no-store",
    },
  );
  const result = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  const attemptCount = item.attemptCount + 1;
  if (!response.ok || !result.messages?.[0]?.id) {
    const message = result.error?.message || `WhatsApp Cloud API gagal (${response.status}).`;
    const [failed] = await db
      .update(whatsappMessagingQueue)
      .set({
        status: "failed",
        error: message.slice(0, 1000),
        attemptCount,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessagingQueue.id, id))
      .returning();
    return failed;
  }
  const [sent] = await db
    .update(whatsappMessagingQueue)
    .set({
      status: "sent",
      providerMessageId: result.messages[0].id,
      error: null,
      attemptCount,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessagingQueue.id, id))
    .returning();
  return sent;
}

export async function processWhatsappQueue(limit = 50) {
  if (process.env.WHATSAPP_MESSAGING_LIVE_ENABLED?.trim().toLowerCase() !== "true") {
    return [];
  }
  const due = await getDb()
    .select({ id: whatsappMessagingQueue.id })
    .from(whatsappMessagingQueue)
    .where(
      and(
        inArray(whatsappMessagingQueue.status, ["queued", "failed"]),
        or(
          isNull(whatsappMessagingQueue.scheduledAt),
          and(
            isNotNull(whatsappMessagingQueue.scheduledAt),
            lte(whatsappMessagingQueue.scheduledAt, new Date()),
          ),
        ),
      ),
    )
    .limit(Math.max(1, Math.min(limit, 100)));
  const results = [];
  for (const item of due) {
    results.push(await sendWhatsappQueueItem(item.id));
  }
  return results;
}

export async function updateWhatsappDeliveryStatus(
  providerMessageId: string,
  status: string,
  error?: string | null,
) {
  const allowed = ["sent", "delivered", "read", "failed"];
  if (!allowed.includes(status)) return null;
  const [row] = await getDb()
    .update(whatsappMessagingQueue)
    .set({
      status,
      error: status === "failed" ? error?.slice(0, 1000) || "Delivery gagal." : null,
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessagingQueue.providerMessageId, providerMessageId))
    .returning();
  // Mirror ke pesan inbox (jika pesan ini berasal dari reply CS).
  await getDb()
    .update(whatsappMessages)
    .set({ status, updatedAt: new Date() })
    .where(eq(whatsappMessages.providerMessageId, providerMessageId));
  return row ?? null;
}

export function isWithin24hWindow(lastInboundAt: Date | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const diffMs = Date.now() - new Date(lastInboundAt).getTime();
  return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
}

export function extractWhatsappInboundMessages(payload: unknown) {
  const typed = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };
  const out: Array<{ from: string; body: string; messageId: string }> = [];
  for (const entry of typed?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (!message.from || !message.id) continue;
        if (message.type === "text") {
          out.push({
            from: normalizeWhatsappRecipient(message.from),
            body: message.text?.body ?? "",
            messageId: message.id,
          });
        }
      }
    }
  }
  return out;
}

export async function sendWhatsappDirect(input: {
  recipient: string;
  messageType: "text" | "template";
  body?: string | null;
  templateName?: string | null;
  templateParameters?: string[];
  createdBy?: string | null;
}) {
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) throw new Error("WHATSAPP_CLOUD_PHONE_NUMBER_ID belum dikonfigurasi.");
  const token =
    process.env.WHATSAPP_CLOUD_API_TOKEN?.trim() ||
    (await getConnectedAccessToken("whatsapp", "phone_number").catch(() => null))?.token;
  if (!token) throw new Error("WhatsApp Cloud API belum dikonfigurasi.");
  const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v23.0";
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: normalizeWhatsappRecipient(input.recipient),
    type: input.messageType,
  };
  if (input.messageType === "text") {
    payload.text = { body: input.body ?? "" };
  } else {
    payload.template = {
      name: input.templateName,
      language: { code: "id" },
      components: input.templateParameters?.length
        ? [
            {
              type: "body",
              parameters: input.templateParameters.map((text) => ({ type: "text", text })),
            },
          ]
        : [],
    };
  }
  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const result = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!response.ok || !result.messages?.[0]?.id) {
    throw new Error(result.error?.message || `WhatsApp Cloud API gagal (${response.status}).`);
  }
  return { providerMessageId: result.messages[0].id };
}

export type WhatsappDeliveryEvent = {
  providerMessageId: string;
  status: string;
  error?: string;
};

export function extractWhatsappDeliveryEvents(payload: unknown): WhatsappDeliveryEvent[] {
  const typed = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{
            id?: string;
            status?: string;
            errors?: Array<{ title?: string; message?: string }>;
          }>;
        };
      }>;
    }>;
  };
  const events: WhatsappDeliveryEvent[] = [];
  for (const entry of typed?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        events.push({
          providerMessageId: status.id,
          status: status.status,
          error: status.errors?.[0]?.message || status.errors?.[0]?.title,
        });
      }
    }
  }
  return events;
}
