import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Rekrutmen aman (Owner 19 Nov 2026): pesan lamaran dobel netral, nomor dinormalisasi, lamaran ditolak saat
// lowongan tutup, sapuan berkas (sampah > 24 jam + masa simpan habis), audit pembukaan KTP, batas penyimpanan.

/* eslint-disable @typescript-eslint/no-explicit-any */
const auth = vi.hoisted(() => ({ role: "Owner", outletId: "" }));
vi.mock("@/lib/server-auth", () => ({
  requireGarageSession: async (roles?: string[]) => {
    if (roles && !roles.includes(auth.role)) {
      return { response: new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "x" } }), { status: 403 }) };
    }
    return { data: { user: { id: "user-rs", name: "Owner RS" }, profile: { role: auth.role, deviceLabel: "OS", outlet: { id: auth.outletId } } } };
  },
}));

let t: GarageTestDb;
let root = "";
const prevRoot = process.env.GARAGE_PROJECT_ROOT;
const dir = () => path.join(root, "storage", "recruitment");
const fileUrl = (name: string) => `/api/recruitment/files/${name}`;
const DAY = 86_400_000;

function post(body: unknown) {
  return new Request("http://x/api/recruitment/apply", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` },
    body: JSON.stringify(body),
  });
}

const application = (extra: Record<string, unknown> = {}) => ({
  fullName: "Sinta Pelamar",
  whatsapp: "0813-1111-2222",
  email: "sinta@example.com",
  domicile: "Tebing Tinggi",
  appliedPosition: "Barista",
  education: "SMA",
  lastExperience: "Barista 1 tahun",
  mainSkill: "Manual brew",
  skillLevel: "Menengah",
  cvUrl: fileUrl("cv-1763500000000-aaaaaaa1.pdf"),
  photoUrl: fileUrl("photo-1763500000000-aaaaaaa2.jpg"),
  consent: true,
  ...extra,
});

beforeAll(async () => {
  root = path.join(os.tmpdir(), `garage-rs-${process.pid}-${Date.now()}`);
  process.env.GARAGE_PROJECT_ROOT = root;
  await mkdir(dir(), { recursive: true });
  t = await setupGarageTestDb();
  auth.outletId = ((await seedGarageBasics(t)) as any).outletId;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
  await rm(root, { recursive: true, force: true });
  if (prevRoot === undefined) delete process.env.GARAGE_PROJECT_ROOT;
  else process.env.GARAGE_PROJECT_ROOT = prevRoot;
});

describe("Form Lamar", () => {
  it("tidak ada lowongan dibuka → lamaran ditolak", async () => {
    const { listOpenPositions } = await import("@/lib/garage-recruitment-positions-service");
    await listOpenPositions(); // isi lowongan bawaan dulu
    await t.getDb().update(t.schema.recruitmentPositions).set({ isOpen: false });
    const { POST } = await import("@/app/api/recruitment/apply/route");
    const res = await POST(post(application()));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("RECRUITMENT_CLOSED");
  });

  it("lamaran dobel (nomor beda format / email beda huruf) → 409 netral tanpa tanggal & status", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.recruitmentPositions).set({ isOpen: true }).where(eq(t.schema.recruitmentPositions.title, "Barista"));
    const { POST } = await import("@/app/api/recruitment/apply/route");
    const first = await POST(post(application()));
    expect(first.status).toBe(201);
    await t.getDb().update(t.schema.candidates).set({ status: "Interview" });

    for (const extra of [{ whatsapp: "+62 813 1111 2222", email: "lain@example.com" }, { whatsapp: "0899 0000 0000", email: "SINTA@example.com" }]) {
      const res = await POST(post(application(extra)));
      expect(res.status).toBe(409);
      const { error } = await res.json();
      expect(error.code).toBe("DUPLICATE_APPLICATION");
      expect(error.message).toContain("Cek Status");
      expect(error.message).not.toContain("Interview");
      expect(error.message).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    }
  });
});

describe("Sapuan berkas pelamar", () => {
  it("hapus sampah > 24 jam & berkas pelamar habis masa simpan; pelamar diterima & aktif tetap", async () => {
    const { eq } = await import("drizzle-orm");
    const names = {
      orphanOld: "cv-1763500000001-bbbbbbb1.pdf",
      orphanNew: "cv-1763500000002-bbbbbbb2.pdf",
      rejectedKtp: "ktp-1763500000003-bbbbbbb3.jpg",
      hiredKtp: "ktp-1763500000004-bbbbbbb4.jpg",
      activeCv: "cv-1763500000005-bbbbbbb5.pdf",
    };
    const now = new Date();
    for (const name of Object.values(names)) await writeFile(path.join(dir(), name), "x");
    const old = new Date(now.getTime() - 2 * DAY);
    for (const name of [names.orphanOld, names.rejectedKtp, names.hiredKtp, names.activeCv]) await utimes(path.join(dir(), name), old, old);

    const db = t.getDb();
    const base = { domicile: "TT", appliedPosition: "Kasir" };
    const [rejected] = await db
      .insert(t.schema.candidates)
      .values({ ...base, fullName: "Ditolak Lama", whatsapp: "081200000001", email: "a@x.id", status: "Ditolak", ktpUrl: fileUrl(names.rejectedKtp), cvParsedData: { nama: "x" }, updatedAt: new Date(now.getTime() - 181 * DAY) } as any)
      .returning();
    await db.insert(t.schema.candidates).values({ ...base, fullName: "Karyawan", whatsapp: "081200000002", email: "b@x.id", status: "Diterima", hiredAt: now, ktpUrl: fileUrl(names.hiredKtp), updatedAt: new Date(now.getTime() - 400 * DAY) } as any);
    await db.insert(t.schema.candidates).values({ ...base, fullName: "Masih Proses", whatsapp: "081200000003", email: "c@x.id", status: "Baru", cvUrl: fileUrl(names.activeCv), updatedAt: new Date(now.getTime() - 100 * DAY) } as any);

    const { sweepRecruitmentFiles } = await import("@/lib/recruitment-storage");
    const result = await sweepRecruitmentFiles(now);
    expect(result).toMatchObject({ expiredCandidates: 1, removedExpired: 1 });
    expect(result.removedOrphans).toBeGreaterThanOrEqual(1);

    const left = await readdir(dir());
    expect(left).toEqual(expect.arrayContaining([names.orphanNew, names.hiredKtp, names.activeCv]));
    expect(left).not.toContain(names.orphanOld);
    expect(left).not.toContain(names.rejectedKtp);
    const [after] = await db.select().from(t.schema.candidates).where(eq(t.schema.candidates.id, rejected.id));
    expect(after).toMatchObject({ fullName: "Ditolak Lama", status: "Ditolak", ktpUrl: null, cvParsedData: null });

    // Aman diulang
    expect(await sweepRecruitmentFiles(now)).toMatchObject({ expiredCandidates: 0, removedExpired: 0 });
  });
});

describe("Waktu keputusan", () => {
  it("status berubah → status_changed_at diisi; ubah catatan saja tidak menggesernya", async () => {
    const { eq } = await import("drizzle-orm");
    const { updateCandidate } = await import("@/lib/garage-recruitment-service");
    const [c] = await t.getDb().insert(t.schema.candidates).values({ fullName: "Waktu", whatsapp: "081200000099", email: "w@x.id", domicile: "TT", appliedPosition: "Kasir" } as any).returning();
    await updateCandidate(c.id, { status: "Ditolak" } as any);
    const [a] = await t.getDb().select().from(t.schema.candidates).where(eq(t.schema.candidates.id, c.id));
    expect(a.statusChangedAt).toBeTruthy();
    await new Promise((r) => setTimeout(r, 5));
    await updateCandidate(c.id, { notes: "catatan admin" } as any);
    const [b] = await t.getDb().select().from(t.schema.candidates).where(eq(t.schema.candidates.id, c.id));
    expect(b.statusChangedAt?.getTime()).toBe(a.statusChangedAt?.getTime());
    expect(b.updatedAt.getTime()).toBeGreaterThan(a.updatedAt.getTime());
  });
});

describe("Berkas pelamar", () => {
  it("membuka KTP tercatat di Audit; berkas lain tidak", async () => {
    const ktp = "ktp-1763500000009-ccccccc1.jpg";
    const cv = "cv-1763500000009-ccccccc2.pdf";
    await writeFile(path.join(dir(), ktp), "x");
    await writeFile(path.join(dir(), cv), "x");
    const { GET } = await import("@/app/api/recruitment/files/[file]/route");
    const count = async () => (await t.getDb().select().from(t.schema.auditLogs)).filter((a: any) => a.action === "Buka KTP pelamar").length;
    const before = await count();
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ file: cv }) })).status).toBe(200);
    expect(await count()).toBe(before);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ file: ktp }) })).status).toBe(200);
    expect(await count()).toBe(before + 1);
  });

  it("penyimpanan penuh → unggahan ditolak 507", async () => {
    const storage = await import("@/lib/recruitment-storage");
    const { RECRUITMENT_STORAGE_CAP_BYTES } = await import("@/lib/recruitment-retention");
    expect(await storage.recruitmentStorageHasRoom(1024)).toBe(true);
    storage.noteRecruitmentUpload(RECRUITMENT_STORAGE_CAP_BYTES);
    const { POST } = await import("@/app/api/recruitment/upload/route");
    const form = new FormData();
    form.set("kind", "cv");
    form.set("file", new File([Buffer.from("%PDF-1.4 test")], "cv.pdf", { type: "application/pdf" }));
    const res = await POST(new Request("http://x/api/recruitment/upload", { method: "POST", headers: { "x-forwarded-for": "10.77.0.1" }, body: form }));
    expect(res.status).toBe(507);
    expect((await res.json()).error.code).toBe("RECRUITMENT_STORAGE_FULL");
  });
});
