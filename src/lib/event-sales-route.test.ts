import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), canUse: vi.fn(), report: vi.fn(), audit: vi.fn(), csv: vi.fn(() => "csv"),
}));
vi.mock("@/lib/server-auth", () => ({ requirePermission: mocks.session }));
vi.mock("@/lib/role-access", () => ({ canUseApiAs: mocks.canUse }));
vi.mock("@/lib/garage-service", () => ({ createAuditLog: mocks.audit }));
vi.mock("@/lib/event-sales-report", async (original) => ({
  ...await original<typeof import("@/lib/event-sales-report")>(), getEventSalesReport: mocks.report, eventSalesCsv: mocks.csv,
}));

import { GET } from "@/app/api/events/[id]/sales/route";

const id = "d1552d72-58de-4c30-8148-da94bb32f38f";
const outletId = "8952a4e8-b8ec-470e-a315-3592f91c27a7";
const context = () => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: {
    user: { id: "owner", name: "Owner" }, profile: { role: "Owner", outlet: { id: outletId }, deviceLabel: "OS" },
  }, response: null });
  mocks.canUse.mockReturnValue(true);
  mocks.report.mockResolvedValue({ event: { id, title: "Event" }, summary: { bills: 1 } });
  mocks.audit.mockResolvedValue(undefined);
});

describe("event report API authorization", () => {
  it("requires event access before reading financial data", async () => {
    mocks.session.mockResolvedValue({ data: null, response: new Response("Forbidden", { status: 403 }) });
    const response = await GET(new Request("https://garage.test/api/event/sales"), context());
    expect(response.status).toBe(403);
    expect(mocks.session).toHaveBeenCalledWith("events:manage");
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("also enforces finance permission", async () => {
    mocks.canUse.mockReturnValue(false);
    const response = await GET(new Request("https://garage.test/api/event/sales"), context());
    expect(response.status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("takes the outlet from the authenticated session, not a query override", async () => {
    const response = await GET(new Request("https://garage.test/api/event/sales?from=2026-10-21&to=2026-10-21&outletId=forged"), context());
    expect(response.status).toBe(200);
    expect(mocks.report).toHaveBeenCalledWith({ eventId: id, outletId, from: "2026-10-21", to: "2026-10-21" });
  });
  it("does not allow managers to bypass the Owner-only CSV permission", async () => {
    mocks.canUse.mockImplementation((_profile, permission) => permission !== "events:export");
    const response = await GET(new Request("https://garage.test/api/event/sales?format=csv"), context());
    expect(response.status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("records a successful CSV export in the audit log", async () => {
    const response = await GET(new Request("https://garage.test/api/event/sales?from=2026-10-21&to=2026-10-21&format=csv"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { eventId: id, outletId, from: "2026-10-21", to: "2026-10-21", bills: 1 } }));
  });
});
