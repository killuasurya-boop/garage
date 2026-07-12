import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { customers, whatsappConversations, whatsappMessages } from "@/db/schema";
import { normalizeWhatsappRecipient } from "@/lib/garage-whatsapp-messaging";

async function findCustomerIdByPhone(phone: string) {
  const [customer] = await getDb()
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  return customer?.id ?? null;
}

export async function handleWhatsappInbound(
  messages: Array<{ from: string; body: string; messageId: string }>,
) {
  const db = getDb();
  for (const msg of messages) {
    const phoneNumber = normalizeWhatsappRecipient(msg.from);
    const customerId = await findCustomerIdByPhone(phoneNumber);
    const [conv] = await db
      .insert(whatsappConversations)
      .values({
        phoneNumber,
        customerId,
        unreadCount: 1,
        lastInboundAt: new Date(),
        lastMessagePreview: msg.body,
      })
      .onConflictDoUpdate({
        target: whatsappConversations.phoneNumber,
        set: {
          unreadCount: sql`${whatsappConversations.unreadCount} + 1`,
          lastInboundAt: new Date(),
          lastMessagePreview: msg.body,
          updatedAt: new Date(),
          ...(customerId ? { customerId } : {}),
        },
      })
      .returning();
    await db.insert(whatsappMessages).values({
      conversationId: conv.id,
      direction: "inbound",
      messageType: "text",
      body: msg.body,
      status: "received",
      providerMessageId: msg.messageId,
    });
  }
}
