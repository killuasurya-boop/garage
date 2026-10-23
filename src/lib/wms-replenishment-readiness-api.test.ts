import { beforeEach, describe, expect, it, vi } from "vitest";
const { session, diagnose } = vi.hoisted(() => ({ session: vi.fn(), diagnose: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: session }));
vi.mock("@/lib/wms-replenishment-readiness", () => ({ getClosingReadiness: diagnose }));
import { GET } from "@/app/api/wms/replenishment/readiness/route";
beforeEach(() => { vi.resetAllMocks(); });
describe("Configuration readiness HTTP boundary", () => {
  it("requires management session and does not query diagnostics after session denial", async () => {
    session.mockResolvedValue({ response: Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) });
    expect((await GET()).status).toBe(403);
    expect(session).toHaveBeenCalledWith(["Owner", "Manajer"]);
    expect(diagnose).not.toHaveBeenCalled();
  });
  it("uses session outlet, returns factual diagnostics, and prevents cached readiness", async () => {
    session.mockResolvedValue({ response: null, data: { user: { id: "owner", name: "Owner" }, profile: { role: "Owner", workstation: null, position: null, outlet: { id: "outlet-a" } } } });
    diagnose.mockResolvedValue({ ready: false, scope: "configuration_only", issues: [{ code: "DIVISION_LOCATION_REQUIRED" }] });
    const result = await GET();
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(diagnose).toHaveBeenCalledWith(expect.objectContaining({ id: "owner", outletId: "outlet-a", role: "Owner" }));
    expect(await result.json()).toMatchObject({ data: { ready: false, scope: "configuration_only" } });
  });
});
