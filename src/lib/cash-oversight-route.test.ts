import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  oversight: vi.fn(async (input: unknown) => ({ input })),
}));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: mocks.session }));
vi.mock("@/lib/cash-oversight", () => ({
  getCashOversight: mocks.oversight,
  jakartaDateKey: (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date),
}));
vi.mock("@/lib/cash-oversight-xlsx", () => ({ oversightWorkbook: vi.fn() }));

import { GET } from "@/app/api/control/cash-oversight/route";

describe("GET /api/control/cash-oversight", () => {
  beforeEach(() => {
    mocks.session.mockReset();
    mocks.oversight.mockClear();
  });

  it("hanya Owner: selain Owner ditolak sebelum data dibaca", async () => {
    mocks.session.mockResolvedValue({ data: null, response: new Response(null, { status: 403 }) });
    const res = await GET(new Request("http://x/api/control/cash-oversight"));
    expect(res.status).toBe(403);
    expect(mocks.session).toHaveBeenCalledWith(["Owner"]);
    expect(mocks.oversight).not.toHaveBeenCalled();
  });

  it("validasi query & default 7 hari", async () => {
    mocks.session.mockResolvedValue({ data: {}, response: null });
    expect((await GET(new Request("http://x/api/control/cash-oversight?from=2026-10-10&to=2026-10-01"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/control/cash-oversight?from=10-10-2026"))).status).toBe(400);
    const res = await GET(new Request("http://x/api/control/cash-oversight?to=2026-10-25"));
    expect(res.status).toBe(200);
    expect(mocks.oversight).toHaveBeenCalledWith({ fromDate: "2026-10-19", toDate: "2026-10-25", outletId: null });
  });
});
