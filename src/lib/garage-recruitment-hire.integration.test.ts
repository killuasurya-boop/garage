import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// REKRUTMEN → SDM: cek status lamaran wajib WA + email (bukan nomor saja), dan
// pelamar "Diterima" bisa dijadikan karyawan Payroll V2 tepat sekali.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const auth = vi.hoisted(() => ({ role: "Owner", outletId: "" }));
vi.mock("@/lib/server-auth", () => ({
  requireGarageSession: async (roles?: string[]) => {
    if (roles && !roles.includes(auth.role)) {
      return { response: new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "x" } }), { status: 403 }) };
    }
    return {
      data: {
        user: { id: "user-itest", name: "Owner Test", email: "owner@garage.id" },
        profile: { role: auth.role, deviceLabel: "OS", outlet: { id: auth.outletId } },
      },
    };
  },
}));

let t: GarageTestDb;
let candidateId: string;

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}` },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded: any = await seedGarageBasics(t);
  auth.outletId = seeded.outletId;
  const [row] = await t
    .getDb()
    .insert(t.schema.candidates)
    .values({
      fullName: "Rina Pelamar",
      whatsapp: "0812-3456-7890",
      email: "Rina@Example.com",
      domicile: "Tebing Tinggi",
      appliedPosition: "Barista",
    })
    .returning({ id: t.schema.candidates.id });
  candidateId = row.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Cek status lamaran — 2 faktor", () => {
  it("nomor WA saja (email salah) → 404, tidak membocorkan data", async () => {
    const { POST } = await import("@/app/api/recruitment/track-status/route");
    const res = await POST(post("http://x/api/recruitment/track-status", { whatsapp: "081234567890", email: "lain@example.com" }));
    expect(res.status).toBe(404);
  });

  it("WA format +62 + email beda huruf besar → ketemu, tanpa nomor WA di respons", async () => {
    const { POST } = await import("@/app/api/recruitment/track-status/route");
    const res = await POST(post("http://x/api/recruitment/track-status", { whatsapp: "+62 812 3456 7890", email: "rina@example.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.application.fullName).toBe("Rina Pelamar");
    expect(json.data.application.whatsapp).toBeUndefined();
  });
});

describe("Jadikan karyawan", () => {
  const params = () => ({ params: Promise.resolve({ id: candidateId }) });
  const body = { monthlySalary: 2_500_000, joinDate: "2026-10-12", shiftStart: "08:00" };

  it("status belum Diterima → 409", async () => {
    const { POST } = await import("@/app/api/recruitment/candidates/[id]/hire/route");
    const res = await POST(post("http://x", body), params());
    expect(res.status).toBe(409);
  });

  it("selain Owner → 403", async () => {
    auth.role = "Manajer";
    const { POST } = await import("@/app/api/recruitment/candidates/[id]/hire/route");
    const res = await POST(post("http://x", body), params());
    expect(res.status).toBe(403);
    auth.role = "Owner";
  });

  it("Diterima → karyawan dibuat sekali (kode + PIN), klik ulang ditolak", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.candidates).set({ status: "Diterima" }).where(eq(t.schema.candidates.id, candidateId));
    const { POST } = await import("@/app/api/recruitment/candidates/[id]/hire/route");

    const res = await POST(post("http://x", body), params());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.code).toBeTruthy();
    expect(json.data.pin).toMatch(/^\d+$/);
    expect(json.data.name).toBe("Rina Pelamar");

    const [cand] = await t.getDb().select().from(t.schema.candidates).where(eq(t.schema.candidates.id, candidateId));
    expect(cand.hiredEmployeeCode).toBe(json.data.code);
    expect(cand.hiredAt).toBeTruthy();

    const profiles = await t.getDb().select().from(t.schema.staffProfiles).where(eq(t.schema.staffProfiles.position, "Barista"));
    expect(profiles.length).toBe(1);

    const again = await POST(post("http://x", body), params());
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("CANDIDATE_ALREADY_HIRED");
  });
});
