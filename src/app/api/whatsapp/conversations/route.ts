import { desc } from "drizzle-orm";
import { ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { whatsappConversations } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
    "Customer Service",
  ]);
  if (session.response) return session.response;
  const rows = await getDb()
    .select()
    .from(whatsappConversations)
    .orderBy(desc(whatsappConversations.lastInboundAt))
    .limit(200);
  return ok(rows);
}
