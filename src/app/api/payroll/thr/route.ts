import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { payrollPaymentErrorResponse } from "@/lib/garage-payroll-payments-http";
import { getThrHistory, getThrList, payThr } from "@/lib/garage-payroll-thr";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const paySchema = z.object({
  code: z.string().trim().min(2).max(16),
  holidayName: z.string().trim().min(3, "Isi nama hari raya.").max(60),
  holidayDate: z.string().regex(DATE, "Tanggal hari raya harus YYYY-MM-DD."),
  method: z.enum(["Cash", "Transfer"]),
  note: z.string().trim().max(200).optional().nullable(),
});

// Daftar THR per karyawan untuk satu hari raya (+ riwayat THR).
export async function GET(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const holidayDate = new URL(request.url).searchParams.get("holidayDate");
  try {
    const history = await getThrHistory();
    if (!holidayDate) return ok({ rows: [], history }, { headers: { "cache-control": "no-store" } });
    if (!DATE.test(holidayDate)) return fail(400, "DATE_INVALID", "Tanggal hari raya harus YYYY-MM-DD.");
    return ok({ rows: await getThrList(holidayDate), history }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return payrollPaymentErrorResponse(err);
  }
}

// Bayar THR satu karyawan.
export async function POST(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const body = await readJson(request, paySchema);
  if (body.error) return body.error;
  try {
    return ok(await payThr(body.data, session.data!), { status: 201 });
  } catch (err) {
    return payrollPaymentErrorResponse(err);
  }
}
