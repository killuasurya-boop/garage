import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Phase 3 — Smart Stock Opname & Loss Control (integrasi PGlite + route handler).
// Sesi login di-mock; service, ledger, dan DB asli.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const auth = vi.hoisted(() => ({ role: "Owner", userId: "u-owner", name: "Owner Test" }));
vi.mock("@/lib/server-auth", () => {
  const session = () => ({ data: { user: { id: auth.userId, name: auth.name }, profile: { role: auth.role } }, response: null });
  const deny = () => ({ data: null, response: new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status: 403 }) });
  return {
    requireGarageSession: vi.fn(async (roles?: string[]) => (roles && !roles.includes(auth.role) ? deny() : session())),
    requirePermission: vi.fn(async () => session()),
  };
});

let t: GarageTestDb;
let wms: any;
let barId = "";
let mainId = "";
const P: Record<string, string> = {};

const as = (role: string, userId: string) => {
  auth.role = role;
  auth.userId = userId;
  auth.name = `${role} ${userId}`;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function onHand(productId: string, warehouseId = barId) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.wmsWarehouseStock).where(and(eq(t.schema.wmsWarehouseStock.productId, productId), eq(t.schema.wmsWarehouseStock.warehouseId, warehouseId)));
  return Number(row?.qty ?? 0);
}
async function stockIn(productId: string, qty: number, hpp: number, warehouseId = barId) {
  await wms.runInTx((tx: any) => wms.recordStockMovement(tx, { type: "in", productId, warehouseId, deltaQty: qty, hpp, refDoc: "TEST-IN" }));
}
async function lineOf(opId: string, productId: string) {
  return (await wms.getWmsOpname(opId)).lines.find((l: any) => l.productId === productId);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  const whs = await wms.listWmsWarehouses();
  barId = whs.find((w: any) => w.type === "bar").id;
  mainId = whs.find((w: any) => w.type === "main").id;
  for (const id of ["u-owner", "u-mgr", "u-kasir-a", "u-kasir-b"]) {
    await t.getDb().insert(t.schema.user).values({ id, name: id, email: `${id}@garage.id` }).onConflictDoNothing();
  }
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Smart Opname", area: "bar" }).onConflictDoNothing();
  const mk = async (key: string, unit: string, packPrice: number, packQty: number) => {
    const p = await wms.createWmsProduct({ sku: `T-SO-${key}`, name: `Bahan ${key}`, category: "Bar · Smart Opname", unit, packPrice, packQty });
    P[key] = p.id;
  };
  await mk("gula", "gr", 20_000, 1000); // Rp20/gr
  await mk("susu", "ml", 18_000, 1000); // Rp18/ml
  await mk("kopi", "gr", 300_000, 1000); // Rp300/gr (mahal)
  await mk("sirup", "ml", 100_000, 1000);
  await mk("nol", "pcs", 5_000, 1); // belum pernah ada stok (cycle)
  await stockIn(P.gula, 5000, 20);
  await stockIn(P.susu, 2000, 18);
  await stockIn(P.kopi, 2000, 300);
  await stockIn(P.sirup, 1000, 100);
  await stockIn(P.gula, 3000, 20, mainId);
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

beforeEach(() => as("Owner", "u-owner"));

describe("3A — izin lokasi & hitung buta di API", () => {
  it("Kasir tidak bisa melihat, mengisi, atau mengirim opname Gudang Utama; daftar ikut tersaring", async () => {
    const detail = await import("@/app/api/wms/opname/[id]/route");
    const submit = await import("@/app/api/wms/opname/[id]/submit/route");
    const list = await import("@/app/api/wms/opname/route");
    const op = await wms.createWmsOpname(mainId, "u-owner");
    const line = await lineOf(op.id, P.gula);

    as("Kasir", "u-kasir-a");
    expect((await detail.GET(new Request("http://x"), ctx(op.id))).status).toBe(403);
    expect((await detail.PATCH(new Request("http://x", json({ lineId: line.id, physicalQty: 1 }, "PATCH")), ctx(op.id))).status).toBe(403);
    expect((await submit.POST(new Request("http://x", json({})), ctx(op.id))).status).toBe(403);
    const created = await list.POST(new Request("http://x", json({ warehouseId: mainId })));
    expect(created.status).toBe(403);
    const rows = (await (await list.GET()).json()).data;
    expect(rows.some((r: any) => r.id === op.id)).toBe(false);
    expect(await lineOf(op.id, P.gula)).toMatchObject({ counted: false }); // tidak ada yang tertulis
  });

  it("penghitung blind tidak melihat stok sistem maupun hitungan penghitung lain; respons PATCH tidak bocor", async () => {
    const detail = await import("@/app/api/wms/opname/[id]/route");
    const op = await wms.createWmsOpname(barId, "u-owner");
    const gula = await lineOf(op.id, P.gula);
    const susu = await lineOf(op.id, P.susu);

    as("Kasir", "u-kasir-a");
    const res = await detail.PATCH(new Request("http://x", json({ lineId: gula.id, physicalQty: 4990, clientRequestId: "req-a-0001" }, "PATCH")), ctx(op.id));
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(Object.keys(body).sort()).toEqual(["id", "savedAt"]);

    const mine = (await (await detail.GET(new Request("http://x"), ctx(op.id))).json()).data;
    expect(mine.blind).toBe(true);
    expect(mine.approvalTier).toBeNull();
    expect(mine.lines.find((l: any) => l.id === gula.id)).toMatchObject({ physicalQty: 4990, systemQty: null, variance: null, varianceValue: null, classification: null });

    as("Kasir", "u-kasir-b");
    await detail.PATCH(new Request("http://x", json({ lineId: susu.id, physicalQty: 2000, clientRequestId: "req-b-0001" }, "PATCH")), ctx(op.id));
    const other = (await (await detail.GET(new Request("http://x"), ctx(op.id))).json()).data;
    expect(other.lines.find((l: any) => l.id === gula.id)).toMatchObject({ counted: true, physicalQty: null }); // milik kasir A
    expect(other.lines.find((l: any) => l.id === susu.id)).toMatchObject({ physicalQty: 2000 });

    as("Manajer", "u-mgr");
    const review = (await (await detail.GET(new Request("http://x"), ctx(op.id))).json()).data;
    expect(review.lines.find((l: any) => l.id === gula.id)).toMatchObject({ systemQty: 5000, physicalQty: 4990, variance: -10 });
  });

  it("autosave idempoten: clientRequestId sama tidak menambah percobaan/riwayat", async () => {
    const op = await wms.createWmsOpname(barId, "u-owner");
    const line = await lineOf(op.id, P.susu);
    await wms.saveWmsOpnameLine(line.id, 2000, op.id, "u-kasir-a", { clientRequestId: "dup-0000001" });
    await wms.saveWmsOpnameLine(line.id, 2000, op.id, "u-kasir-a", { clientRequestId: "dup-0000001" });
    expect((await lineOf(op.id, P.susu)).attempts).toBe(1);
    expect((await wms.listOpnameCounts(op.id)).filter((c: any) => c.count.lineId === line.id)).toHaveLength(1);
  });
});

describe("3B/3C — snapshot, toleransi, hitung ulang, persetujuan", () => {
  it("snapshot saat dihitung: receiving & penjualan sesudahnya tetap berlaku setelah posting", async () => {
    const op = await wms.createWmsOpname(barId, "u-kasir-a");
    const line = await lineOf(op.id, P.susu);
    const before = await onHand(P.susu);
    await wms.saveWmsOpnameLine(line.id, before - 2, op.id, "u-kasir-a"); // kurang 2 ml (≤ 5 ml toleransi)
    await stockIn(P.susu, 500, 18); // penerimaan sesudah dihitung
    await wms.runInTx((tx: any) => wms.recordStockMovement(tx, { type: "out", productId: P.susu, warehouseId: barId, deltaQty: -100, hpp: 18, refDoc: "SALE" }));
    expect((await lineOf(op.id, P.susu)).classification).toBe("minor");
    await wms.submitWmsOpname(op.id, "u-kasir-a");
    await wms.finalizeWmsOpname(op.id, "u-mgr", { approverRole: "Manajer" });
    expect(await onHand(P.susu)).toBe(before - 2 + 500 - 100);
  });

  it("di luar toleransi → wajib hitung ulang; hitungan pertama tersimpan; tetap beda → review Manajer", async () => {
    const op = await wms.createWmsOpname(barId, "u-kasir-a");
    const line = await lineOf(op.id, P.gula);
    const sys = await onHand(P.gula);
    await wms.saveWmsOpnameLine(line.id, sys - 400, op.id, "u-kasir-a"); // −400 gr × Rp20 = −8.000 (8%)
    let l = await lineOf(op.id, P.gula);
    expect(l).toMatchObject({ classification: "recount", needsRecount: true });
    await expect(wms.submitWmsOpname(op.id, "u-kasir-a")).rejects.toThrow(/dihitung ulang/);
    await wms.saveWmsOpnameLine(line.id, sys - 380, op.id, "u-kasir-a");
    l = await lineOf(op.id, P.gula);
    expect(l).toMatchObject({ classification: "manager", needsRecount: false, attempts: 2, firstPhysicalQty: sys - 400, physicalQty: sys - 380 });
    const history = (await wms.listOpnameCounts(op.id)).filter((c: any) => c.count.lineId === line.id).map((c: any) => [c.count.attempt, c.count.kind, Number(c.count.physicalQty)]);
    expect(history).toEqual([[1, "count", sys - 400], [2, "recount", sys - 380]]);
    await wms.submitWmsOpname(op.id, "u-kasir-a");
    await wms.finalizeWmsOpname(op.id, "u-mgr", { approverRole: "Manajer" });
  });

  it("route hitung ulang: Kasir ditolak; Manajer wajib alasan; sesi kembali draft", async () => {
    const recount = await import("@/app/api/wms/opname/[id]/recount/route");
    const op = await wms.createWmsOpname(barId, "u-kasir-a");
    const line = await lineOf(op.id, P.sirup);
    await wms.saveWmsOpnameLine(line.id, await onHand(P.sirup), op.id, "u-kasir-a");
    await wms.submitWmsOpname(op.id, "u-kasir-a");
    as("Kasir", "u-kasir-a");
    expect((await recount.POST(new Request("http://x", json({ lineIds: [line.id], reason: "cek rak" })), ctx(op.id))).status).toBe(403);
    as("Manajer", "u-mgr");
    expect((await recount.POST(new Request("http://x", json({ lineIds: [line.id], reason: "" })), ctx(op.id))).status).toBe(400);
    expect((await recount.POST(new Request("http://x", json({ lineIds: [line.id], reason: "Cek rak atas" })), ctx(op.id))).status).toBe(200);
    const after = await wms.getWmsOpname(op.id);
    expect(after.status).toBe("draft");
    expect(after.lines.find((x: any) => x.id === line.id)).toMatchObject({ needsRecount: true, recountReason: "Cek rak atas" });
    await expect(wms.submitWmsOpname(op.id, "u-kasir-a")).rejects.toThrow(/dihitung ulang/);
    await wms.saveWmsOpnameLine(line.id, await onHand(P.sirup), op.id, "u-kasir-a");
    await wms.submitWmsOpname(op.id, "u-kasir-a");
    await wms.finalizeWmsOpname(op.id, "u-mgr", { approverRole: "Manajer" });
  });

  it("selisih kritis (≥ Rp250.000) wajib Owner; nilai diposting per baris; finalisasi paralel hanya sekali", async () => {
    const op = await wms.createWmsOpname(barId, "u-kasir-a");
    const line = await lineOf(op.id, P.kopi);
    const sys = await onHand(P.kopi);
    await wms.saveWmsOpnameLine(line.id, sys - 1000, op.id, "u-kasir-a"); // −1000 gr × Rp300 = −300.000
    expect((await lineOf(op.id, P.kopi)).classification).toBe("owner");
    await wms.submitWmsOpname(op.id, "u-kasir-a");
    await expect(wms.finalizeWmsOpname(op.id, "u-mgr", { approverRole: "Manajer" })).rejects.toThrow(/Owner/);
    const results = await Promise.allSettled([
      wms.finalizeWmsOpname(op.id, "u-owner", { approverRole: "Owner", allowSelfApproval: true }),
      wms.finalizeWmsOpname(op.id, "u-owner", { approverRole: "Owner", allowSelfApproval: true }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await onHand(P.kopi)).toBe(sys - 1000);
    const { eq, and } = await import("drizzle-orm");
    const moves = await t.getDb().select().from(t.schema.wmsStockMovement).where(and(eq(t.schema.wmsStockMovement.productId, P.kopi), eq(t.schema.wmsStockMovement.type, "adjustment")));
    expect(moves).toHaveLength(1);
    const [posted] = await t.getDb().select().from(t.schema.wmsOpnameLine).where(eq(t.schema.wmsOpnameLine.id, line.id));
    expect(Number(posted.postedVariance)).toBe(-1000);
    expect(Number(posted.postedValue)).toBe(-300_000);
    expect(Number(posted.postedRate)).toBe(300);
  });

  it("cakupan penuh wajib semua dihitung; cycle count memuat bahan bersaldo 0", async () => {
    const full = await wms.createWmsOpname(barId, "u-kasir-a", { kind: "monthly", scope: "full" });
    const one = (await wms.getWmsOpname(full.id)).lines[0];
    await wms.saveWmsOpnameLine(one.id, Number(one.systemQty), full.id, "u-kasir-a");
    await expect(wms.submitWmsOpname(full.id)).rejects.toThrow(/penuh/);
    const cycle = await wms.createWmsOpname(barId, "u-mgr", { scope: "cycle", productIds: [P.kopi, P.nol] });
    const d = await wms.getWmsOpname(cycle.id);
    expect(d.scope).toBe("cycle");
    expect(d.lines.map((l: any) => l.productId).sort()).toEqual([P.kopi, P.nol].sort());
    expect(d.lines.find((l: any) => l.productId === P.nol).systemQty).toBe(0);
    await expect(wms.createWmsOpname(barId, "u-mgr", { scope: "cycle" })).rejects.toThrow(/daftar bahan/);
  });
});

describe("3D/3E — metrik kerugian & laporan", () => {
  it("gross shortage/surplus, waste tercatat tidak dobel, tak terjelaskan, net, akurasi, cakupan", async () => {
    const { getWmsLossReport, summarizeLoss } = await import("@/lib/wms-loss");
    const { recordWmsWaste } = await import("@/lib/wms-waste");
    // Jendela mulai SETELAH tes sebelumnya selesai, supaya hanya opname tes ini yang terhitung.
    await new Promise((r) => setTimeout(r, 20));
    const from = new Date();
    await recordWmsWaste({ warehouseId: barId, productId: P.sirup, qty: 100, reason: "spill" }, { userId: "u-mgr", name: "Mgr", elevated: true }); // 100 × Rp100 = 10.000
    const op = await wms.createWmsOpname(barId, "u-kasir-a");
    const gula = await lineOf(op.id, P.gula);
    const sirup = await lineOf(op.id, P.sirup);
    const susu = await lineOf(op.id, P.susu);
    await wms.saveWmsOpnameLine(gula.id, (await onHand(P.gula)) - 3, op.id, "u-kasir-a"); // −60 (minor, ≤5 gr)
    await wms.saveWmsOpnameLine(sirup.id, (await onHand(P.sirup)) + 4, op.id, "u-kasir-a"); // +400 (minor)
    await wms.saveWmsOpnameLine(susu.id, await onHand(P.susu), op.id, "u-kasir-a"); // sesuai
    await wms.submitWmsOpname(op.id, "u-kasir-a");
    await wms.finalizeWmsOpname(op.id, "u-mgr", { approverRole: "Manajer" });
    const r = await getWmsLossReport({ from, to: new Date(Date.now() + 60_000), warehouseIds: [barId] });
    expect(r.opnameCount).toBe(1);
    expect(r.summary).toMatchObject({ grossShortage: 60, grossSurplus: 400, recordedWaste: 10_000, unexplained: 60, net: 340, totalLoss: 10_060, countedLines: 3, accurateLines: 3, accuracyPct: 100 });
    expect(r.summary.activePairs).toBeGreaterThanOrEqual(4);
    expect(r.summary.coveragePct).toBe(Math.round((3 / r.summary.activePairs) * 1000) / 10);
    expect(r.wasteByReason).toEqual({ spill: 10_000 });
    expect(r.top10[0]).toMatchObject({ productId: P.sirup, wasteValue: 10_000 });
    // Surplus tidak menutupi kekurangan bahan lain; persen tidak dibagi nol.
    expect(summarizeLoss({ lines: [], wasteValues: [], activePairs: 0 })).toMatchObject({ accuracyPct: null, coveragePct: null, valueAccuracyPct: null });
  });

  it("opname di luar periode tidak ikut; tidak ada beban/jurnal keuangan baru dari opname", async () => {
    const { getWmsLossReport } = await import("@/lib/wms-loss");
    const past = await getWmsLossReport({ from: new Date("2020-01-01T00:00:00Z"), to: new Date("2020-02-01T00:00:00Z") });
    expect(past.opnameCount).toBe(0);
    expect(past.summary.grossShortage).toBe(0);
    const expenses = await t.getDb().select().from(t.schema.expenses);
    expect(expenses.filter((e: any) => /opname|OPN-/i.test(`${e.sourceDoc ?? ""} ${e.description ?? ""}`))).toHaveLength(0);
  });

  it("route laporan: hanya Owner/Manajer; ekspor PDF/XLSX/CSV; validasi periode", async () => {
    const loss = await import("@/app/api/wms/opname/loss/route");
    as("Kasir", "u-kasir-a");
    expect((await loss.GET(new Request("http://x/api/wms/opname/loss"))).status).toBe(403);
    as("Manajer", "u-mgr");
    expect((await loss.GET(new Request("http://x/api/wms/opname/loss?period=yearly"))).status).toBe(400);
    expect((await loss.GET(new Request("http://x/api/wms/opname/loss?date=2026-02-30"))).status).toBe(400);
    const okJson = await loss.GET(new Request("http://x/api/wms/opname/loss?period=weekly"));
    expect(okJson.status).toBe(200);
    for (const [format, type] of [["pdf", "application/pdf"], ["xlsx", "spreadsheet"], ["csv", "text/csv"]] as const) {
      const res = await loss.GET(new Request(`http://x/api/wms/opname/loss?period=monthly&format=${format}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(type);
      expect(res.headers.get("content-disposition")).toMatch(new RegExp(`\\.${format}"$`));
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
    }
  }, 60_000);
});

describe("3F — prioritas, rekomendasi, Aya read-only", () => {
  it("skor prioritas: bahan bernilai tinggi/sering selisih di atas; alasan terbaca", async () => {
    const { getCycleCountPriorities } = await import("@/lib/wms-cycle-count");
    const r = await getCycleCountPriorities(barId, { limit: 10 });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].productId).toBe(P.kopi); // nilai stok terbesar + kerugian 300rb
    expect(r.items[0].reasons.length).toBeGreaterThan(0);
    for (let i = 1; i < r.items.length; i++) expect(r.items[i - 1].score).toBeGreaterThanOrEqual(r.items[i].score);
  });

  it("rekomendasi: bukti & batasan wajib, tidak dobel saat diperbarui, abaikan wajib alasan", async () => {
    const { refreshOpnameInsights, listOpnameActions } = await import("@/lib/wms-opname-insights");
    const first = await refreshOpnameInsights();
    expect(first.created).toBeGreaterThan(0);
    const again = await refreshOpnameInsights();
    expect(again.created).toBe(0);
    const rows = await listOpnameActions({ status: "active" });
    const high = rows.find((r: any) => r.action.rule === "high_value_shortage" && r.action.productId === P.kopi);
    expect(high?.action).toMatchObject({ ownerRole: "Owner", confidence: "high" });
    expect(high?.action.limitation.length).toBeGreaterThan(10);
    expect(high?.action.evidence).toMatchObject({ value: -300_000 });
    for (const r of rows) expect(r.action.finding).not.toMatch(/curi|pencuri|maling|salah (kasir|karyawan)/i);

    const patch = await import("@/app/api/wms/opname/actions/[id]/route");
    as("Manajer", "u-mgr");
    expect((await patch.PATCH(new Request("http://x", json({ status: "dismissed" }, "PATCH")), ctx(high!.action.id))).status).toBe(400);
    expect((await patch.PATCH(new Request("http://x", json({ status: "in_progress" }, "PATCH")), ctx(high!.action.id))).status).toBe(200);
    as("Kasir", "u-kasir-a");
    expect((await patch.PATCH(new Request("http://x", json({ status: "done" }, "PATCH")), ctx(high!.action.id))).status).toBe(403);
  });

  it("tool Aya opname hanya baca dan hanya untuk Owner/Manajer", async () => {
    const { warehouseTools } = await import("@/lib/agent-tools-gudang");
    const names = ["ringkasan_loss_opname", "prioritas_cycle_count", "rekomendasi_opname"];
    const tools = warehouseTools.filter((x) => names.includes(x.name));
    expect(tools).toHaveLength(3);
    expect(tools.every((x) => x.write === false && x.risk === "R0")).toBe(true);
    expect(warehouseTools.some((x) => x.write && /opname/.test(x.name))).toBe(false);
    const kasir: any = { user: { id: "u-kasir-a" }, profile: { role: "Kasir" } };
    for (const tool of tools) await expect(tool.run(kasir, tool.name === "prioritas_cycle_count" ? { ruangId: barId } : {})).rejects.toThrow(/Owner\/Manajer/);
    const owner: any = { user: { id: "u-owner" }, profile: { role: "Owner" } };
    const loss: any = await tools.find((x) => x.name === "ringkasan_loss_opname")!.run(owner, { periode: "monthly" });
    expect(loss.ringkasan).toHaveProperty("unexplained");
  });
});

describe("Performa", () => {
  it("opname 300 bahan: buat sesi, hitung semua, laporan & prioritas dalam waktu wajar", async () => {
    const values = Array.from({ length: 300 }, (_, i) => ({ sku: `T-PERF-${i}`, name: `Perf ${i}`, category: "Bar · Smart Opname", unit: "pcs", hpp: 1000 }));
    const prods = await t.getDb().insert(t.schema.wmsProduct).values(values).returning({ id: t.schema.wmsProduct.id });
    await t.getDb().insert(t.schema.wmsWarehouseStock).values(prods.map((p: any) => ({ productId: p.id, warehouseId: barId, qty: 10 })));
    const started = Date.now();
    const op = await wms.createWmsOpname(barId, "u-mgr", { scope: "full" });
    const d = await wms.getWmsOpname(op.id);
    expect(d.lines.length).toBeGreaterThanOrEqual(300);
    const { getCycleCountPriorities } = await import("@/lib/wms-cycle-count");
    const pr = await getCycleCountPriorities(barId, { limit: 20 });
    expect(pr.items).toHaveLength(20);
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 120_000);
});
