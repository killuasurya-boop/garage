import { fail, ok } from "@/lib/api-response";
import { publishApprovedContent } from "@/lib/garage-content-publishing";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("marketing:write");
  if (session.response) return session.response;
  const { id } = await context.params;

  try {
    const result = await publishApprovedContent(id, session.data.user.id);
    return result
      ? ok(result)
      : fail(404, "CONTENT_NOT_FOUND", "Konten publishing tidak ditemukan.");
  } catch (error) {
    return fail(
      409,
      "PUBLISH_REJECTED",
      error instanceof Error ? error.message : "Konten tidak dapat dipublish.",
    );
  }
}
