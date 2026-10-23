import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: "Owner", preview: vi.fn(), apply: vi.fn(), read: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: mocks.session }));
vi.mock("@/lib/material-reference", () => ({ previewMaterialReference: mocks.preview, applyMaterialReference: mocks.apply, getMaterialReference: mocks.read }));
import { GET, POST } from "./route";
import { GARAGE_MATERIAL_REFERENCE_HASH } from "@/lib/garage-material-reference-source";
import { createHash } from "node:crypto";

function request(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ source: "garage-2026-10-23", ...fields })) form.set(k, v);
  return new Request("http://localhost/api/wms/material-reference", { method: "POST", body: form });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.role = "Owner";
  mocks.session.mockImplementation(async (allowed: string[]) => allowed.includes(mocks.role)
    ? { data: { user: { id: "owner", name: "Owner" } }, response: null }
    : { data: null, response: Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) });
  mocks.preview.mockResolvedValue({ plan: { rows: [] } });
  mocks.apply.mockResolvedValue({ materialsCreated: 0 });
  mocks.read.mockResolvedValue({ plan: null });
});

describe("Material reference authorization and source handling", () => {
  it.each(["Kasir", "Waiter", "Manajer"])("blocks %s imports before parsing or service writes", async (role) => {
    mocks.role = role;
    expect((await POST(request({ mode: "apply" }))).status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("lets a Manager read references but denies cashier reads", async () => {
    mocks.role = "Manajer";
    expect((await GET()).status).toBe(200);
    mocks.role = "Kasir";
    expect((await GET()).status).toBe(403);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("previews exact bundled source without reuploading and only applies for explicit mode", async () => {
    expect((await POST(request())).status).toBe(200);
    const [input] = mocks.preview.mock.calls[0];
    expect(createHash("sha256").update(input.buffer).digest("hex")).toBe(GARAGE_MATERIAL_REFERENCE_HASH);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect((await POST(request({ mode: "apply", applyMetadata: "false" }))).status).toBe(200);
    expect(mocks.apply.mock.calls[0][0].applyMetadata).toBe(false);
  });
  it("rejects invalid confirmation, metadata flags and mode before mutations", async () => {
    expect((await POST(request({ confirmations: "not json" }))).status).toBe(400);
    expect((await POST(request({ confirmations: JSON.stringify([{ sourceSku: "KIT-001", packageQty: -2, canonicalUnit: "gr", costBasis: "package" }]) }))).status).toBe(400);
    expect((await POST(request({ applyMetadata: "surprise" }))).status).toBe(400);
    expect((await POST(request({ mode: "reset" }))).status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
