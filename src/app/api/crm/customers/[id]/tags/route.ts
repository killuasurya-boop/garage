import { fail, ok, readJson } from "@/lib/api-response";
import { addCustomerTag, getCustomerTags, removeCustomerTag } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { z } from "zod";

export const runtime = "nodejs";

const addTagSchema = z.object({
  tag: z.string().trim().min(1, "Tag tidak boleh kosong.").max(64),
});

const deleteSchema = z.object({
  tagId: z.string().uuid("Invalid tag ID format."),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  return ok({ tags: await getCustomerTags(id) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const { id } = await context.params;
  const body = await readJson(request, addTagSchema);
  if (body.error) return body.error;

  const row = await addCustomerTag(id, body.data.tag, session.data.user.id);
  if (!row) {
    return fail(409, "TAG_ADD_FAILED", "Gagal menambahkan tag.");
  }

  return ok(
    {
      id: row.id,
      tag: row.tag,
      createdAt: row.createdAt.toISOString(),
    },
    { status: 201 },
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const body = await readJson(request, deleteSchema);
  if (body.error) return body.error;

  const { tagId } = body.data;
  const deleted = await removeCustomerTag(tagId);
  if (!deleted) {
    return fail(404, "TAG_NOT_FOUND", "Tag tidak ditemukan.");
  }

  void context;
  return ok({ ok: true });
}