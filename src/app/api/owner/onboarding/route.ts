import { sql } from "drizzle-orm";

import { fail, ok } from "@/lib/api-response";
import { getDb } from "@/db";
import {
  complianceItems,
  inventoryItems,
  menuItems,
  operationLocations,
  outlets,
  staffProfiles,
} from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Onboarding readiness — apa yang sudah & belum siap untuk go-live.
// Dipakai oleh /control/onboarding sebagai checklist.
export async function GET() {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  try {
    const db = await getDb();
    const [
      outletCount,
      menuCount,
      inventoryCount,
      staffCount,
      geofenceCount,
      complianceCount,
    ] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(outlets),
      db.select({ n: sql<number>`COUNT(*)` }).from(menuItems),
      db.select({ n: sql<number>`COUNT(*)` }).from(inventoryItems),
      db
        .select({ n: sql<number>`COUNT(*)` })
        .from(staffProfiles)
        .where(sql`${staffProfiles.status} = 'active'`),
      db.select({ n: sql<number>`COUNT(*)` }).from(operationLocations),
      db.select({ n: sql<number>`COUNT(*)` }).from(complianceItems),
    ]);

    const num = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

    const checks = [
      {
        id: "outlet",
        label: "Outlet terdaftar",
        description: "Minimal 1 outlet aktif di Settings → Outlets.",
        target: 1,
        actual: num(outletCount),
        href: "/control/branches",
        weight: 10,
      },
      {
        id: "menu",
        label: "Menu terisi",
        description: "Item menu + variant + harga + baseCost di-seed (npm run db:seed).",
        target: 5,
        actual: num(menuCount),
        href: "/os?module=inventory",
        weight: 20,
      },
      {
        id: "inventory",
        label: "Inventory raw material",
        description: "SKU bahan baku terdaftar dengan onHand & min.",
        target: 5,
        actual: num(inventoryCount),
        href: "/control/inventory-intel",
        weight: 15,
      },
      {
        id: "staff",
        label: "Staff aktif minimal 2 orang",
        description: "Setidaknya 1 kasir + 1 dapur/bar.",
        target: 2,
        actual: num(staffCount),
        href: "/os?module=team-management",
        weight: 15,
      },
      {
        id: "geofence",
        label: "Geofence presensi",
        description: "Lokasi outlet ter-set untuk absensi GPS.",
        target: 1,
        actual: num(geofenceCount),
        href: "/os?module=team-management",
        weight: 10,
      },
      {
        id: "compliance",
        label: "Compliance dokumen dicatat",
        description: "Minimal NPWP + 1 izin operasi terdaftar.",
        target: 2,
        actual: num(complianceCount),
        href: "/control/compliance",
        weight: 10,
      },
      {
        id: "backup",
        label: "Backup DB harian",
        description: "Cron / Task Scheduler menjalankan `npm run backup` setiap malam.",
        target: 1,
        actual: 0, // tidak ada cara reliable men-detect cron dari runtime; manual ack
        href: "https://github.com/your-org/garage#backup",
        weight: 10,
        manual: true,
      },
      {
        id: "permissions",
        label: "Permission matrix diaudit",
        description: "Jalankan `npm run check:permissions` dan pastikan ✓.",
        target: 1,
        actual: 0,
        href: "/control/permissions",
        weight: 10,
        manual: true,
      },
    ];

    let totalWeight = 0;
    let scored = 0;
    for (const c of checks) {
      totalWeight += c.weight;
      const ok = c.actual >= c.target;
      if (ok) scored += c.weight;
    }
    const progressPct = totalWeight > 0 ? Math.round((scored / totalWeight) * 100) : 0;

    return ok({
      generatedAt: new Date().toISOString(),
      progressPct,
      ready: progressPct >= 80,
      checks: checks.map((c) => ({
        ...c,
        ok: c.actual >= c.target,
      })),
    });
  } catch (error) {
    console.error("owner/onboarding error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal cek onboarding");
  }
}
