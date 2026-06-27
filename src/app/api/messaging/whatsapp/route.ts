import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { enqueueWhatsappMessage } from "@/lib/garage-whatsapp-messaging";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(8).max(24),
  templateName: z.string().trim().min(1).max(512),
  templateLanguage: z.string().trim().min(2).max(16).optional(),
  templateParameters: z.array(z.string().max(1024)).max(20).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(255),
});

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return ok(
    await enqueueWhatsappMessage({
      ...body.data,
      createdBy: session.data.user.id,
    }),
    { status: 201 },
  );
}
