import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Profil karyawan 360°: data diri, penyamaran NIK/rekening untuk non-Owner,
// batas akses Manajer, salin data pelamar saat "Jadikan Karyawan", dokumen.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/staff-profile");
let storage: typeof import("@/lib/profile-file-storage");
let outletId = "";
let otherOutletId = "";
let tmpRoot = "";
const ids = { owner: "", manajer: "", barista: "", otherOutlet: "" };

function session(role: "Owner" | "Manajer", profileId: string, outlet = outletId): GarageSession {
  return {
    session: {} as GarageSession["session"],
    user: { id: role === "Owner" ? "u-owner" : "u-mgr", name: role === "Owner" ? "Owner Garage" : "Manajer Garage" } as GarageSession["user"],
    profile: {
      id: profileId,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Laptop",
      passwordResetRequired: false,
      outlet: { id: outlet, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as GarageSession;
}

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "garage-profile-"));
  process.env.GARAGE_PROJECT_ROOT = tmpRoot;
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: "u-seed" }));
  const db = t.getDb();
  const [other] = await db.insert(t.schema.outlets).values({ code: "OTH", name: "Outlet Lain" }).returning();
  otherOutletId = other.id;
  await db.insert(t.schema.user).values([
    { id: "u-owner", name: "Owner Garage", email: "owner@garage.id" },
    { id: "u-mgr", name: "Manajer Garage", email: "mgr@garage.id" },
    { id: "u-bar", name: "Budi Barista", email: "budi@garage.id" },
    { id: "u-oth", name: "Sari Lain", email: "sari@garage.id" },
  ]);
  const rows = await db
    .insert(t.schema.staffProfiles)
    .values([
      { userId: "u-owner", outletId, role: "Owner" },
      { userId: "u-mgr", outletId, role: "Manajer" },
      { userId: "u-bar", outletId, role: "Kasir", position: "Barista" },
      { userId: "u-oth", outletId: otherOutletId, role: "Kasir" },
    ] as any)
    .returning();
  ids.owner = rows[0].id;
  ids.manajer = rows[1].id;
  ids.barista = rows[2].id;
  ids.otherOutlet = rows[3].id;
  await db.insert(t.schema.staffWageConfig).values({
    staffUserId: "u-bar",
    absenCode: "BAR1",
    monthlySalary: 3_000_000,
    dailyWage: 100_000,
    joinDate: "2025-01-10",
  } as any);
  svc = await import("@/lib/staff-profile");
  storage = await import("@/lib/profile-file-storage");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
  await rm(tmpRoot, { recursive: true, force: true });
  delete process.env.GARAGE_PROJECT_ROOT;
});

describe("profil karyawan 360", () => {
  it("Owner menyimpan data diri lengkap & melihat NIK/rekening penuh", async () => {
    const owner = session("Owner", ids.owner);
    const res = await svc.updateStaffPersonal(
      ids.barista,
      svc.staffPersonalSchema.parse({
        whatsapp: "0812-3456-7890",
        address: "Jl. Sudirman 1, Tebing Tinggi",
        birthDate: "2000-05-01",
        gender: "Laki-laki",
        nik: "1276012345670012",
        bankName: "BNI",
        bankAccountNumber: "1234567890",
        bankAccountName: "Budi",
        emergencyName: "Ibu Budi",
        emergencyRelation: "Ibu",
        emergencyPhone: "081298765432",
        contractType: "kontrak",
        contractEnd: "2026-12-31",
      }),
      owner,
    );
    expect(res.updated).toContain("nik");
    const profile = await svc.getStaffProfile360(ids.barista, owner, new Date("2026-10-15T05:00:00Z"));
    expect(profile.personal.whatsapp).toBe("6281234567890");
    expect(profile.personal.nik).toBe("1276012345670012");
    expect(profile.personal.bankAccountNumber).toBe("1234567890");
    expect(profile.identity.absenCode).toBe("BAR1");
    expect(profile.identity.tenure).toBe("1 th 9 bln");
    expect(profile.pay.monthlySalary).toBe(3_000_000);
    expect(profile.canSeeSensitive).toBe(true);
    // Audit tidak membocorkan NIK.
    const logs = await t.getDb().select().from(t.schema.auditLogs);
    expect(JSON.stringify(logs)).not.toContain("1276012345670012");
    expect(profile.activity.some((log) => log.action.includes("data diri"))).toBe(true);
  });

  it("Manajer: NIK/rekening tersamar, tidak bisa mengubahnya, tidak bisa membuka Owner/outlet lain", async () => {
    const mgr = session("Manajer", ids.manajer);
    const profile = await svc.getStaffProfile360(ids.barista, mgr);
    expect(profile.personal.nik).toBe("1276••••••••0012");
    expect(profile.personal.bankAccountNumber).toBe("••••••7890");
    expect(profile.documents.ktpUrl).toBeNull();
    expect(profile.canEditSensitive).toBe(false);
    await expect(svc.updateStaffPersonal(ids.barista, { nik: "1111222233334444" }, mgr)).rejects.toMatchObject({ code: "OWNER_ONLY_FIELD" });
    await expect(svc.updateStaffPersonal(ids.barista, { address: "Alamat baru" }, mgr)).resolves.toMatchObject({ updated: ["address"] });
    await expect(svc.getStaffProfile360(ids.owner, mgr)).rejects.toMatchObject({ status: 403 });
    await expect(svc.getStaffProfile360(ids.otherOutlet, mgr)).rejects.toMatchObject({ status: 403 });
    await expect(svc.getStaffProfile360(ids.otherOutlet, session("Owner", ids.owner))).resolves.toBeTruthy();
  });

  it("validasi: NIK 16 digit, WA valid", () => {
    expect(svc.staffPersonalSchema.safeParse({ nik: "123" }).success).toBe(false);
    expect(svc.staffPersonalSchema.safeParse({ whatsapp: "12345" }).success).toBe(false);
    expect(svc.staffPersonalSchema.safeParse({ whatsapp: "", nik: "" }).success).toBe(true);
  });

  it("dokumen: magic bytes dicek, KTP hanya Owner, file milik karyawan lain ditolak", async () => {
    const png = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "a.png");
    const fake = new File([Buffer.from("<script>alert(1)</script>")], "a.png");
    const pdf = new File([Buffer.from("%PDF-1.4\n%%EOF")], "kontrak.pdf");
    await expect(storage.saveProfileFile("staff", ids.barista, fake, { allowPdf: true })).rejects.toMatchObject({ code: "FILE_UNSUPPORTED" });
    await expect(storage.saveProfileFile("staff", ids.barista, pdf, { allowPdf: false })).rejects.toMatchObject({ code: "FILE_UNSUPPORTED" });

    const name = await storage.saveProfileFile("staff", ids.barista, png, { allowPdf: false });
    const url = `/api/hr/staff/${ids.barista}/files/${name}`;
    const owner = session("Owner", ids.owner);
    const mgr = session("Manajer", ids.manajer);
    await svc.attachStaffDocument(ids.barista, "photo", url, null, owner);
    expect((await svc.getStaffProfile360(ids.barista, mgr)).identity.photoUrl).toBe(url);
    expect(await storage.readProfileFile("staff", ids.barista, name)).not.toBeNull();
    expect(await storage.readProfileFile("staff", ids.otherOutlet, name)).toBeNull();
    expect(await storage.readProfileFile("staff", ids.barista, "../../etc/passwd")).toBeNull();

    const ktpName = await storage.saveProfileFile("staff", ids.barista, pdf, { allowPdf: true });
    await expect(svc.attachStaffDocument(ids.barista, "ktp", `/api/hr/staff/${ids.barista}/files/${ktpName}`, null, mgr)).rejects.toMatchObject({ code: "OWNER_ONLY_FIELD" });
    await svc.attachStaffDocument(ids.barista, "ktp", `/api/hr/staff/${ids.barista}/files/${ktpName}`, null, owner);
    await expect(svc.assertCanReadStaffFile(ids.barista, ktpName, mgr)).rejects.toMatchObject({ code: "OWNER_ONLY_FIELD" });
    await expect(svc.assertCanReadStaffFile(ids.barista, ktpName, owner)).resolves.toBeUndefined();
    await expect(svc.assertCanReadStaffFile(ids.barista, name, mgr)).resolves.toBeUndefined();
    const mgrView = await svc.getStaffProfile360(ids.barista, mgr);
    expect(mgrView.documents.hasKtp).toBe(true);
    expect(mgrView.documents.ktpUrl).toBeNull();

    await svc.attachStaffDocument(ids.barista, "other", url, "SKCK", owner);
    expect((await svc.getStaffProfile360(ids.barista, owner)).documents.otherDocs).toEqual([{ label: "SKCK", url }]);
    await svc.removeStaffDocument(ids.barista, "other", url, owner);
    expect((await svc.getStaffProfile360(ids.barista, owner)).documents.otherDocs).toEqual([]);
  });

  it("Jadikan Karyawan: data pelamar terbawa tanpa menimpa isian yang sudah ada", async () => {
    const db = t.getDb();
    await db.insert(t.schema.user).values({ id: "payroll-ksr9", name: "Rina Kasir", email: "ksr9@absen.garage.local" });
    const [prof] = await db.insert(t.schema.staffProfiles).values({ userId: "payroll-ksr9", outletId, role: "Waiter" } as any).returning();
    await db.insert(t.schema.staffWageConfig).values({ staffUserId: "payroll-ksr9", absenCode: "KSR9", dailyWage: 0 } as any);
    await db.insert(t.schema.staffPersonal).values({ staffProfileId: prof.id, address: "Alamat dari Owner" });
    const [cand] = await db
      .insert(t.schema.candidates)
      .values({
        fullName: "Rina Kasir",
        whatsapp: "0813-1111-2222",
        email: "rina@mail.com",
        domicile: "Tebing Tinggi",
        birthDate: "2001-02-03",
        gender: "Perempuan",
        appliedPosition: "Kasir",
        photoUrl: "/api/recruitment/files/photo-x.jpg",
        ktpUrl: "/api/recruitment/files/ktp-x.jpg",
        cvUrl: "/api/recruitment/files/cv-x.pdf",
      } as any)
      .returning();
    expect(await svc.copyCandidateToStaffPersonal(cand.id, "KSR9")).toBe(prof.id);
    const profile = await svc.getStaffProfile360(prof.id, session("Owner", ids.owner));
    expect(profile.personal.whatsapp).toBe("6281311112222");
    expect(profile.personal.address).toBe("Alamat dari Owner");
    expect(profile.personal.birthDate).toBe("2001-02-03");
    expect(profile.personal.gender).toBe("Perempuan");
    expect(profile.documents.cvUrl).toBe("/api/recruitment/files/cv-x.pdf");
    expect(profile.identity.email).toBeNull();
  });
});

describe("helper", () => {
  it("maskSensitive & tenureLabel", () => {
    expect(svc.maskSensitive("1276012345670012")).toBe("1276••••••••0012");
    expect(svc.maskSensitive("1234567890", 0, 4)).toBe("••••••7890");
    expect(svc.maskSensitive(null)).toBeNull();
    expect(svc.tenureLabel("2026-10-01", "2026-10-15")).toBe("< 1 bln");
    expect(svc.tenureLabel("2024-08-20", "2026-10-15")).toBe("2 th 1 bln");
  });
});
