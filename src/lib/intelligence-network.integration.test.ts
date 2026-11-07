import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import { healthFromCount, isRecentlyActive, priorityProblems } from "@/lib/intelligence-network";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Batch 6: status jaringan dari data nyata — tanpa sinyal = "Belum terverifikasi" (bukan hijau).

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const OWNER = "user-li-owner";
const owner = (): GarageSession =>
  ({ user: { id: OWNER, name: "Owner", email: `${OWNER}@garage.id` },
    profile: { id: "sp-li", role: "Owner" as Role, shiftLabel: "Pagi", deviceLabel: "Tes", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" } } }) as unknown as GarageSession;

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
}, 60_000);
afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Living Intelligence", () => {
  it("aturan murni: ambang, aktivitas segar, urutan masalah", () => {
    expect(healthFromCount(null, { attention: 1 })).toBe("unverified");
    expect(healthFromCount(0, { attention: 1, critical: 3 })).toBe("ok");
    expect(healthFromCount(3, { attention: 1, critical: 3 })).toBe("critical");
    const now = Date.now();
    expect(isRecentlyActive(new Date(now - 30_000).toISOString(), now)).toBe(true);
    expect(isRecentlyActive(new Date(now - 10 * 60_000).toISOString(), now)).toBe(false);
    expect(isRecentlyActive(null, now)).toBe(false);
    const list = priorityProblems([
      { id: "pos", health: "attention", label: "B" },
      { id: "gudang", health: "critical", label: "A" },
      { id: "event", health: "unverified", label: "C" },
    ] as any);
    expect(list.map((d) => d.id)).toEqual(["gudang", "pos"]);
  });

  it("16 domain asli; stok minus → Gudang perlu perhatian; modul tanpa sinyal tidak hijau", async () => {
    await t.getDb().insert(t.schema.inventoryItems).values({ sku: "BAR-LI1", name: "Susu", alternativeName: "Susu", category: "Bar", unit: "ml", packageSize: "1L", onHand: -50, min: 100, status: "low", movement: "fast" } as any);
    const { getIntelligenceSnapshot } = await import("@/lib/intelligence-network-server");
    const snap = await getIntelligenceSnapshot(owner());
    expect(snap.domains).toHaveLength(16);
    const gudang = snap.domains.find((d) => d.id === "gudang")!;
    expect(gudang.health).toBe("attention");
    expect(gudang.metric?.value).toBe(1);
    expect(snap.domains.find((d) => d.id === "dokumen")!.health).toBe("unverified");
    expect(snap.domains.find((d) => d.id === "pos")!.health).toBe("ok");
    await expect(getIntelligenceSnapshot({ ...owner(), profile: { ...owner().profile, role: "Manajer" } } as any)).rejects.toThrow();
  });
});
