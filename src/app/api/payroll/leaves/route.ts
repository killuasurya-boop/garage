import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { AbsenControlError, addLeave, listLeaves, removeLeave } from "@/lib/garage-absen-control";
import { LEAVE_TYPES } from "@/lib/garage-payroll-report";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD.");
const addSchema = z.object({
  code: z.string().trim().min(2).max(16),
  from: day,
  to: day,
  type: z.enum(LEAVE_TYPES),
  reason: z.string().trim().max(200).default(""),
});

function errorResponse(err: unknown) {
  if (err instanceof AbsenControlError) {
    return fail(err.code === "NOT_FOUND" ? 404 : err.code === "ATTENDANCE_EXISTS" ? 409 : 400, err.code, err.message);
  }
  return fail(500, "LEAVE_FAILED", (err as Error).message);
}

const actorOf = (s: { user: { id: string; name: string; email: string } }) => ({
  userId: s.user.id,
  name: s.user.name || s.user.email,
});

export async function GET() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  try {
    return ok({ leaves: await listLeaves() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const body = await readJson(request, addSchema);
  if (body.error) return body.error;
  try {
    return ok(await addLeave(body.data, actorOf(session.data!)), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const date = url.searchParams.get("date");
  if (!code || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail(400, "VALIDATION_ERROR", "Parameter code & date wajib.");
  }
  try {
    return ok(await removeLeave({ code, date }, actorOf(session.data!)));
  } catch (err) {
    return errorResponse(err);
  }
}
