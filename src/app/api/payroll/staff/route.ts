import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  staffDailyWages,
  staffProfiles,
  staffWageConfig,
  user,
  feePoolSplits,
} from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;

  try {
    const db = getDb();
    // Ringkasan wallet karyawan payroll: saldo = gaji/fee yang BELUM dibayar lewat gajian.
    const rows = await db.execute(sql`
      SELECT
        u.id AS user_id,
        u.name AS name,
        COALESCE(sp.position, sp.role) AS role,
        COALESCE(swc.daily_wage, 0) AS daily_wage,
        (SELECT COALESCE(SUM(sdw.total_credited), 0) FROM ${staffDailyWages} sdw WHERE sdw.staff_user_id = u.id AND sdw.payout_id IS NULL) AS wallet_gaji,
        (SELECT COALESCE(SUM(fps.amount + fps.bonus_target + fps.bonus_zero_komplain), 0) FROM ${feePoolSplits} fps WHERE fps.staff_user_id = u.id AND fps.payment_id IS NULL) AS wallet_fee
      FROM ${user} u
      INNER JOIN ${staffProfiles} sp ON sp.user_id = u.id
      INNER JOIN ${staffWageConfig} swc ON swc.staff_user_id = u.id
      WHERE sp.status = 'active' AND swc.absen_code IS NOT NULL
      ORDER BY swc.absen_code ASC
    `);
    return ok({ staff: rows.rows ?? rows });
  } catch (err) {
    return fail(500, "STAFF_LIST_FAILED", (err as Error).message);
  }
}
