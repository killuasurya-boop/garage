import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Dokumen perusahaan & pelatihan (audit 29 Okt 2026 #9): hak lihat per peran,
// unggah versi (format/ukuran/tipe dari ekstensi), unduh di dalam folder penyimpanan,
// pelatihan hanya untuk peran sasaran & selesai idempoten.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
// `server-only` disediakan Next.js saat build; di vitest cukup modul kosong.
vi.mock("server-only", () => ({}));
let t: GarageTestDb;
let cc: typeof import("@/lib/company-control");
let storageDir = "";
const OWNER = "user-cc-owner";
const KASIR = "user-cc-kasir";

const session = (id: string, role: string) =>
  ({ user: { id, name: `Uji ${role}`, email: `${id}@garage.id` }, profile: { role, deviceLabel: "TEST" } }) as any;

beforeAll(async () => {
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-cc-storage-"));
  process.env.GARAGE_STORAGE_BASE_DIR = storageDir;
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: OWNER });
  await t.getDb().insert(t.schema.user).values({ id: KASIR, name: "Kasir CC", email: `${KASIR}@garage.id` });
  cc = await import("@/lib/company-control");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
  delete process.env.GARAGE_STORAGE_BASE_DIR;
  fs.rmSync(storageDir, { recursive: true, force: true });
});

describe("hak kelola & lihat dokumen", () => {
  it("hanya Owner yang mengelola", () => {
    expect(cc.canManageCompanyControl("Owner" as any)).toBe(true);
    for (const role of ["Manajer", "Kasir", "Waiter"]) expect(cc.canManageCompanyControl(role as any)).toBe(false);
  });

  it("dokumen tanpa daftar peran → semua peran internal; dokumen terbatas tidak terlihat Kasir", async () => {
    const open = await cc.createCompanyDocument(
      { title: "SOP Buka Toko", category: "SOP", ownerRole: "Owner" } as any,
      session(OWNER, "Owner"),
    );
    expect(open.allowedRoles).toEqual(["Owner", "Manajer", "Kasir", "Waiter"]);
    const secret = await cc.createCompanyDocument(
      { title: "Kontrak Pemilik", category: "Legal", ownerRole: "Owner", allowedRoles: ["Owner", "Manajer"] } as any,
      session(OWNER, "Owner"),
    );

    const kasirDocs = (await cc.getCompanyDocuments("Kasir" as any)).map((d) => d.id);
    expect(kasirDocs).toContain(open.id);
    expect(kasirDocs).not.toContain(secret.id);
    expect((await cc.getCompanyDocuments("Owner" as any)).map((d) => d.id)).toContain(secret.id);
    expect(await cc.getCompanyDocumentVersions(secret.id, "Kasir" as any)).toBeNull();
    expect(await cc.getCompanyDocumentVersions(secret.id, "Manajer" as any)).toEqual([]);
  });
});

describe("unggah & unduh versi", () => {
  let docId = "";
  const upload = (fileName: string, mimeType: string, data = Buffer.from("isi dokumen")) =>
    cc.saveCompanyDocumentVersion({ documentId: docId, fileName, mimeType, sizeBytes: data.length, data, garage: session(OWNER, "Owner") });

  beforeAll(async () => {
    docId = (
      await cc.createCompanyDocument(
        { title: "Panduan Kasir", category: "SOP", ownerRole: "Owner", allowedRoles: ["Owner", "Kasir"] } as any,
        session(OWNER, "Owner"),
      )
    ).id;
  });

  it("menolak ekstensi di luar daftar walau browser mengaku text/plain", async () => {
    await expect(upload("virus.exe", "text/plain")).rejects.toThrow(/Format belum didukung/);
    await expect(upload("gambar.svg", "application/pdf")).rejects.toThrow(/Format belum didukung/);
    await expect(upload("tanpa-ekstensi", "application/pdf")).rejects.toThrow(/Format belum didukung/);
  });

  it("menolak file kosong dan > 25 MB", async () => {
    await expect(
      cc.saveCompanyDocumentVersion({ documentId: docId, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 0, data: Buffer.alloc(0), garage: session(OWNER, "Owner") }),
    ).rejects.toThrow(/kosong/);
    await expect(
      cc.saveCompanyDocumentVersion({ documentId: docId, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 25 * 1024 * 1024 + 1, data: Buffer.from("x"), garage: session(OWNER, "Owner") }),
    ).rejects.toThrow(/25 MB/);
  });

  it("versi bertambah, tipe disimpan dari ekstensi (bukan klaim browser), file di folder penyimpanan", async () => {
    const v1 = await upload("panduan.pdf", "text/html");
    expect(v1).toMatchObject({ version: 1, mimeType: "application/pdf", originalFileName: "panduan.pdf" });
    const v2 = await upload("Panduan.MD", "application/octet-stream", Buffer.from("# revisi"));
    expect(v2).toMatchObject({ version: 2, mimeType: "text/markdown" });

    const file = await cc.getCompanyDocumentVersionForDownload(docId, v2.id, "Kasir" as any);
    expect(file!.path.startsWith(path.join(storageDir, "storage", "company-documents") + path.sep)).toBe(true);
    expect(fs.readFileSync(file!.path, "utf8")).toBe("# revisi");
    const docs = await cc.getCompanyDocuments("Kasir" as any);
    expect(docs.find((d) => d.id === docId)).toMatchObject({ currentVersion: 2, latestVersion: { version: 2 } });
  });

  it("unduhan ditolak untuk peran yang tidak berhak atau versi milik dokumen lain", async () => {
    const [v] = (await cc.getCompanyDocumentVersions(docId, "Owner" as any))!;
    expect(await cc.getCompanyDocumentVersionForDownload(docId, v.id, "Waiter" as any)).toBeNull();
    const other = await cc.createCompanyDocument({ title: "Dokumen Lain", category: "SOP", ownerRole: "Owner" } as any, session(OWNER, "Owner"));
    expect(await cc.getCompanyDocumentVersionForDownload(other.id, v.id, "Owner" as any)).toBeNull();
  });

  it("jalur penyimpanan di luar folder dokumen ditolak (termasuk folder berawalan sama)", async () => {
    const { eq } = await import("drizzle-orm");
    const [v] = (await cc.getCompanyDocumentVersions(docId, "Owner" as any))!;
    for (const bad of ["storage/company-documents-lain/x.pdf", "storage/company-documents/../../etc/passwd"]) {
      await t.getDb().update(t.schema.companyDocumentVersions).set({ storagePath: bad }).where(eq(t.schema.companyDocumentVersions.id, v.id));
      await expect(cc.getCompanyDocumentVersionForDownload(docId, v.id, "Owner" as any)).rejects.toThrow(/Invalid company document storage path/);
    }
  });
});

describe("pelatihan", () => {
  it("hanya peran sasaran yang melihat & menyelesaikan; selesai dua kali tetap satu baris", async () => {
    const { and, eq } = await import("drizzle-orm");
    const ownerOnly = await cc.createTrainingCourse(
      { title: "Rekonsiliasi Bank", category: "Keuangan", targetRoles: ["Owner"] } as any,
      session(OWNER, "Owner"),
    );
    const forAll = await cc.createTrainingCourse({ title: "Layanan Pelanggan", category: "Servis" } as any, session(OWNER, "Owner"));
    expect(forAll.targetRoles).toEqual(["Owner", "Manajer", "Kasir", "Waiter"]);

    const kasir = session(KASIR, "Kasir");
    const visible = (await cc.getTrainingCourses(kasir)).map((c) => c.id);
    expect(visible).toContain(forAll.id);
    expect(visible).not.toContain(ownerOnly.id);
    await expect(cc.completeTrainingCourse(ownerOnly.id, kasir)).rejects.toThrow(/tidak tersedia/);

    await cc.completeTrainingCourse(forAll.id, kasir);
    await cc.completeTrainingCourse(forAll.id, kasir);
    const rows = await t
      .getDb()
      .select()
      .from(t.schema.trainingProgress)
      .where(and(eq(t.schema.trainingProgress.userId, KASIR), eq(t.schema.trainingProgress.courseId, forAll.id)));
    expect(rows).toHaveLength(1);
    expect((await cc.getTrainingCourses(kasir)).find((c) => c.id === forAll.id)?.progressStatus).toBe("completed");
  });
});
