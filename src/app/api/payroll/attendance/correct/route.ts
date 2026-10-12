import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { AbsenControlError, correctAttendance } from "@/lib/garage-absen-control";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam harus format HH:MM.");
const schema = z.object({
  code: z.string().trim().min(2).max(16),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD."),
  checkin: time,
  checkout: time.optional().nullable(),
  reason: z.string().trim().min(5, "Alasan koreksi minimal 5 huruf.").max(200),
});

// Koreksi absen oleh manajer: langsung berlaku, gaji & fee hari itu dihitung ulang.
export async function POST(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;

  try {
    const res = await correctAttendance(body.data, {
      userId: session.data!.user.id,
      name: session.data!.user.name || session.data!.user.email,
      role: session.data!.profile.role,
    });
    return ok(res);
  } catch (err) {
    if (err instanceof AbsenControlError) {
      return fail(err.code === "NOT_FOUND" ? 404 : err.code === "ALREADY_PAID" ? 409 : err.code === "SELF_CORRECTION" ? 403 : 400, err.code, err.message);
    }
    return fail(500, "CORRECTION_FAILED", (err as Error).message);
  }
}
