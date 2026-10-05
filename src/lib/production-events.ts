import { EventEmitter } from "events";

// =============================================================================
// Realtime Production Hub / Control Center: bus in-memory (pola sama dengan
// chat-events). Cukup untuk VPS single-process; klien tetap punya polling
// sebagai cadangan. Event TIDAK membawa data — hanya tanda "ada perubahan",
// klien mengambil ulang lewat API yang sudah memeriksa izin.
// =============================================================================

export type ProductionChangeEvent = { at: number };

class ProductionBus extends EventEmitter {
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Kirim tanda perubahan. Ditunda sebentar & digabung (coalesce) supaya
   * transaksi DB sudah commit dan rentetan perubahan cukup satu event.
   */
  publish(delayMs = PUBLISH_DELAY_MS) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit("change", { at: Date.now() } satisfies ProductionChangeEvent);
    }, delayMs);
    // Jangan menahan proses (mis. test / skrip) tetap hidup karena timer ini.
    (this.timer as { unref?: () => void }).unref?.();
  }

  subscribe(handler: (event: ProductionChangeEvent) => void) {
    this.on("change", handler);
    return () => {
      this.off("change", handler);
    };
  }
}

export const PUBLISH_DELAY_MS = 250;

declare global {
  var __garage_production_bus__: ProductionBus | undefined;
}

export const productionBus: ProductionBus = globalThis.__garage_production_bus__ ?? new ProductionBus();

if (!globalThis.__garage_production_bus__) {
  productionBus.setMaxListeners(500);
  globalThis.__garage_production_bus__ = productionBus;
}

export function publishProductionChange() {
  productionBus.publish();
}

/**
 * Bungkus mutasi produksi: setelah fungsi SUKSES, kirim tanda perubahan.
 * Gagal/throw → tidak ada event (layar tidak berubah).
 */
export function notifyingProduction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const result = await fn(...args);
    publishProductionChange();
    return result;
  };
}
