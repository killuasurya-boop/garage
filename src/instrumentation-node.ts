// Tugas startup khusus runtime Node.js (di-import dari instrumentation.ts hanya
// bila NEXT_RUNTIME === "nodejs", supaya API Node tidak ikut ke bundle Edge).

import { ensureDatabaseReady } from "@/db";
import { startBackupScheduler } from "@/lib/garage-db-backup";

export async function registerNode() {
  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.warn(
      "[garage-db] Startup DB warmup skipped:",
      error instanceof Error ? error.message : error,
    );
  }

  scheduleRouteWarmup();

  // Backup otomatis harian + tiap ~6 jam (hanya database lokal PGlite).
  if (process.env.NODE_ENV === "production") {
    startBackupScheduler();
    startUnpaidOrderSweeper();
  }
}

// Tolak otomatis order take away/delivery yang tidak dibayar dalam batas waktu
// (Pengaturan → Delivery, default 30 menit). Tiap menit; modul dimuat malas
// supaya startup server tetap ringan.
function startUnpaidOrderSweeper() {
  if (process.env.GARAGE_DISABLE_AUTO_REJECT === "true") return;
  const timer = setInterval(async () => {
    try {
      const { sweepUnpaidOrders } = await import("@/lib/garage-courier");
      const rejected = await sweepUnpaidOrders();
      if (rejected.length) console.log(`[auto-reject] ${rejected.length} order belum bayar ditolak: ${rejected.join(", ")}`);
      // Audit Smart Approval: kedaluwarsa/digantikan, pelaksanaan macet, push R3 & eskalasi ke Owner.
      try {
        const { reconcileApprovals } = await import("@/lib/approval-reconcile");
        const r = await reconcileApprovals();
        if (r.expired || r.superseded || r.verified || r.uncertain) console.log("[approval-reconcile]", JSON.stringify(r));
      } catch (error) {
        console.warn("[approval-reconcile] gagal:", error instanceof Error ? error.message : error);
      }
      // Smart Partner Hub: eskalasi SLA mitra (belum diterima / siap belum diambil) tanpa perlu layar POS terbuka.
      try {
        const { sweepPartnerSla } = await import("@/lib/partner-hub-service");
        await sweepPartnerSla();
      } catch (error) {
        console.warn("[partner-sla] gagal:", error instanceof Error ? error.message : error);
      }
      // A7: pengingat setoran mitra harian (23.00 belum direkap · 08.00 setujui · 10.00 transfer · lewat 12.00 terlambat).
      // Tiap 5 menit; aman diulang karena tiap pengingat punya kunci dedup.
      if (new Date().getMinutes() % 5 === 0) {
        try {
          const { sweepPartnerSettlementReminders } = await import("@/lib/partner-hub-service");
          const r = await sweepPartnerSettlementReminders();
          if (r.sent) console.log(`[partner-settlement] ${r.sent} pengingat setoran mitra dikirim.`);
        } catch (error) {
          console.warn("[partner-settlement] gagal:", error instanceof Error ? error.message : error);
        }
      }
      // Sponsor Event: pengingat cicilan & kewajiban ke HP Owner (H-3, hari H, terlambat 1/3/7 hari…).
      // Tiap 15 menit; aman diulang karena tiap pengingat punya kunci dedup per Owner.
      if (new Date().getMinutes() % 15 === 3) {
        try {
          const { sweepSponsorReminders } = await import("@/lib/event-sponsor-service");
          const r = await sweepSponsorReminders();
          if (r.sent) console.log(`[sponsor] ${r.sent} pengingat sponsor dikirim.`);
        } catch (error) {
          console.warn("[sponsor] gagal:", error instanceof Error ? error.message : error);
        }
      }
      // Sekali per jam: bersihkan feed notifikasi staf yang sudah lama (> 14 hari).
      if (new Date().getMinutes() === 7) {
        const { pruneStaffNotifications } = await import("@/lib/staff-notifications");
        await pruneStaffNotifications();
      }
      // Sekali per jam: voucher aktif yang tanggal akhirnya lewat → expired (CX V4).
      if (new Date().getMinutes() === 23) {
        const { expireEndedVouchers } = await import("@/lib/customer-experience-service");
        const codes = await expireEndedVouchers();
        if (codes.length) console.log(`[vouchers] ${codes.length} voucher kedaluwarsa: ${codes.slice(0, 10).join(", ")}`);
      }
      // Sekali sehari 03:17 WIB: poin member tidak aktif hangus (Pengaturan → Loyalty).
      const wib = new Date(Date.now() + 7 * 3_600_000);
      if (wib.getUTCHours() === 3 && wib.getUTCMinutes() === 17) {
        const [{ getAppSettings }, { expireInactivePoints }, { getDb }] = await Promise.all([
          import("@/lib/garage-service"),
          import("@/lib/member-points"),
          import("@/db"),
        ]);
        const settings = await getAppSettings(null);
        const expired = await expireInactivePoints(getDb(), { months: settings.memberPointExpiryMonths });
        if (expired.length) console.log(`[member-points] poin ${expired.length} member tidak aktif hangus.`);
      }
    } catch (error) {
      console.warn("[auto-reject] sapuan gagal:", error instanceof Error ? error.message : error);
    }
  }, 60_000);
  timer.unref?.();
}

// Pemanasan halaman setelah server siap. Tanpa ini pengunjung PERTAMA setelah
// PC kasir dinyalakan menunggu 30–60 dtk (DB + render pertama) — terukur di
// QA-audit 2026-09-28. Server sendiri yang memanggil halaman utama, menu
// digital, dan login staf beberapa detik setelah listen.
function scheduleRouteWarmup() {
  if (process.env.NODE_ENV !== "production" || process.env.GARAGE_DISABLE_WARMUP === "true") return;

  const argv = process.argv;
  const portFlag = argv.findIndex((arg) => arg === "-p" || arg === "--port");
  const port = (portFlag > -1 ? argv[portFlag + 1] : undefined) ?? process.env.PORT ?? "3000";
  const base = `http://127.0.0.1:${port}`;
  const paths = ["/api/health", "/", "/order", "/pos-login"];

  setTimeout(async () => {
    for (const path of paths) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const response = await fetch(`${base}${path}`, {
            headers: { "x-garage-warmup": "1" },
            signal: AbortSignal.timeout(120_000),
          });
          await response.arrayBuffer();
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
    }
    console.log("[garage] Pemanasan halaman selesai.");
  }, 1_500);
}
