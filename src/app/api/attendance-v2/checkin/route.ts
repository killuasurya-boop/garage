import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { AttendanceError, checkinV2 } from "@/lib/garage-attendance-v2";
import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";

export const runtime = "nodejs";

const schema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  selfieBase64: z.string().max(3_500_000).optional().nullable(),
  device: z.string().max(64).optional().nullable(),
});

export async function POST(request: Request) {
  if (!isPayrollV2Enabled()) return fail(503, "PAYROLL_V2_DISABLED", "Payroll V2 belum aktif.");

  const session = await requireGarageSession();
  if (session.response) return session.response;

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  try {
    const result = await checkinV2({
      staffUserId: session.data!.user.id,
      pin: body.data.pin,
      lat: body.data.lat ?? null,
      lng: body.data.lng ?? null,
      selfieBase64: body.data.selfieBase64 ?? null,
      device: body.data.device ?? null,
    });
    return ok(result);
  } catch (err) {
    if (err instanceof AttendanceError) {
      return fail(err.code === "PIN_INVALID" ? 401 : 400, err.code, err.message);
    }
    return fail(500, "CHECKIN_FAILED", (err as Error).message);
  }
}
