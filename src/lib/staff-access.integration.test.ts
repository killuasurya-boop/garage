import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// I3 — pengajuan akses staf + Owner Access Approval Center (PRD V4.0 §06.5–06.6).
// AC-I04 pending = tanpa profil staf; AC-I05 pemohon tak bisa memilih peran;
// AC-I06 Owner (2FA) setujui → profil atomik + audit; AC-I07 Manajer → 403 + audit.

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({ account: vi.fn(), garage: vi.fn() }));
vi.mock("@/lib/server-auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireAccountSession: mocks.account,
  requireGarageSession: mocks.garage,
}));

let t: GarageTestDb;
let svc: typeof import("@/lib/staff-access");
let outletId = "";
const OWNER = "user-i3-owner";
const MANAJER = "user-i3-manajer";

function as(userId: string, role: string): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: { id: `sp-${userId}`, role, shiftLabel: "Pagi", deviceLabel: "Laptop", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}

async function applicant(id: string) {
  await t.getDb().insert(t.schema.user).values({ id, name: `Pelamar ${id}`, email: `${id}@mail.test` });
  return { id, name: `Pelamar ${id}`, email: `${id}@mail.test`, emailVerified: false };
}

async function profileOf(userId: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.staffProfiles).where(eq(t.schema.staffProfiles.userId, userId));
  return row ?? null;
}

async function postRoute(path: string, body: unknown, params?: Record<string, string>) {
  const route = path === "request" ? await import("@/app/api/staff-access/request/route") : await import("@/app/api/control/access-requests/[id]/decision/route");
  const request = new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
  const res = params ? await (route as any).POST(request, { params: Promise.resolve(params) }) : await (route as any).POST(request);
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  await t.getDb().insert(t.schema.user).values({ id: MANAJER, name: "Manajer I3", email: `${MANAJER}@garage.id` });
  svc = await import("@/lib/staff-access");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("I3 — pengajuan akses staf", () => {
  it("AC-I04/I05: lamaran = pending tanpa profil staf; peran/outlet/status dari body diabaikan; WA dinormalisasi & disamarkan", async () => {
    const account = await applicant("app-1");
    mocks.account.mockResolvedValue({ data: account, response: null });
    const res = await postRoute("request", { legalName: "Budi Santoso", phone: "0812-3456-7890", requestedPosition: "Kasir", role: "Owner", outletId, status: "approved" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending_owner_approval");
    expect(await profileOf("app-1")).toBeNull();

    const mine = await svc.getMyAccessRequest("app-1");
    expect(mine).toMatchObject({ hasStaffProfile: false, request: { status: "pending_owner_approval", phone: "+62 812-****-7890" } });
    const { eq } = await import("drizzle-orm");
    const [row] = await t.getDb().select().from(t.schema.staffAccessRequests).where(eq(t.schema.staffAccessRequests.userId, "app-1"));
    expect(row).toMatchObject({ phone: "+6281234567890", approvedRole: null, approvedOutletId: null });

    await expect(svc.submitAccessRequest(account, { legalName: "Budi", phone: "123", requestedPosition: "Kasir" })).rejects.toMatchObject({ code: "INVALID_PHONE" });
  });

  it("AC-I07: Manajer memutuskan → 403 OWNER_ONLY + audit; Owner tanpa 2FA → TWO_FACTOR_REQUIRED", async () => {
    const [request] = await svc.listAccessRequests();
    mocks.garage.mockResolvedValue({ data: as(MANAJER, "Manajer"), response: null });
    const denied = await postRoute("decision", { decision: "approve", role: "Kasir", outletId, reason: "Lolos interview" }, { id: request.id });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("OWNER_ONLY");
    const { eq } = await import("drizzle-orm");
    const audits = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "Staff access decision denied"));
    expect(audits).toHaveLength(1);
    expect(await profileOf("app-1")).toBeNull();

    await expect(svc.decideAccessRequest(request.id, { decision: "reject", reason: "Tidak cocok" }, as(OWNER, "Owner"))).rejects.toMatchObject({ code: "TWO_FACTOR_REQUIRED" });
  });

  it("AC-I06: Owner (2FA) setujui → profil staf dengan peran & outlet pilihan Owner, atomik + audit; Owner tidak bisa diberikan", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.user).set({ twoFactorEnabled: true } as any).where(eq(t.schema.user.id, OWNER));
    const [request] = await svc.listAccessRequests();
    mocks.garage.mockResolvedValue({ data: as(OWNER, "Owner"), response: null });

    const ownerRole = await postRoute("decision", { decision: "approve", role: "Owner", outletId, reason: "Coba" }, { id: request.id });
    expect(ownerRole.status).toBe(400);

    const ok = await postRoute("decision", { decision: "approve", role: "Kasir", outletId, position: "Kasir Pagi", reason: "Lolos interview" }, { id: request.id });
    expect(ok.status).toBe(200);
    expect(await profileOf("app-1")).toMatchObject({ role: "Kasir", outletId, position: "Kasir Pagi", status: "active" });
    const [row] = await t.getDb().select().from(t.schema.staffAccessRequests).where(eq(t.schema.staffAccessRequests.id, request.id));
    expect(row).toMatchObject({ status: "approved", approvedRole: "Kasir", approvedOutletId: outletId, decidedBy: OWNER });
    const audits = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "Staff access approve"));
    expect(audits[0].metadata).toMatchObject({ before: { status: "pending_owner_approval" }, after: { status: "approved", role: "Kasir" }, reason: "Lolos interview" });

    // Sudah diputuskan → tidak bisa diputuskan ulang; pemohon tidak bisa mengajukan lagi.
    await expect(svc.decideAccessRequest(request.id, { decision: "reject", reason: "Ubah pikiran" }, as(OWNER, "Owner"))).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    await expect(svc.submitAccessRequest({ id: "app-1", name: "x", email: "x", emailVerified: false }, { legalName: "Budi Santoso", phone: "081234567890", requestedPosition: "Kasir" })).rejects.toMatchObject({ code: "ALREADY_STAFF" });
  });

  it("minta info → pemohon melengkapi → pending lagi; tolak wajib alasan & menutup pengajuan", async () => {
    const account = await applicant("app-2");
    const { id } = await svc.submitAccessRequest(account, { legalName: "Sari Dewi", phone: "+62 813 1111 2222", requestedPosition: "Barista" });
    const owner = as(OWNER, "Owner");
    await svc.decideAccessRequest(id, { decision: "request_info", reason: "Kirim pengalaman kerja" }, owner);
    expect((await svc.getMyAccessRequest("app-2")).request).toMatchObject({ status: "needs_info", infoRequest: "Kirim pengalaman kerja" });
    await svc.submitAccessRequest(account, { legalName: "Sari Dewi", phone: "081311112222", requestedPosition: "Barista", note: "2 tahun di kafe" });
    expect((await svc.getMyAccessRequest("app-2")).request?.status).toBe("pending_owner_approval");

    await expect(svc.decideAccessRequest(id, { decision: "reject", reason: " " }, owner)).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await svc.decideAccessRequest(id, { decision: "reject", reason: "Posisi sudah terisi" }, owner);
    expect((await svc.getMyAccessRequest("app-2")).request).toMatchObject({ status: "rejected", decisionReason: "Posisi sudah terisi" });
    await expect(svc.submitAccessRequest(account, { legalName: "Sari Dewi", phone: "081311112222", requestedPosition: "Barista" })).rejects.toMatchObject({ code: "REQUEST_CLOSED" });
    expect(await profileOf("app-2")).toBeNull();
  });
});
