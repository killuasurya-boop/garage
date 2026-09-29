import { fail, ok } from "@/lib/api-response";
import { getTodayBoard } from "@/lib/garage-absen-control";
import { ensureDailyBackup } from "@/lib/garage-db-backup";
import { finalizePendingPayrollDays } from "@/lib/garage-payroll-cron";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

// Papan absen hari ini untuk manajer.
export async function GET() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;
  try {
    // Hari tertunda (lupa check-out, fee, bonus) ikut diproses saat manajer membuka papan.
    await finalizePendingPayrollDays(new Date(), 35).catch(() => []);
    void ensureDailyBackup().catch((err) => console.error("[backup] harian gagal", err));
    return ok(await getTodayBoard(), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return fail(500, "BOARD_FAILED", (err as Error).message);
  }
}
