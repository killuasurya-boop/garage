import { afterEach, describe, expect, it, vi } from "vitest";

import { mcpChatgptAccess } from "@/lib/mcp-chatgpt-access";
import { resolveMcpChatgptConfig } from "@/lib/mcp-chatgpt-config";
import { oauthContinueUrl, signedOAuthQuery } from "@/lib/oauth-login-continue";

describe("resolveMcpChatgptConfig", () => {
  it("mati secara default (merge tidak mengubah produksi)", () => {
    expect(resolveMcpChatgptConfig({ BETTER_AUTH_URL: "https://garagecoffee.id" }).enabled).toBe(false);
  });

  it("aktif dengan HTTPS → resource /api/mcp/chatgpt", () => {
    expect(
      resolveMcpChatgptConfig({ GARAGE_MCP_CHATGPT_ENABLED: "true", BETTER_AUTH_URL: "https://garagecoffee.id/" }),
    ).toEqual({ enabled: true, baseURL: "https://garagecoffee.id", resource: "https://garagecoffee.id/api/mcp/chatgpt" });
  });

  it("http hanya untuk localhost; IP LAN / http publik tetap mati (login tidak ikut gagal)", () => {
    expect(resolveMcpChatgptConfig({ GARAGE_MCP_CHATGPT_ENABLED: "true", BETTER_AUTH_URL: "http://localhost:3001" }).enabled).toBe(true);
    expect(resolveMcpChatgptConfig({ GARAGE_MCP_CHATGPT_ENABLED: "true", BETTER_AUTH_URL: "http://192.168.1.10:3001" }).enabled).toBe(false);
    expect(resolveMcpChatgptConfig({ GARAGE_MCP_CHATGPT_ENABLED: "true", BETTER_AUTH_URL: "http://garagecoffee.id" }).enabled).toBe(false);
    expect(resolveMcpChatgptConfig({ GARAGE_MCP_CHATGPT_ENABLED: "true", BETTER_AUTH_URL: "bukan url" }).enabled).toBe(false);
    expect(resolveMcpChatgptConfig({ GARAGE_MCP_CHATGPT_ENABLED: "true" }).enabled).toBe(false);
  });
});

describe("mcpChatgptAccess", () => {
  const owner = { role: "Owner", status: "active", twoFactorEnabled: true };

  it("hanya Owner aktif dengan 2FA", () => {
    expect(mcpChatgptAccess(owner)).toEqual({ allowed: true });
    expect(mcpChatgptAccess({ ...owner, role: "Manajer" })).toMatchObject({ allowed: false, code: "OWNER_ONLY" });
    expect(mcpChatgptAccess({ ...owner, twoFactorEnabled: false })).toMatchObject({ allowed: false, code: "TWO_FACTOR_REQUIRED" });
    expect(mcpChatgptAccess({ ...owner, status: "suspended" })).toMatchObject({ allowed: false, code: "ACCOUNT_INACTIVE" });
    expect(mcpChatgptAccess({ ...owner, role: null })).toMatchObject({ allowed: false, code: "STAFF_PROFILE_MISSING" });
  });
});

describe("oauth-login-continue", () => {
  it("tanpa sig → undefined (login biasa tidak berubah)", () => {
    expect(signedOAuthQuery("?next=/os")).toBeUndefined();
    expect(signedOAuthQuery("")).toBeUndefined();
  });

  it("hanya meneruskan parameter yang ditandatangani", () => {
    const query = signedOAuthQuery("?client_id=c1&scope=openid&ba_param=client_id&ba_param=scope&sig=abc&next=/os");
    const params = new URLSearchParams(query);
    expect(params.get("client_id")).toBe("c1");
    expect(params.get("sig")).toBe("abc");
    expect(params.has("next")).toBe(false);
  });

  it("URL lanjutan hanya dari { redirect: true, url }", () => {
    expect(oauthContinueUrl({ redirect: true, url: "/oauth/consent?x=1" })).toBe("/oauth/consent?x=1");
    expect(oauthContinueUrl({ twoFactorRedirect: true })).toBeNull();
    expect(oauthContinueUrl(null)).toBeNull();
  });
});

describe("fitur mati → tidak ada endpoint", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("route MCP & discovery 404, endpoint OAuth Better Auth tidak terpasang", async () => {
    delete process.env.GARAGE_MCP_CHATGPT_ENABLED;
    vi.resetModules();
    const route = await import("@/app/api/mcp/chatgpt/route");
    const discovery = await import("@/lib/mcp-chatgpt-discovery");
    const { auth } = await import("@/lib/auth");
    expect((await route.POST(new Request("http://localhost:3001/api/mcp/chatgpt", { method: "POST" }))).status).toBe(404);
    expect((await discovery.serveMcpChatgptDiscovery(new Request("http://localhost:3001/.well-known/oauth-protected-resource"))).status).toBe(404);
    const register = await auth.handler(
      new Request("http://localhost:3001/api/auth/oauth2/register", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
    );
    expect(register.status).toBe(404);
  });
});
