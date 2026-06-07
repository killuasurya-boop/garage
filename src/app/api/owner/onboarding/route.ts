import { sql } from "drizzle-orm";

import { fail, ok } from "@/lib/api-response";
import { getDb } from "@/db";
import {
  complianceItems,
  inventoryItems,
  menuItems,
  operationLocations,
  outlets,
  sopChecklists,
  staffProfiles,
  trainingCourses,
} from "@/db/schema";
import {
  finalMvpPassed,
  readOperationalEvidence,
  readinessCheckPassed,
} from "@/lib/garage-operational-evidence";
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
      trainingCount,
      sopCount,
      evidence,
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
      db
        .select({ n: sql<number>`COUNT(*)` })
        .from(trainingCourses)
        .where(sql`${trainingCourses.status} = 'active'`),
      db
        .select({ n: sql<number>`COUNT(*)` })
        .from(sopChecklists)
        .where(sql`${sopChecklists.status} = 'active'`),
      readOperationalEvidence(),
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
    const count = {
      outlet: num(outletCount),
      menu: num(menuCount),
      inventory: num(inventoryCount),
      staff: num(staffCount),
      geofence: num(geofenceCount),
      compliance: num(complianceCount),
      training: num(trainingCount),
      sop: num(sopCount),
    };
    const readiness = evidence.readiness;
    const finalMvpUat = evidence.finalMvpUat;
    const passedUat = (id: string) => (finalMvpPassed(finalMvpUat, id) ? 1 : 0);
    const passedReadiness = (check: string) => (readinessCheckPassed(readiness, check) ? 1 : 0);
    const readinessGo = readiness?.status === "GO" ? 1 : 0;
    const finalMvpPassCount = finalMvpUat?.passCount ?? 0;
    const finalMvpTotal = finalMvpUat?.total ?? 5;

    const operationalGroups = [
      {
        id: "core-system",
        title: "Core System",
        description: "App, login, health, database, backup, dan env dasar siap.",
        items: [
          { id: "core-health", label: "/api/health dan DB reachable", target: 1, actual: 1, href: "/control/health" },
          { id: "core-outlet", label: "Outlet aktif tersedia", target: 1, actual: count.outlet, href: "/control/branches" },
          { id: "core-staff", label: "Role staff aktif tersedia", target: 5, actual: count.staff, href: "/os?module=team-management" },
          { id: "core-backup", label: "Backup DB berhasil dan tersimpan", target: 1, actual: 0, href: "/control/health", manual: true },
        ],
      },
      {
        id: "pos-cashier",
        title: "POS Kasir",
        description: "Open shift, order POS, pembayaran, struk, approval void, dan close shift.",
        items: [
          { id: "pos-menu", label: "Menu siap dijual di POS", target: 5, actual: count.menu, href: "/os?module=inventory" },
          { id: "pos-shift", label: "Kasir bisa open shift dan summary", target: 1, actual: passedUat("cashier-shift"), href: "/pos" },
          { id: "pos-payment", label: "Cash/non-cash payment dan receipt teruji", target: 1, actual: 0, href: "/pos", manual: true },
          { id: "pos-void", label: "Void/refund lewat approval", target: 1, actual: 0, href: "/os?module=approvals", manual: true },
        ],
      },
      {
        id: "qr-order",
        title: "QR Order Customer",
        description: "Customer bisa order dari QR, source campaign terbaca, dan flow mobile jelas.",
        items: [
          { id: "qr-menu", label: "Menu customer tersedia", target: 5, actual: count.menu, href: "/order" },
          { id: "qr-submit", label: "QR order submit dan kasir reject teruji", target: 1, actual: passedUat("qr-order"), href: "/order" },
          { id: "qr-control", label: "QR Control insight terlindungi dan terbaca", target: 1, actual: passedReadiness("QR control insights"), href: "/pos" },
          { id: "qr-source", label: "Source campaign QR tercatat", target: 1, actual: 0, href: "/order?source=qr_takeaway&campaign=landing_menu", manual: true },
        ],
      },
      {
        id: "kitchen-bar",
        title: "Kitchen / Bar",
        description: "KDS menerima order, status jalan, ready terlihat waiter, dan overdue jelas.",
        items: [
          { id: "kitchen-print-queue", label: "Print queue kitchen/kasir tersedia", target: 1, actual: passedReadiness("Print queue"), href: "/os?module=kitchen" },
          { id: "kitchen-kds", label: "KDS bisa menerima POS/QR order", target: 1, actual: 0, href: "/os?module=kitchen", manual: true },
          { id: "kitchen-status", label: "Status queue/cooking/ready/delivered teruji", target: 1, actual: 0, href: "/os?module=kitchen", manual: true },
          { id: "kitchen-overdue", label: "Order overdue terlihat", target: 1, actual: 0, href: "/os?module=kitchen", manual: true },
        ],
      },
      {
        id: "waiter",
        title: "Waiter",
        description: "Waiter board, delivered, request bill, clean, pindah meja, dan status meja aman.",
        items: [
          { id: "waiter-board", label: "Board waiter tampil dan touch-friendly", target: 1, actual: 0, href: "/os?module=waiter", manual: true },
          { id: "waiter-bill", label: "Request bill ke kasir teruji", target: 1, actual: 0, href: "/os?module=waiter", manual: true },
          { id: "waiter-clean", label: "Clean/tamu baru/pindah meja teruji", target: 1, actual: 0, href: "/os?module=waiter", manual: true },
        ],
      },
      {
        id: "smart-floor",
        title: "Smart Floor Command",
        description: "Owner/Admin/Manager melihat floor score dan command queue.",
        items: [
          { id: "smart-panel", label: "Panel Smart Floor aktif di dashboard", target: 1, actual: 1, href: "/os?module=dashboard" },
          { id: "smart-queue", label: "Command queue arahkan ke Waiter/POS", target: 1, actual: 1, href: "/os?module=dashboard" },
        ],
      },
      {
        id: "inventory",
        title: "Inventory Minimum",
        description: "SKU/stok minimum ada, low-stock terlihat, dan movement tercatat.",
        items: [
          { id: "inventory-sku", label: "SKU bahan baku tersedia", target: 5, actual: count.inventory, href: "/control/inventory-intel" },
          { id: "inventory-movement", label: "Stock movement/opname teruji", target: 1, actual: passedUat("inventory-opname"), href: "/os?module=inventory" },
        ],
      },
      {
        id: "finance",
        title: "Finance Basic",
        description: "Sales harian, cash session, payment split, expense, discrepancy, dan summary.",
        items: [
          { id: "finance-summary", label: "Finance overview/export tersedia", target: 1, actual: passedUat("finance-expense"), href: "/os?module=finance" },
          { id: "finance-expense", label: "Expense dan approval threshold teruji", target: 1, actual: passedUat("finance-expense"), href: "/os?module=finance" },
          { id: "finance-close", label: "Cash session summary teruji", target: 1, actual: passedUat("cashier-shift"), href: "/pos" },
        ],
      },
      {
        id: "role-permission",
        title: "Role & Permission",
        description: "Role staff fokus ke modulnya dan action sensitif permission-gated.",
        items: [
          { id: "role-staff", label: "Staff aktif cukup untuk role operasional", target: 5, actual: count.staff, href: "/control/permissions" },
          { id: "role-check", label: "Permission matrix dicek", target: 1, actual: 0, href: "/control/permissions", manual: true },
          { id: "role-public", label: "Public mutating routes direview", target: 1, actual: 0, href: "/control/security", manual: true },
        ],
      },
      {
        id: "training-sop",
        title: "Training & SOP",
        description: "Buku Pintar, SOP role, checklist submit, dan progress admin.",
        items: [
          { id: "training-course", label: "Training aktif tersedia", target: 5, actual: count.training, href: "/os?module=training" },
          { id: "training-sop", label: "SOP aktif tersedia", target: 7, actual: count.sop, href: "/os?module=training" },
          { id: "training-submit", label: "Submit SOP staff teruji", target: 1, actual: 0, href: "/os?module=training", manual: true },
        ],
      },
      {
        id: "ui-ux",
        title: "UI/UX Operasional",
        description: "Customer mobile, kasir tablet, waiter touch, warna status, overflow, loading/error.",
        items: [
          { id: "ui-order-mobile", label: "Customer order mobile nyaman", target: 1, actual: 0, href: "/order", manual: true },
          { id: "ui-pos-tablet", label: "POS kasir tablet nyaman", target: 1, actual: 0, href: "/pos", manual: true },
          { id: "ui-waiter-touch", label: "Waiter board touch-friendly", target: 1, actual: 0, href: "/os?module=waiter", manual: true },
        ],
      },
      {
        id: "security-readiness",
        title: "Security & Readiness",
        description: "Password seed, 2FA, backup, readiness audit, security audit, route publik.",
        items: [
          { id: "security-readiness", label: "Readiness audit GO", target: 1, actual: readinessGo, href: "/control/health" },
          { id: "security-2fa", label: "Owner/Admin 2FA siap", target: 1, actual: 0, href: "/control/2fa", manual: true },
          { id: "security-audit", label: "Security audit tidak hang dan findings direview", target: 1, actual: 0, href: "/control/security", manual: true },
        ],
      },
      {
        id: "uat-pilot",
        title: "UAT Pilot",
        description: "Simulasi end-to-end 1 shift sebelum MVP dinyatakan siap operasional.",
        items: [
          { id: "uat-api", label: "Final MVP API UAT otomatis", target: finalMvpTotal, actual: finalMvpPassCount, href: "/control/onboarding" },
          { id: "uat-qr", label: "QR dine-in sampai paid dan meja bersih", target: 1, actual: 0, href: "/order", manual: true },
          { id: "uat-pos", label: "POS langsung sampai receipt", target: 1, actual: 0, href: "/pos", manual: true },
          { id: "uat-backup", label: "Backup setelah transaksi pilot", target: 1, actual: 0, href: "/control/health", manual: true },
        ],
      },
    ].map((group) => {
      const done = group.items.filter((item) => item.actual >= item.target).length;
      return {
        ...group,
        done,
        total: group.items.length,
        ready: done === group.items.length,
        items: group.items.map((item) => ({
          ...item,
          ok: item.actual >= item.target,
        })),
      };
    });

    const operationalDone = operationalGroups.reduce((sum, group) => sum + group.done, 0);
    const operationalTotal = operationalGroups.reduce((sum, group) => sum + group.total, 0);
    const operationalProgressPct =
      operationalTotal > 0 ? Math.round((operationalDone / operationalTotal) * 100) : 0;

    return ok({
      generatedAt: new Date().toISOString(),
      progressPct,
      ready: progressPct >= 80,
      checks: checks.map((c) => ({
        ...c,
        ok: c.actual >= c.target,
      })),
      operationalProgressPct,
      operationalReady: operationalProgressPct === 100,
      evidenceSummary: {
        readiness: readiness
          ? {
              generatedAt: readiness.generatedAt,
              status: readiness.status,
              pass: readiness.results.filter((result) => result.severity === "pass").length,
              warn: readiness.results.filter((result) => result.severity === "warn").length,
              fail: readiness.results.filter((result) => result.severity === "fail").length,
            }
          : null,
        finalMvpUat: finalMvpUat
          ? {
              generatedAt: finalMvpUat.generatedAt,
              passCount: finalMvpUat.passCount,
              total: finalMvpUat.total,
            }
          : null,
      },
      operationalGroups,
    });
  } catch (error) {
    console.error("owner/onboarding error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal cek onboarding");
  }
}
