import { fail, ok } from "@/lib/api-response";
import { completeTrainingCourse } from "@/lib/company-control";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("company:read");
  if (session.response) {
    return session.response;
  }

  try {
    return ok(await completeTrainingCourse((await params).id, session.data));
  } catch (error) {
    return fail(
      400,
      "TRAINING_COMPLETE_FAILED",
      error instanceof Error ? error.message : "Training gagal ditandai selesai.",
    );
  }
}
