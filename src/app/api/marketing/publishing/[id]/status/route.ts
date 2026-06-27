import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  CONTENT_PUBLISHING_STATUSES,
  updateContentPublishingStatus,
} from "@/lib/garage-content-publishing";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(CONTENT_PUBLISHING_STATUSES),
  revisionNotes: z.string().max(3000).nullable().optional(),
  rejectionReason: z.string().max(3000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;

  try {
    const updated = await updateContentPublishingStatus({
      id,
      userId: session.data.user.id,
      ...body.data,
    });
    return updated
      ? ok(updated)
      : fail(404, "CONTENT_NOT_FOUND", "Konten publishing tidak ditemukan.");
  } catch (error) {
    return fail(
      409,
      "INVALID_STATUS_TRANSITION",
      error instanceof Error ? error.message : "Status tidak dapat diperbarui.",
    );
  }
}
