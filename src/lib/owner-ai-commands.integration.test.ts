import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Owner AI Command Center in-app (blueprint V3 ADR-001, AC-09/13/14/15/16/18): mesin yang sama
// dengan ChatGPT — preview tidak mengubah apa pun, satu token = satu eksekusi, argumen berubah
// ditolak, R3 tanpa kode 2FA ditolak, receipt bersumber layar Owner + sidik, audit sebelum aksi.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let cmd: typeof import("@/lib/owner-ai-commands");
const OWNER = "user-oac-owner";

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "WEB-OWNER",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const owner = () => as(OWNER, "Owner");

async function price() {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select({ price: t.schema.menuVariants.price })
    .from(t.schema.menuVariants)
    .where(and(eq(t.schema.menuVariants.itemId, "itm-coffee"), eq(t.schema.menuVariants.variantId, "reg")));
  return row.price as number;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, outletId, role: "Owner", status: "active" }).onConflictDoNothing();
  cmd = await import("@/lib/owner-ai-commands");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("katalog", () => {
  it("per domain, dengan skema input & risiko; tool khusus ChatGPT disembunyikan", () => {
    const domains = cmd.listOwnerCommandTools(owner());
    const names = domains.flatMap((d) => d.tools.map((tool) => tool.name));
    expect(names).toEqual(expect.arrayContaining(["daftar_menu", "ubah_harga_varian", "ubah_data_garage", "garage_ping"]));
    expect(names).not.toContain("garage_verify_connection");
    const harga = domains.flatMap((d) => d.tools).find((tool) => tool.name === "ubah_harga_varian")!;
    expect(harga).toMatchObject({ risk: "R2", write: true, needsConfirmation: true });
    expect((harga.inputSchema as any).properties).toHaveProperty("hargaBaru");
  });
});

describe("jalankan perintah", () => {
  it("R0 langsung jalan + tercatat di audit (sumber layar Owner)", async () => {
    const { eq } = await import("drizzle-orm");
    const result = (await cmd.runOwnerCommand(owner(), { tool: "garage_ping", args: {} })) as any;
    expect(result).toMatchObject({ status: "OK", jalur: "garage_owner_ui" });
    const audit = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.device, cmd.OWNER_UI_DEVICE));
    expect(audit.some((row: any) => row.object === "garage_ping" && row.metadata?.source === "garage_owner_ui")).toBe(true);
  });

  it("R2: preview tidak mengubah harga; konfirmasi → tepat satu perubahan + receipt bersidik; token tidak bisa dipakai ulang", async () => {
    const before = await price();
    const args = { menuId: "itm-coffee", variantId: "reg", hargaLama: before, hargaBaru: before + 2_000, alasan: "uji command center" };
    const preview = (await cmd.runOwnerCommand(owner(), { tool: "ubah_harga_varian", args })) as any;
    expect(preview).toMatchObject({ status: "PERLU_KONFIRMASI", dijalankan: false, risiko: "R2" });
    expect(await price()).toBe(before);

    // Argumen berubah setelah preview → ditolak (rencana yang disetujui harus sama persis).
    await expect(
      cmd.runOwnerCommand(owner(), { tool: "ubah_harga_varian", args: { ...args, hargaBaru: before + 9_000 }, konfirmasi: preview.konfirmasi }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_ARGS_CHANGED" });

    const done = (await cmd.runOwnerCommand(owner(), { tool: "ubah_harga_varian", args, konfirmasi: preview.konfirmasi })) as any;
    expect(done.status).toBe("BERHASIL");
    expect(done.receipt).toMatchObject({ sumber: "garage_owner_ui", risiko: "R2", operasiId: preview.operasiId });
    expect(done.receipt.sidikArgumen).toMatch(/^[0-9a-f]{64}$/);
    expect(done.receipt.sidikHasil).toMatch(/^[0-9a-f]{64}$/);
    expect(await price()).toBe(before + 2_000);

    await expect(cmd.runOwnerCommand(owner(), { tool: "ubah_harga_varian", args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({
      code: "CONFIRMATION_USED",
    });
    expect(await price()).toBe(before + 2_000);

    // Receipt dari timeline = sidik yang sama (bisa dihitung ulang dari data tersimpan).
    const ops = await cmd.listOwnerOperations(OWNER, { source: "garage_owner_ui" });
    const op = ops.find((o) => o.operationId === preview.operasiId)!;
    expect(op).toMatchObject({ status: "EXECUTED", sumber: "garage_owner_ui", sidikHasil: done.receipt.sidikHasil });
  });

  it("R3 tanpa kode 2FA ditolak, token tetap belum terpakai", async () => {
    const args = { tanggal: "2026-10-01" };
    const preview = (await cmd.runOwnerCommand(owner(), { tool: "tutup_buku_harian", args })) as any;
    expect(preview).toMatchObject({ status: "PERLU_KONFIRMASI", risiko: "R3", butuhKode2fa: true });
    await expect(cmd.runOwnerCommand(owner(), { tool: "tutup_buku_harian", args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({
      code: "KODE_2FA_WAJIB",
    });
    const op = await cmd.getOperation(preview.operasiId, OWNER);
    expect(op?.status).toBe("PENDING");
  });

  it("tool khusus ChatGPT & tool tak dikenal ditolak dengan kode yang jelas", async () => {
    await expect(cmd.runOwnerCommand(owner(), { tool: "garage_verify_connection", args: { kode: "AAAA-AAAA" } })).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    await expect(cmd.runOwnerCommand(owner(), { tool: "jalankan_sql", args: {} })).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
  });

  it("Manajer tidak melihat operasi Owner (receipt terikat akun)", async () => {
    const ops = await cmd.listOwnerOperations("user-lain", {});
    expect(ops).toEqual([]);
  });
});
