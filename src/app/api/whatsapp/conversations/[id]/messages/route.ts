import { eq } from "drizzle-orm";
import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api-response";
import { getDb } from "@/db";
import { whatsappConversations, whatsappMessages } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";
import { isWithin24hWindow, sendWhatsappDirect } from "@/lib/garage-whatsapp-messaging";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["text", "template"]),
  text: z.string().max(4096).optional(),
  templateName: z.string().trim().min(1).max(512).optional(),
  templateParameters: z.array(z.string().max(1024)).max(20).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Manager Operasional",
    "Admin",
    "Customer Service",
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

  if (body.data.type === "text") {
    if (!isWithin24hWindow(conv.lastInboundAt)) {
      return fail(
        400,
        "WHATSAPP_24H_WINDOW_EXPIRED",
        "Gunakan template untuk membalas di luar jendela 24 jam.",
      );
    }
    const { providerMessageId } = await sendWhatsappDirect({
      recipient: conv.phoneNumber,
      messageType: "text",
      body: body.data.text,
      createdBy: session.data.user.id,
    });
    const [msg] = await getDb()
      .insert(whatsappMessages)
      .values({
        conversationId: conv.id,
        direction: "outbound",
        messageType: "text",
        body: body.data.text,
        status: "sent",
        providerMessageId,
        createdBy: session.data.user.id,
      })
      .returning();
    await getDb()
      .update(whatsappConversations)
      .set({ unreadCount: 0, lastMessagePreview: body.data.text, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conv.id));
    return ok(msg, { status: 201 });
  }

  const { providerMessageId } = await sendWhatsappDirect({
    recipient: conv.phoneNumber,
    messageType: "template",
    templateName: body.data.templateName,
    templateParameters: body.data.templateParameters,
    createdBy: session.data.user.id,
  });
  const [msg] = await getDb()
    .insert(whatsappMessages)
    .values({
      conversationId: conv.id,
      direction: "outbound",
      messageType: "template",
      templateName: body.data.templateName,
      templateParams: body.data.templateParameters ?? [],
      status: "sent",
      providerMessageId,
      createdBy: session.data.user.id,
    })
    .returning();
  await getDb()
    .update(whatsappConversations)
    .set({
      unreadCount: 0,
      lastMessagePreview: `Template: ${body.data.templateName}`,
      updatedAt: new Date(),
    })
    .where(eq(whatsappConversations.id, conv.id));
  return ok(msg, { status: 201 });
}
