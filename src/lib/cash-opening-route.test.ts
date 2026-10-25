import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  status: vi.fn(async () => ({ scopes: [] })),
  certify: vi.fn(),
}));
vi.mock("@/lib/server-auth", () => ({ requireGarageSession: mocks.session }));
vi.mock("@/lib/cash-opening", async () => {
  const { z } = await import("zod");
  class CashOpeningError extends Error {
    constructor(public code: string, message: string, public status = 409) {
      super(message);
    }
  }
  return {
    CashOpeningError,
    getOpeningStatus: mocks.status,
    certifyOpeningBalance: mocks.certify,
    certifyOpeningSchema: z.object({ account: z.enum(["petty", "bank_jago", "bank_bni"]), countedBalance: z.number().int().min(0), expectedLedgerBalance: z.number().int(), evidenceRef: z.string().min(3) }),
  };
});

import { GET, POST } from "@/app/api/control/cash-opening/route";

const post = (body: unknown) => new Request("http://x/api/control/cash-opening", { method: "POST", body: JSON.stringify(body) });

describe("/api/control/cash-opening", () => {
  beforeEach(() => {
    mocks.session.mockReset();
    mocks.status.mockClear();
    mocks.certify.mockReset();
  });

  it("hanya Owner: selain Owner ditolak sebelum data dibaca/ditulis", async () => {
    mocks.session.mockResolvedValue({ data: null, response: new Response(null, { status: 403 }) });
    expect((await GET()).status).toBe(403);
    expect((await POST(post({ account: "petty" }))).status).toBe(403);
    expect(mocks.session).toHaveBeenCalledWith(["Owner"]);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.certify).not.toHaveBeenCalled();
  });

  it("validasi body & error layanan → { error }", async () => {
    mocks.session.mockResolvedValue({ data: { user: { id: "o" } }, response: null });
    expect((await POST(post({ account: "brankas", countedBalance: 1 }))).status).toBe(400);
    const { CashOpeningError } = await import("@/lib/cash-opening");
    mocks.certify.mockRejectedValue(new CashOpeningError("ALREADY_CERTIFIED", "Sudah disahkan."));
    const res = await POST(post({ account: "bank_jago", countedBalance: 5, expectedLedgerBalance: 0, evidenceRef: "Mutasi" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "ALREADY_CERTIFIED", message: "Sudah disahkan." } });
  });
});

describe("scripts/cash-ledger-fingerprint.sql", () => {
  it("query psql = query cashLedgerFingerprint (uji restore memakai angka yang sama)", async () => {
    const fs = await import("node:fs");
    const actual = await vi.importActual<typeof import("@/lib/cash-opening")>("@/lib/cash-opening");
    const file = fs.readFileSync("scripts/cash-ledger-fingerprint.sql", "utf8");
    expect(file).toContain(actual.FINGERPRINT_SUMMARY_SQL);
    expect(file).toContain(actual.FINGERPRINT_BALANCE_SQL);
  });
});
