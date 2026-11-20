import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), proof: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: mocks.session }));
vi.mock("@/lib/garage-courier", async () => {
  const { CourierError } = await import("@/lib/delivery-workflow");
  return { CourierError, assertCanReadDeliveryProof: mocks.proof };
});
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
import { CourierError } from "@/lib/delivery-workflow";
import { GET } from "@/app/api/courier/proof/[file]/route";

const file = "proof-12345678-1234-4234-8234-123456789012-1795168800000-1234abcd.jpg";
const staff = { user: { id: "staff" } };
const call = (name = file) => GET(new Request("http://localhost/proof"), { params: Promise.resolve({ file: name }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ response: null, data: staff });
  mocks.proof.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
});

describe("private delivery proof route", () => {
  it("requires a session before touching a proof file", async () => {
    mocks.session.mockResolvedValue({ response: new Response(null, { status: 401 }), data: null });
    expect((await call()).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.proof).not.toHaveBeenCalled();
  });
  it("checks the order authorization before reading from disk", async () => {
    mocks.proof.mockRejectedValue(new CourierError("Foto tidak ditemukan.", 404));
    expect((await call()).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects traversal without calling the file store", async () => {
    expect((await call("../proof.jpg")).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("serves an authorized photo without retaining access in browser caches", async () => {
    const response = await call();
    expect(mocks.proof).toHaveBeenCalledWith(file, staff);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });
});
