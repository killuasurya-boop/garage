import { describe, it, expect } from "vitest";

import {
  canTransitionKitchenStatus,
  nextKitchenStatuses,
} from "@/lib/garage-kitchen-status";

// =============================================================================
// STEP 2-4 (Barista / Koki / Waiter) — alur status tiket KDS lintas role.
// Barista & Koki: queue→cooking→ready. Waiter: ready→delivered.
// =============================================================================

describe("alur status tiket KDS yang sah", () => {
  it.each([
    ["queue", "cooking"], // koki/barista mulai masak
    ["queue", "ready"], // item cepat langsung siap
    ["cooking", "ready"], // selesai dimasak
    ["ready", "delivered"], // waiter antar ke meja
  ])("%s → %s diizinkan", (from, to) => {
    expect(canTransitionKitchenStatus(from, to)).toBe(true);
  });
});

describe("transisi tidak sah ditolak (cegah lompat/mundur status)", () => {
  it.each([
    ["queue", "delivered"], // tak boleh lompat lewati ready
    ["cooking", "queue"], // tak boleh mundur
    ["ready", "cooking"], // tak boleh mundur
    ["delivered", "ready"], // sudah final
    ["delivered", "cooking"],
    ["ready", "queue"],
  ])("%s → %s ditolak", (from, to) => {
    expect(canTransitionKitchenStatus(from, to)).toBe(false);
  });

  it("status tak dikenal tidak punya transisi", () => {
    expect(nextKitchenStatuses("unknown")).toEqual([]);
    expect(canTransitionKitchenStatus("unknown", "ready")).toBe(false);
  });

  it("delivered adalah status final (tanpa lanjutan)", () => {
    expect(nextKitchenStatuses("delivered")).toEqual([]);
  });
});
