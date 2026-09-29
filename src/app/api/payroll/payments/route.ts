import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { jakartaDateKey } from "@/lib/attendance";
import { ensureDailyBackup } from "@/lib/garage-db-backup";
import { finalizePendingPayrollDays } from "@/lib/garage-payroll-cron";
import { payrollPaymentErrorResponse } from "@/lib/garage-payroll-payments-http";
import {
  getPayables,
  getPaymentHistory,
  getUnfinalizedDates,
  payEmployee,
} from "@/lib/garage-payroll-payments";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

const paySchema = z.object({
  code: z.string().trim().min(2).max(16),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD."),
  method: z.enum(["Cash", "Transfer"]),
  note: z.string().trim().max(200).optional().nullable(),
});

// Proses hari tertunda (lupa check-out, fee harian, bonus akhir bulan) sebelum
// menghitung gajian — supaya tidak bergantung pada karyawan membuka /absen.
async function finalizeFirst() {
  try {
    await finalizePendingPayrollDays(new Date(), 35);
  } catch {
    /* dicoba lagi di panggilan berikutnya */
  }
}

// Daftar gaji/fee belum dibayar s/d `until` (+ riwayat gajian & kasbon).
export async function GET(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const until = new URL(request.url).searchParams.get("until") ?? jakartaDateKey(new Date());
  try {
    await finalizeFirst();
    const [payables, history, pendingDates] = await Promise.all([
      getPayables(until),
      getPaymentHistory(),
      getUnfinalizedDates(until),
    ]);
    return ok({ until, payables, pendingDates, ...history }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return payrollPaymentErrorResponse(err);
  }
}

// Gajian satu karyawan.
export async function POST(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  const body = await readJson(request, paySchema);
  if (body.error) return body.error;
  try {
    await finalizeFirst();
    // Pastikan ada backup hari ini sebelum menandai gaji lunas.
    await ensureDailyBackup().catch((err) => console.error("[backup] sebelum gajian gagal", err));
    return ok(await payEmployee(body.data, session.data!), { status: 201 });
  } catch (err) {
    return payrollPaymentErrorResponse(err);
  }
}
