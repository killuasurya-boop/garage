import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api-response";
import { getDb } from "@/db";
import { customers, whatsappConversations, whatsappMessages } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["mark_read", "assign", "close", "open"]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
  ]);
  if (session.response) return session.response;
  const { id } = await params;
  const [conv] = await getDb()
    .select({
      id: whatsappConversations.id,
      phoneNumber: whatsappConversations.phoneNumber,
      customerId: whatsappConversations.customerId,
      assignedTo: whatsappConversations.assignedTo,
      status: whatsappConversations.status,
      unreadCount: whatsappConversations.unreadCount,
      lastInboundAt: whatsappConversations.lastInboundAt,
      lastMessagePreview: whatsappConversations.lastMessagePreview,
      createdAt: whatsappConversations.createdAt,
      updatedAt: whatsappConversations.updatedAt,
      customerName: sql<string | null>`${customers.name}`,
    })
    .from(whatsappConversations)
    .leftJoin(customers, eq(whatsappConversations.customerId, customers.id))
    .where(eq(whatsappConversations.id, id))
    .limit(1);
  if (!conv) return fail(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");
  const messages = await getDb()
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, conv.id))
    .orderBy(whatsappMessages.createdAt);
  return ok({ conversation: conv, messages });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
  ]);
  if (session.response) return session.response;
  const { id } = await params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const [conv] = await getDb()
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id))
    .limit(1);
  if (!conv) return fail(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");

  if (body.data.action === "mark_read") {
    await getDb()
      .update(whatsappConversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, id));
  } else if (body.data.action === "assign") {
    await getDb()
      .update(whatsappConversations)
      .set({ assignedTo: session.data.user.id, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, id));
  } else if (body.data.action === "close" || body.data.action === "open") {
    await getDb()
      .update(whatsappConversations)
      .set({
        status: body.data.action === "close" ? "closed" : "open",
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, id));
  }
  const [updated] = await getDb()
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id))
    .limit(1);
  return ok(updated);
}
