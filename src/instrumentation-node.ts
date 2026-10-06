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
      // Sekali per jam: bersihkan feed notifikasi staf yang sudah lama (> 14 hari).
      if (new Date().getMinutes() === 7) {
        const { pruneStaffNotifications } = await import("@/lib/staff-notifications");
        await pruneStaffNotifications();
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
