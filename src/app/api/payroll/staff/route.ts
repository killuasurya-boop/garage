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

export const runtime = "nodejs";

const OWNER_ROLES = ["Owner / CEO", "Admin", "Finance / CFO"] as const;

export async function GET() {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  try {
    const db = getDb();
    // Ringkasan wallet per staff. Join user + staffProfiles + agregat wallets.
    const rows = await db.execute(sql`
      SELECT
        u.id AS user_id,
        u.name AS name,
        sp.role AS role,
        COALESCE(swc.daily_wage, 0) AS daily_wage,
        (SELECT COALESCE(SUM(sdw.total_credited), 0) FROM ${staffDailyWages} sdw WHERE sdw.staff_user_id = u.id) AS wallet_gaji,
        (SELECT COALESCE(SUM(fps.amount + fps.bonus_target + fps.bonus_zero_komplain), 0) FROM ${feePoolSplits} fps WHERE fps.staff_user_id = u.id) AS wallet_fee
      FROM ${user} u
      INNER JOIN ${staffProfiles} sp ON sp.user_id = u.id
      LEFT JOIN ${staffWageConfig} swc ON swc.staff_user_id = u.id
      WHERE sp.status = 'active'
      ORDER BY u.name ASC
    `);
    return ok({ staff: rows.rows ?? rows });
  } catch (err) {
    return fail(500, "STAFF_LIST_FAILED", (err as Error).message);
  }
}
