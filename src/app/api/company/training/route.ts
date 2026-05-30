import { fail, ok, readJson } from "@/lib/api-response";
import {
  canManageCompanyControl,
  createTrainingCourse,
  createTrainingCourseSchema,
  getTrainingCourses,
} from "@/lib/company-control";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("company:read");
  if (session.response) {
    return session.response;
  }

  return ok(await getTrainingCourses(session.data));
}

export async function POST(request: Request) {
  const session = await requirePermission("company:manage");
  if (session.response) {
    return session.response;
  }

  if (!canManageCompanyControl(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "Role ini tidak bisa membuat training.");
  }

  const body = await readJson(request, createTrainingCourseSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createTrainingCourse(body.data, session.data), { status: 201 });
}
