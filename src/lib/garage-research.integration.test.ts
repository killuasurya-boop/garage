import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// RISET MENU (menu_research) — TEST INTEGRASI CRUD terhadap DB nyata.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const USER = "user-itest";

function session(): GarageSession {
  return {
    user: { id: USER, name: "Owner Test" },
    profile: {
      id: "sp",
      role: "Owner / CEO" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Dev",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: USER });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Riset Menu — CRUD (DB nyata)", () => {
  it("buat catatan riset default decision 'research'", async () => {
    const row = await svc.createMenuResearch(
      { productName: "Kopi Aren Eksperimen", tasteNotes: "manis pas", hppNotes: "Rp4.500" },
      session(),
    );
    expect(row.productName).toBe("Kopi Aren Eksperimen");
    expect(row.decision).toBe("research");

    const list = await svc.listMenuResearch();
    expect(list.find((r: any) => r.id === row.id)).toBeTruthy();
  });

  it("ubah keputusan jadi 'approved'", async () => {
    const row = await svc.createMenuResearch({ productName: "Latte Pandan" }, session());
    const updated = await svc.updateMenuResearch(row.id, { decision: "approved" });
    expect(updated.decision).toBe("approved");
  });

  it("hapus catatan riset", async () => {
    const row = await svc.createMenuResearch({ productName: "Sementara" }, session());
    const del = await svc.deleteMenuResearch(row.id);
    expect(del.id).toBe(row.id);
    const list = await svc.listMenuResearch();
    expect(list.find((r: any) => r.id === row.id)).toBeUndefined();
  });

  it("update id tidak ada → null", async () => {
    const r = await svc.updateMenuResearch("00000000-0000-0000-0000-000000000000", {
      decision: "rejected",
    });
    expect(r).toBeNull();
  });
});
