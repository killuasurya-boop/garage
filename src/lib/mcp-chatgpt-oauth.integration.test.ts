import { createHash, randomBytes } from "node:crypto";

import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Gateway MCP ChatGPT (D-01) ujung-ke-ujung, seperti yang dilakukan ChatGPT:
// discovery → DCR → authorize (PKCE) → login → consent → token → MCP.
// Auth asli (Better Auth + mcp()) di atas PGlite; JWKS diarahkan ke auth.handler.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = "http://localhost:3001";
const RESOURCE = `${BASE}/api/mcp/chatgpt`;
const REDIRECT_URI = "https://chatgpt.com/connector_platform_oauth_redirect";
const PASSWORD = "Garage-Test-Owner-2026!";

let t: GarageTestDb;
let auth: typeof import("@/lib/auth").auth;
let mcpRoute: typeof import("@/app/api/mcp/chatgpt/route");
let discovery: typeof import("@/lib/mcp-chatgpt-discovery");
let outletId = "";

function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function call(path: string, init: RequestInit = {}) {
  return auth.handler(new Request(path.startsWith("http") ? path : `${BASE}${path}`, init));
}

async function signUpStaff(email: string, role: "Owner" | "Kasir") {
  const res = await call("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: role === "Owner" ? "Surya Owner" : "Kasir Test" }),
  });
  expect(res.status).toBe(200);
  const userId = ((await res.json()) as any).user.id as string;
  await t.getDb().insert(t.schema.staffProfiles).values({ userId, role, outletId, shiftLabel: "Pagi", deviceLabel: "Laptop" } as any);
  return userId;
}

async function setTwoFactor(userId: string, enabled: boolean) {
  await t.getDb().update(t.schema.user).set({ twoFactorEnabled: enabled } as any).where(eq(t.schema.user.id, userId));
}

async function discover() {
  // Discovery dari root domain (rute /.well-known kita → auth.handler).
  const prm = await discovery.serveMcpChatgptDiscovery(new Request(`${BASE}/.well-known/oauth-protected-resource/api/mcp/chatgpt`));
  expect(prm.status).toBe(200);
  const prmJson = (await prm.json()) as any;
  expect(prmJson.resource).toBe(RESOURCE);
  const issuer = prmJson.authorization_servers[0] as string;
  const asMeta = (await (await call(`${issuer}/.well-known/oauth-authorization-server`)).json()) as any;
  expect(asMeta.registration_endpoint).toBeTruthy();
  expect(asMeta.code_challenge_methods_supported).toContain("S256");
  return asMeta;
}

async function registerClient(asMeta: any) {
  // Dynamic Client Registration (tanpa sesi), seperti ChatGPT.
  const reg = await call(asMeta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "ChatGPT",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(reg.status).toBeLessThan(300);
  return ((await reg.json()) as any).client_id as string;
}

async function signIn(email: string, extra: Record<string, unknown> = {}) {
  return call("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, ...extra }),
  });
}

/** Authorize + PKCE; mengembalikan lokasi redirect (login atau consent). */
async function authorize(asMeta: any, clientId: string, cookie?: string) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(asMeta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access garage:owner",
    state: "st-123",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  })) url.searchParams.set(k, v);
  const res = await call(url.toString(), { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { location: new URL(res.headers.get("location") ?? "", BASE), verifier };
}

/** Consent Owner → tukar code → access token. */
async function consentAndToken(asMeta: any, clientId: string, cookie: string, consentLocation: URL, verifier: string) {
  expect(consentLocation.pathname).toBe("/oauth/consent");
  const { signedOAuthQuery } = await import("@/lib/oauth-login-continue");
  const consent = await call("/api/auth/oauth2/consent", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ accept: true, oauth_query: signedOAuthQuery(consentLocation.search) }),
  });
  expect(consent.status).toBe(200);
  const back = new URL(((await consent.json()) as any).url);
  expect(back.origin + back.pathname).toBe(REDIRECT_URI);
  expect(back.searchParams.get("state")).toBe("st-123");

  const token = await call(asMeta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: back.searchParams.get("code") ?? "",
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      resource: RESOURCE,
    }),
  });
  expect(token.status).toBe(200);
  const tokenJson = (await token.json()) as any;
  expect(tokenJson.refresh_token).toBeTruthy();
  return tokenJson.access_token as string;
}

/** Putaran OAuth dengan sesi yang sudah login (tanpa 2FA saat login). */
async function oauthRoundTrip(email: string) {
  const asMeta = await discover();
  const clientId = await registerClient(asMeta);
  const login = await signIn(email);
  expect(login.status).toBe(200);
  const cookie = cookieFrom(login);
  const { location, verifier } = await authorize(asMeta, clientId, cookie);
  return consentAndToken(asMeta, clientId, cookie, location, verifier);
}

async function mcp(accessToken: string | null, body: unknown) {
  return mcpRoute.POST(
    new Request(RESOURCE, {
      method: "POST",
      headers: { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: "user-mcp-seed" }));
  process.env.GARAGE_MCP_CHATGPT_ENABLED = "true";
  process.env.BETTER_AUTH_URL = BASE;
  process.env.GARAGE_INTERNAL_BASE_URL = BASE;
  vi.resetModules();
  ({ auth } = await import("@/lib/auth"));
  mcpRoute = await import("@/app/api/mcp/chatgpt/route");
  discovery = await import("@/lib/mcp-chatgpt-discovery");
  // requireMcpAuth mengambil JWKS lewat HTTP → arahkan ke auth.handler (tanpa server).
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(`${BASE}/api/auth/`)) return auth.handler(new Request(url, init));
    return realFetch(input, init);
  });
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.GARAGE_MCP_CHATGPT_ENABLED;
  delete process.env.GARAGE_INTERNAL_BASE_URL;
  await teardownGarageTestDb(t);
});

describe("MCP ChatGPT — OAuth ujung-ke-ujung", () => {
  let ownerToken = "";
  let ownerId = "";

  it("tanpa token → 401 + WWW-Authenticate untuk memulai OAuth", async () => {
    const res = await mcp(null, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate") ?? "").toContain("resource_metadata");
  });

  it("Owner (2FA aktif) menyelesaikan OAuth lalu bisa memanggil tool; garage_api tersembunyi", async () => {
    ownerId = await signUpStaff("owner-mcp@garage.id", "Owner");
    ownerToken = await oauthRoundTrip("owner-mcp@garage.id");
    // 2FA diaktifkan setelah login (login dengan 2FA butuh TOTP; di sini yang diuji gate gateway).
    await setTwoFactor(ownerId, true);

    const init = await mcp(ownerToken, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect(init.status).toBe(200);

    const list = (await (await mcp(ownerToken, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json()) as any;
    const names = list.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("daftar_menu");
    expect(names).not.toContain("garage_api");

    const hidden = (await (await mcp(ownerToken, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "garage_api", arguments: {} } })).json()) as any;
    expect(hidden.error?.code).toBe(-32602);

    // Registry (M1): label risiko di tools/list; peta kemampuan tidak menawarkan tool tersembunyi.
    const catat = list.result.tools.find((tool: any) => tool.name === "catat_pengeluaran");
    expect(catat._meta).toMatchObject({ "garage/risk": "R2", "garage/domain": "keuangan" });
    expect(catat.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(catat.description).toMatch(/^\[R2 /);
    const caps = (await (await mcp(ownerToken, { jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "kemampuan_sistem", arguments: {} } })).json()) as any;
    const capsJson = JSON.parse(caps.result.content[0].text);
    const capTools = capsJson.domains.flatMap((domain: any) => domain.tools.map((tool: any) => tool.name));
    expect(capTools).toContain("catat_pengeluaran");
    expect(capTools).not.toContain("garage_api");
    const init2 = (await (await mcp(ownerToken, { jsonrpc: "2.0", id: 32, method: "initialize", params: {} })).json()) as any;
    expect(init2.result.instructions).not.toContain("garage_api");
  });

  it("setiap tools/call tercatat di Audit dengan source=chatgpt sebelum dijalankan", async () => {
    const res = (await (await mcp(ownerToken, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "daftar_menu", arguments: {} } })).json()) as any;
    expect(res.result?.isError).toBe(false);
    const rows = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.device, "mcp:chatgpt"));
    const row = rows.find((r: any) => r.object === "daftar_menu");
    expect(row?.metadata).toMatchObject({ source: "chatgpt", tool: "daftar_menu", userId: ownerId });
    expect(row?.actor).toContain("ChatGPT");
  });

  it("Owner yang mematikan 2FA → token ditolak (403)", async () => {
    await setTwoFactor(ownerId, false);
    const res = await mcp(ownerToken, { jsonrpc: "2.0", id: 5, method: "tools/list" });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("TWO_FACTOR_REQUIRED");
    await setTwoFactor(ownerId, true);
  });

  it("kill switch mcpChatgptPaused → semua panggilan 503 tanpa restart", async () => {
    const { appSettings } = t.schema;
    await t.getDb().insert(appSettings).values({ key: "mcpChatgptPaused", valueJson: true, outletId: null } as any);
    const res = await mcp(ownerToken, { jsonrpc: "2.0", id: 6, method: "tools/list" });
    expect(res.status).toBe(503);
    await t.getDb().delete(appSettings).where(eq(appSettings.key, "mcpChatgptPaused"));
    expect((await mcp(ownerToken, { jsonrpc: "2.0", id: 7, method: "tools/list" })).status).toBe(200);
  });

  describe("M2 — R2/R3: preview → konfirmasi → eksekusi → receipt", () => {
    const args = { kategori: "Operasional", deskripsi: "Gas LPG via ChatGPT", nominal: 87_000, metodeBayar: "Cash" };
    const call = async (id: number, name: string, a: unknown) =>
      (await (await mcp(ownerToken, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: a } })).json()) as any;
    const parse = (res: any) => JSON.parse(res.result.content[0].text);
    async function expenseCount() {
      const rows = await t.getDb().select().from(t.schema.expenses).where(eq(t.schema.expenses.description, args.deskripsi));
      return rows.length;
    }

    it("tools/list: tool R2 menerima `konfirmasi`, tool R0 tidak", async () => {
      const list = (await (await mcp(ownerToken, { jsonrpc: "2.0", id: 40, method: "tools/list" })).json()) as any;
      const byName = Object.fromEntries(list.result.tools.map((tool: any) => [tool.name, tool]));
      expect(byName.catat_pengeluaran.inputSchema.properties.konfirmasi).toBeTruthy();
      expect(byName.ringkasan_hari_ini.inputSchema.properties?.konfirmasi).toBeUndefined();
      expect(byName.status_operasi).toBeTruthy();
    });

    it("panggilan pertama hanya preview — tidak ada pengeluaran tercatat", async () => {
      const before = await expenseCount();
      const preview = parse(await call(41, "catat_pengeluaran", args));
      expect(preview).toMatchObject({ status: "PERLU_KONFIRMASI", dijalankan: false, risiko: "R2" });
      expect(preview.ringkasan.nominal).toBe("Rp87.000");
      expect(preview.ringkasan.sumberDana).toMatch(/TIDAK memotong laci/);
      expect(preview.konfirmasi).toMatch(/^[0-9a-f-]{36}\./);
      expect(await expenseCount()).toBe(before);
      const status = parse(await call(42, "status_operasi", { operasiId: preview.operasiId }));
      expect(status.status).toBe("PENDING");
    });

    it("konfirmasi → tepat satu eksekusi + receipt; token tidak bisa dipakai ulang; tidak masuk audit", async () => {
      const before = await expenseCount();
      const preview = parse(await call(43, "catat_pengeluaran", args));
      const done = parse(await call(44, "catat_pengeluaran", { ...args, konfirmasi: preview.konfirmasi }));
      expect(done.status).toBe("BERHASIL");
      expect(done.receipt.operasiId).toBe(preview.operasiId);
      expect(await expenseCount()).toBe(before + 1);
      expect(parse(await call(45, "status_operasi", { operasiId: preview.operasiId })).status).toBe("EXECUTED");

      const again = await call(46, "catat_pengeluaran", { ...args, konfirmasi: preview.konfirmasi });
      expect(again.result.isError).toBe(true);
      expect(again.result.content[0].text).toContain("CONFIRMATION_USED");
      expect(await expenseCount()).toBe(before + 1);

      const audit = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.device, "mcp:chatgpt"));
      expect(JSON.stringify(audit)).not.toContain(preview.konfirmasi.split(".")[1]);
    });

    it("dua konfirmasi bersamaan dengan token sama → hanya satu yang jalan", async () => {
      const before = await expenseCount();
      const preview = parse(await call(47, "catat_pengeluaran", args));
      const [a, b] = await Promise.all([
        call(48, "catat_pengeluaran", { ...args, konfirmasi: preview.konfirmasi }),
        call(49, "catat_pengeluaran", { ...args, konfirmasi: preview.konfirmasi }),
      ]);
      expect([a.result.isError, b.result.isError].sort()).toEqual([false, true]);
      expect(await expenseCount()).toBe(before + 1);
    });

    it("argumen diubah setelah konfirmasi → ditolak; token kedaluwarsa → ditolak", async () => {
      const before = await expenseCount();
      const preview = parse(await call(50, "catat_pengeluaran", args));
      const changed = await call(51, "catat_pengeluaran", { ...args, nominal: 870_000, konfirmasi: preview.konfirmasi });
      expect(changed.result.content[0].text).toContain("CONFIRMATION_ARGS_CHANGED");

      const { mcpOperations } = t.schema as any;
      await t.getDb().update(mcpOperations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mcpOperations.id, preview.operasiId));
      const expired = await call(52, "catat_pengeluaran", { ...args, konfirmasi: preview.konfirmasi });
      expect(expired.result.content[0].text).toContain("CONFIRMATION_EXPIRED");
      expect(await expenseCount()).toBe(before);
    });

    it("tool R0 tetap langsung jalan tanpa konfirmasi", async () => {
      const res = await call(53, "daftar_menu", {});
      expect(res.result.isError).toBe(false);
      expect(parse(res).status).not.toBe("PERLU_KONFIRMASI");
    });
  });

  it("akun Kasir yang berhasil OAuth tetap ditolak (OWNER_ONLY)", async () => {
    const kasirId = await signUpStaff("kasir-mcp@garage.id", "Kasir");
    const kasirToken = await oauthRoundTrip("kasir-mcp@garage.id");
    // 2FA aktif pun tidak membuat Kasir lolos — yang ditolak adalah role-nya.
    await setTwoFactor(kasirId, true);
    const res = await mcp(kasirToken, { jsonrpc: "2.0", id: 8, method: "tools/list" });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("OWNER_ONLY");
  });

  it("alur nyata: belum login → /login → sign-in → 2FA TOTP → consent → token → MCP", async () => {
    const userId = await signUpStaff("owner2-mcp@garage.id", "Owner");
    // Pasang 2FA sungguhan (TOTP) seperti di /control/2fa.
    const first = await signIn("owner2-mcp@garage.id");
    const setupCookie = cookieFrom(first);
    const enable = await call("/api/auth/two-factor/enable", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: setupCookie },
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(enable.status).toBe(200);
    const secret = new URL(((await enable.json()) as any).totpURI).searchParams.get("secret") ?? "";
    const otp = createOTP(base32.decode(secret));
    const confirm = await call("/api/auth/two-factor/verify-totp", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: setupCookie },
      body: JSON.stringify({ code: await otp.totp() }),
    });
    expect(confirm.status).toBe(200);
    const [row] = await t.getDb().select().from(t.schema.user).where(eq(t.schema.user.id, userId));
    expect((row as any).twoFactorEnabled).toBe(true);

    // ChatGPT memulai OAuth tanpa sesi → plugin mengarahkan ke /login kita.
    const asMeta = await discover();
    const clientId = await registerClient(asMeta);
    const { location: loginLocation, verifier } = await authorize(asMeta, clientId);
    expect(loginLocation.pathname).toBe("/login");

    // Halaman login mengirim oauth_query → server minta 2FA (belum ada sesi).
    const { signedOAuthQuery, oauthContinueUrl } = await import("@/lib/oauth-login-continue");
    const oauthQuery = signedOAuthQuery(loginLocation.search);
    expect(oauthQuery).toBeTruthy();
    const login = await signIn("owner2-mcp@garage.id", { oauth_query: oauthQuery });
    expect(login.status).toBe(200);
    expect(((await login.json()) as any).twoFactorRedirect).toBe(true);
    const twoFactorCookie = cookieFrom(login);

    // /login/2fa: verify-totp + oauth_query → sesi dibuat & alur lanjut ke consent.
    const verify = await call("/api/auth/two-factor/verify-totp", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: twoFactorCookie },
      body: JSON.stringify({ code: await otp.totp(), oauth_query: oauthQuery }),
    });
    expect(verify.status).toBe(200);
    const continueUrl = oauthContinueUrl(await verify.json());
    expect(continueUrl).toBeTruthy();
    const sessionCookie = cookieFrom(verify);

    const accessToken = await consentAndToken(asMeta, clientId, sessionCookie, new URL(continueUrl ?? "", BASE), verifier);
    const list = await mcp(accessToken, { jsonrpc: "2.0", id: 10, method: "tools/list" });
    expect(list.status).toBe(200);
  });

  it("token palsu → 401", async () => {
    const res = await mcp(`${ownerToken.slice(0, -4)}AAAA`, { jsonrpc: "2.0", id: 9, method: "tools/list" });
    expect(res.status).toBe(401);
  });
});
