import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";
import { API_PATH_HEADER, needsTwoFactorPolicyCheck } from "@/lib/two-factor-api-gate";

describe("needsTwoFactorPolicyCheck", () => {
  const base = { apiPath: "/api/finance/overview", role: "Owner" as const, twoFactorEnabled: false };

  it("cek policy untuk Owner/Manajer tanpa 2FA di API", () => {
    expect(needsTwoFactorPolicyCheck(base)).toBe(true);
    expect(needsTwoFactorPolicyCheck({ ...base, role: "Manajer" })).toBe(true);
  });

  it("tidak cek bila 2FA sudah aktif", () => {
    expect(needsTwoFactorPolicyCheck({ ...base, twoFactorEnabled: true })).toBe(false);
  });

  it("tidak berlaku untuk role lain", () => {
    expect(needsTwoFactorPolicyCheck({ ...base, role: "Kasir" })).toBe(false);
  });

  it("halaman (tanpa header path) tetap memakai redirect page-access", () => {
    expect(needsTwoFactorPolicyCheck({ ...base, apiPath: null })).toBe(false);
  });

  it("identitas & ganti password tetap terbuka", () => {
    for (const apiPath of ["/api/me", "/api/me/active-outlet", "/api/account/password", "/api/account/pin"]) {
      expect(needsTwoFactorPolicyCheck({ ...base, apiPath })).toBe(false);
    }
  });

  it("prefix mirip tidak ikut dikecualikan", () => {
    expect(needsTwoFactorPolicyCheck({ ...base, apiPath: "/api/members" })).toBe(true);
    expect(needsTwoFactorPolicyCheck({ ...base, apiPath: "/api/accounts-export" })).toBe(true);
  });
});

function forwardedHeaders(request: NextRequest) {
  const response = proxy(request);
  // NextResponse.next({ request: { headers } }) meneruskan header lewat x-middleware-override-headers.
  const overridden = (response.headers.get("x-middleware-override-headers") ?? "").split(",");
  const read = (name: string) =>
    overridden.includes(name) ? response.headers.get(`x-middleware-request-${name}`) : null;
  return read;
}

describe("proxy", () => {
  it("mengisi path API dari URL, menimpa nilai palsu klien", () => {
    const read = forwardedHeaders(
      new NextRequest("http://localhost/api/finance/overview", { headers: { [API_PATH_HEADER]: "/api/me" } }),
    );
    expect(read(API_PATH_HEADER)).toBe("/api/finance/overview");
  });

  it("membuang header agent palsu dari request tanpa API key", () => {
    const read = forwardedHeaders(
      new NextRequest("http://localhost/api/orders", { headers: { "x-garage-agent-path": "/api/orders" } }),
    );
    expect(read("x-garage-agent-path")).toBeNull();
    expect(read(API_PATH_HEADER)).toBe("/api/orders");
  });

  it("request agent tetap mendapat method & path", () => {
    const read = forwardedHeaders(
      new NextRequest("http://localhost/api/orders", { method: "POST", headers: { authorization: "Bearer gk_agent_x" } }),
    );
    expect(read("x-garage-agent-method")).toBe("POST");
    expect(read("x-garage-agent-path")).toBe("/api/orders");
    expect(read(API_PATH_HEADER)).toBe("/api/orders");
  });
});
