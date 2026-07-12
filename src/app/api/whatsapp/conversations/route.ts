import { desc, eq, sql } from "drizzle-orm";
import { ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { customers, whatsappConversations } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
  ]);
  if (session.response) return session.response;
  const rows = await getDb()
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
    .orderBy(desc(whatsappConversations.lastInboundAt))
    .limit(200);
  return ok(rows);
}
