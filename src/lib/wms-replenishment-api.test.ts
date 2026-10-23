import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { session, save, get, transition, list, report } = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), get: vi.fn(), transition: vi.fn(), list: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: session }));
vi.mock("@/lib/wms-replenishment", () => ({ saveClosing: save, getReplenishment: get, transitionReplenishment: transition, listReplenishments: list, getClosingReport: report }));
import { GET as listRequests, POST as create } from "@/app/api/wms/replenishment/requests/route";
import { PATCH as edit } from "@/app/api/wms/replenishment/requests/[id]/route";
import { POST as action } from "@/app/api/wms/replenishment/requests/[id]/actions/route";
import { GET as exportReport } from "@/app/api/wms/replenishment/reports/route";

const id = "e87e9c30-f01c-4bdb-9343-4be22d8ff0a9";
const actor = { id: "staff-bar", name: "Bar Staff", role: "Kasir", workstation: "bar", position: "Barista", outletId: "outlet-a" };
const payload = { idempotencyKey: "closing-api-test", division: "bar", businessDate: "2026-10-23", neededDate: "2026-10-24", warehouseId: id, items: [{ productId: id, physicalQty: 1, targetQty: 10, requestedQty: 9 }] };
const req = (body: unknown, method = "POST") => new Request("https://garage.test/api/wms/replenishment/requests", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ response: null, data: { user: { id: actor.id, name: actor.name }, profile: { role: actor.role, workstation: actor.workstation, position: actor.position, outlet: { id: actor.outletId } } } });
  save.mockResolvedValue({ id, version: 1, status: "draft" });
  transition.mockResolvedValue({ id, version: 2, status: "under_review" });
  list.mockResolvedValue([]);
});

describe("Closing API authorization and retry boundary", () => {
  it("blocks anonymous calls before hitting the service", async () => {
    session.mockResolvedValue({ data: null, response: Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }) });
    expect((await create(req(payload))).status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });
  it("derives user, outlet and capabilities only from authenticated session", async () => {
    expect((await create(req(payload))).status).toBe(201);
    expect(save).toHaveBeenCalledWith(actor, expect.objectContaining({ idempotencyKey: payload.idempotencyKey, division: "bar" }));
    expect((await create(req({ ...payload, outletId: "outlet-b" }))).status).toBe(400);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("cannot retarget a route edit to another document or omit version", async () => {
    expect((await edit(req({ ...payload, id: "765dcb19-1f4f-4866-9086-3f0563d64c68", version: 1 }, "PATCH"), params)).status).toBe(400);
    expect((await edit(req(payload, "PATCH"), params)).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps backend scoped denials and optimistic conflicts as 403/409", async () => {
    const forbidden = Object.assign(new Error("Divisi tidak diizinkan."), { status: 403, code: "FORBIDDEN" });
    save.mockRejectedValueOnce(forbidden);
    const res = await create(req(payload));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Divisi tidak diizinkan." } });
    transition.mockRejectedValueOnce(Object.assign(new Error("Versi berubah."), { status: 409, code: "STALE_VERSION" }));
    expect((await action(req({ action: "review", idempotencyKey: "action-api-test", version: 1 }), params)).status).toBe(409);
  });
  it("rejects malformed filters instead of querying the whole report", async () => {
    expect((await listRequests(new Request("https://garage.test/?division=finance"))).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
  it("exports every filtered row and labels generator and period", async () => {
    const lines = Array.from({ length: 250 }, (_, n) => ({ doc: `CLOSE-${n}`, division: "bar", businessDate: "2026-10-23", neededDate: "2026-10-24", status: "submitted", sku: `SKU-${n}`, name: `Bahan ${n}`, unit: "ml", systemQty: 10, physicalQty: null, variance: null, requestedQty: 1, approvedQty: 0, dispatchedQty: 0, receivedQty: 0, damagedQty: 0, shortageQty: 1, estimatedCost: 20 }));
    report.mockResolvedValue({ generatedAt: "2026-10-23T16:00:00Z", totalRequests: 250, lateRequests: 0, openRequests: 250, lines });
    const res = await exportReport(new Request("https://garage.test/?format=csv&from=2026-10-23&to=2026-10-24&division=bar"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("2026-10-23");
    const text = await res.text();
    expect(text).toContain("GARAGE COFFEE");
    expect(text).toContain("Bar Staff");
    expect(text).toContain("SKU-249");
    expect(report).toHaveBeenCalledWith(actor, { from: "2026-10-23", to: "2026-10-24", division: "bar" });
  });
  it("renders parseable XLSX/PDF using the same scoped report data", async () => {
    report.mockResolvedValue({ generatedAt: "2026-10-23T16:00:00Z", totalRequests: 0, lateRequests: 0, openRequests: 0, lines: [] });
    const xlsx = await exportReport(new Request("https://garage.test/?format=xlsx&neededDate=2026-10-24"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await xlsx.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet("Ringkasan")?.getCell("A1").value).toBe("GARAGE COFFEE");
    expect(JSON.stringify(workbook.getWorksheet("Ringkasan")?.getSheetValues())).toContain("Bar Staff");
    const pdf = await exportReport(new Request("https://garage.test/?format=pdf&neededDate=2026-10-24"));
    const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(pdf.status).toBe(200);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

});
