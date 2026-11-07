import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Batch 7 Document Approval: versi dokumen baru = pengajuan APP-DOC; baru berlaku setelah Owner
// menyetujui; ditolak → versi berlaku lama tetap; Manajer tidak bisa memutus/melihat; STALE bila
// versi lain diputus sejak Owner membuka. DB uji PGlite, bukan produksi.

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("server-only", () => ({}));
let t: GarageTestDb;
let cc: typeof import("@/lib/company-control");
let svc: any;
let dc: any;
let storageDir = "";
let outletId = "";
let docId = "";
const OWNER = "user-da-owner";
const MANAJER = "user-da-manajer";

function session(id: string, role: string): GarageSession {
  return {
    user: { id, name: `Uji ${role}`, email: `${id}@garage.id` },
    profile: { id: `sp-${id}`, role: role as Role, shiftLabel: "Pagi", deviceLabel: "TEST", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}
const owner = () => session(OWNER, "Owner");
const manajer = () => session(MANAJER, "Manajer");

async function upload(text: string) {
  const data = Buffer.from(text);
  return cc.saveCompanyDocumentVersion({ documentId: docId, fileName: "sop.md", mimeType: "text/markdown", sizeBytes: data.length, data, garage: owner() });
}
async function doc() {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.companyDocuments).where(eq(t.schema.companyDocuments.id, docId));
  return row;
}
async function version(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.companyDocumentVersions).where(eq(t.schema.companyDocumentVersions.id, id));
  return row;
}

beforeAll(async () => {
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-da-storage-"));
  process.env.GARAGE_STORAGE_BASE_DIR = storageDir;
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.user).values({ id: MANAJER, name: "Manajer DA", email: `${MANAJER}@garage.id` });
  cc = await import("@/lib/company-control");
  svc = await import("@/lib/garage-service");
  dc = await import("@/lib/decision-center-server");
  docId = (await cc.createCompanyDocument({ title: "SOP Tutup Toko", category: "SOP", ownerRole: "Owner" } as any, owner())).id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
  delete process.env.GARAGE_STORAGE_BASE_DIR;
  fs.rmSync(storageDir, { recursive: true, force: true });
});

describe("Document Approval (APP-DOC)", () => {
  it("unggah = versi menunggu + pengajuan; belum berlaku; sidik file tersimpan", async () => {
    const v1 = await upload("SOP versi satu");
    expect(v1.reviewStatus).toBe("pending");
    expect(v1.sha256).toBe(createHash("sha256").update("SOP versi satu").digest("hex"));
    expect(v1.approvalId).toBe(`APP-DOC-${v1.id}`);
    const approval = await svc.getApprovalById(v1.approvalId);
    expect(approval.status).toBe("pending");
    expect((await doc()).currentVersion).toBe(1);
    expect((await doc()).approvedVersion).toBeNull();
  });

  it("Manajer tidak melihat & tidak bisa memutus pengajuan dokumen", async () => {
    const [v] = (await cc.getCompanyDocumentVersions(docId, "Owner" as Role))!;
    const forManajer = await svc.getApprovalData({ status: "pending", viewer: manajer() });
    expect(forManajer.some((a: any) => a.id === v.approvalId)).toBe(false);
    await expect(svc.decideApproval(v.approvalId, { status: "approved" }, manajer())).rejects.toThrow(/hanya diputus Owner/);
    await expect(svc.reviewApproval(v.approvalId, { action: "defer", note: "nanti dulu" }, manajer())).rejects.toThrow(/hanya diputus Owner/);
    expect((await version(v.id)).reviewStatus).toBe("pending");
  });

  it("Owner setuju lewat Decision Center → versi berlaku + pelaksanaan berhasil", async () => {
    const [v] = (await cc.getCompanyDocumentVersions(docId, "Owner" as Role))!;
    const detail = await dc.getDecisionDetail(owner(), v.approvalId);
    expect(detail.approval.category).toBe("dokumen");
    expect(detail.explanation.recommendation.title).toMatch(/Baca dulu/);
    const result = await dc.decideFromDecisionCenter(owner(), v.approvalId, { action: "approve", note: "sudah dibaca", expectedSnapshotHash: detail.snapshotHash });
    expect(result.executed).toBe(true);
    expect((await version(v.id)).reviewStatus).toBe("approved");
    expect((await doc()).approvedVersion).toBe(1);
  });

  it("ditolak → versi berlaku lama tetap; file tidak dihapus", async () => {
    const v2 = await upload("SOP versi dua yang salah");
    await svc.decideApproval(v2.approvalId, { status: "rejected", reasonDecided: "isi belum benar" }, owner());
    const row = await version(v2.id);
    expect(row.reviewStatus).toBe("rejected");
    expect(row.reviewNote).toBe("isi belum benar");
    expect((await doc()).approvedVersion).toBe(1);
    expect((await doc()).currentVersion).toBe(2);
    expect(fs.existsSync(path.join(storageDir, row.storagePath))).toBe(true);
  });

  it("STALE: versi lain disetujui sejak dibuka → keputusan lama ditolak", async () => {
    const v3 = await upload("SOP versi tiga");
    const v4 = await upload("SOP versi empat");
    const seenV3 = await dc.getDecisionDetail(owner(), v3.approvalId);
    await svc.decideApproval(v4.approvalId, { status: "approved" }, owner());
    expect((await doc()).approvedVersion).toBe(4);
    await expect(
      dc.decideFromDecisionCenter(owner(), v3.approvalId, { action: "approve", note: "ok", expectedSnapshotHash: seenV3.snapshotHash }),
    ).rejects.toMatchObject({ code: "STALE" });
    const fresh = await dc.getDecisionDetail(owner(), v3.approvalId);
    expect(fresh.explanation.recommendation.title).toMatch(/versi lebih lama/);
    expect((await version(v3.id)).reviewStatus).toBe("pending");
  });
});
