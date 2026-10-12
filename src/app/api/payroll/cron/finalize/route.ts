import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { finalizePayrollDay, finalizeYesterdayIfNeeded } from "@/lib/garage-payroll-cron";
import { MANAGEMENT_ROLES } from "@/lib/role-access";
import { secretsMatch } from "@/lib/secret-compare";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function dayIsClosed(dateKey: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (dateKey < today) return true;
  return dateKey === today && Number(parts.hour) === 23 && Number(parts.minute) >= 55;
}

/** Manual trigger cron. Bisa dipanggil systemd via CRON_SECRET header juga. */
export async function POST(request: Request) {
  // Systemd secret bypass:
  const secret = request.headers.get("x-cron-secret");
  if (secretsMatch(secret, process.env.CRON_SECRET?.trim())) {
    const body = await readJson(request, schema);
    if (body.error) return body.error;
    const result = body.data.date
      ? await finalizePayrollDay(body.data.date)
      : await finalizeYesterdayIfNeeded();
    return ok(result);
  }

  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  // Finalisasi manual hanya untuk hari yang sudah selesai (WIB): fee pool siang
  // hari belum lengkap & staf yang masih bekerja belum ikut dibagi.
  if (body.data.date && !dayIsClosed(body.data.date)) {
    return fail(400, "PAYROLL_DAY_OPEN", "Hari ini belum selesai — finalisasi gaji berjalan otomatis pukul 23:59.");
  }

  try {
    const result = body.data.date
      ? await finalizePayrollDay(body.data.date)
      : await finalizeYesterdayIfNeeded();
    return ok(result);
  } catch (err) {
    return fail(500, "CRON_FINALIZE_FAILED", (err as Error).message);
  }
}
