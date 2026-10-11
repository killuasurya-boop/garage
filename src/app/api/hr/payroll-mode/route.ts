import { NextResponse } from "next/server";

import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";
import { requirePermission } from "@/lib/server-auth";

/**
 * Mode payroll aktif untuk modul Manajemen Tim. Saat Payroll V2 menyala, tab
 * lama (Log Kehadiran, Kasbon, Gaji & Payroll) jadi riwayat saja dan diarahkan
 * ke /owner/payroll supaya gaji tidak tercatat dobel.
 */
export async function GET() {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;
  return NextResponse.json({ data: { v2Enabled: isPayrollV2Enabled() } }, { headers: { "Cache-Control": "no-store" } });
}
