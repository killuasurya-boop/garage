import { afterEach, describe, expect, it, vi } from "vitest";

import { notifyingProduction, productionBus, PUBLISH_DELAY_MS } from "@/lib/production-events";

describe("production-events (realtime)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mutasi sukses → satu event (digabung) setelah jeda; unsubscribe berhenti menerima", async () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const unsubscribe = productionBus.subscribe(handler);
    const mutate = notifyingProduction(async (n: number) => n * 2);

    await expect(mutate(2)).resolves.toBe(4);
    await mutate(3);
    expect(handler).not.toHaveBeenCalled(); // ditunda sampai transaksi commit
    vi.advanceTimersByTime(PUBLISH_DELAY_MS + 1);
    expect(handler).toHaveBeenCalledTimes(1); // dua mutasi beruntun = satu event

    unsubscribe();
    await mutate(1);
    vi.advanceTimersByTime(PUBLISH_DELAY_MS + 1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("mutasi gagal → tidak ada event, error diteruskan", async () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const unsubscribe = productionBus.subscribe(handler);
    const failing = notifyingProduction(async () => {
      throw new Error("batch sudah diambil");
    });
    await expect(failing()).rejects.toThrow("batch sudah diambil");
    vi.advanceTimersByTime(PUBLISH_DELAY_MS + 1);
    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});
