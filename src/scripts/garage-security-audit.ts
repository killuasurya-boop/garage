import { config as loadEnv } from "dotenv";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
type FindingSeverity = "critical" | "high" | "medium" | "low" | "info" | "pass";

type AuditResponse<T = JsonValue> = {
  response: Response;
  json: T | null;
  text: string;
};

type AuditResult = {
  severity: FindingSeverity;
  check: string;
  detail: string;
  evidence?: string;
  remediation?: string;
};

type RouteSummary = {
  route: string;
  methods: string[];
  auth: "public" | "staff" | "member" | "pos-key" | "job-secret";
  rateLimited: boolean;
  mutating: boolean;
};

type MenuItem = {
  id: string;
  name: string;
  variants: Array<{
    id: string;
    label: string;
    price: number;
  }>;
};

type CustomerOrderCreateData = {
  order: {
    id: string;
    orderNo: string;
    tableLabel: string;
    status: string;
    customerName?: string | null;
    customerPhone?: string | null;
  };
};

const rootDir = process.cwd();
const baseUrl = (process.env.SECURITY_AUDIT_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const lanBaseUrl = (
  process.env.SECURITY_AUDIT_LAN_URL ??
  process.env.GARAGE_PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ??
  "http://192.168.110.142:3001"
).replace(/\/+$/, "");
const staffPassword =
  process.env.SECURITY_AUDIT_STAFF_PASSWORD ??
  process.env.SMOKE_STAFF_PASSWORD ??
  process.env.GARAGE_SEED_PASSWORD ??
  "garage12345";
const memberIdentifier =
  process.env.SECURITY_AUDIT_MEMBER_IDENTIFIER ??
  process.env.SMOKE_MEMBER_IDENTIFIER ??
  "081300001001";
const memberPassword =
  process.env.SECURITY_AUDIT_MEMBER_PASSWORD ??
  process.env.SMOKE_MEMBER_PASSWORD ??
  process.env.GARAGE_MEMBER_SEED_PASSWORD ??
  "member12345";
const posApiKey =
  process.env.SECURITY_AUDIT_POS_API_KEY ??
  process.env.GARAGE_POS_API_KEY ??
  "garage-pos-dev-key";
const marker = `QA_SEC_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const cleanupOrders = process.env.SECURITY_AUDIT_CLEANUP !== "0";
const strictExit = process.env.SECURITY_AUDIT_STRICT === "1";
const requestTimeoutMs = Number(process.env.SECURITY_AUDIT_REQUEST_TIMEOUT_MS ?? 15_000);

const roleEmails = {
  owner: process.env.SECURITY_AUDIT_OWNER_EMAIL ?? "owner@garage.local",
  cashier: process.env.SECURITY_AUDIT_CASHIER_EMAIL ?? "kasir@garage.local",
  waiter: process.env.SECURITY_AUDIT_WAITER_EMAIL ?? "waiter1@garage.local",
  kitchen: process.env.SECURITY_AUDIT_KITCHEN_EMAIL ?? "koki@garage.local",
  finance: process.env.SECURITY_AUDIT_FINANCE_EMAIL ?? "finance@garage.local",
};

const severityRank: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
  pass: 0,
};

class CookieJar {
  private readonly cookies = new Map<string, string>();

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  store(headers: Headers) {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const rawCookies =
      typeof getSetCookie === "function"
        ? getSetCookie.call(headers)
        : splitSetCookieHeader(headers.get("set-cookie"));

    for (const cookie of rawCookies) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired =
        /max-age=0/i.test(cookie) || /expires=thu,\s*01 jan 1970/i.test(cookie);

      if (expired) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  names() {
    return Array.from(this.cookies.keys());
  }
}

function splitSetCookieHeader(value: string | null) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,\s]+=)/).map((cookie) => cookie.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dataOf<T>(json: unknown): T {
  return asRecord(json).data as T;
}

function messageOf(json: unknown, fallback: string) {
  const record = asRecord(json);
  const error = asRecord(record.error);
  return String(error.message ?? record.message ?? fallback).slice(0, 500);
}

function result(
  severity: FindingSeverity,
  check: string,
  detail: string,
  evidence?: string,
  remediation?: string,
): AuditResult {
  return { severity, check, detail, evidence, remediation };
}

async function request<T = JsonValue>(
  pathOrUrl: string,
  options: RequestInit & { json?: JsonValue } = {},
  jar?: CookieJar,
): Promise<AuditResponse<T>> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const headers = new Headers(options.headers);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  if (!headers.has("Origin")) headers.set("Origin", baseUrl);
  if (!headers.has("Referer")) headers.set("Referer", `${baseUrl}/security-audit`);
  if (options.json !== undefined) headers.set("Content-Type", "application/json");

  const cookieHeader = jar?.header();
  if (cookieHeader) headers.set("Cookie", cookieHeader);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      signal: controller.signal,
    });
    jar?.store(response.headers);

    const text = await response.text();
    let json: T | null = null;
    if (text) {
      try {
        json = JSON.parse(text) as T;
      } catch {
        json = null;
      }
    }

    return { response, json, text };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    const detail = isAbort
      ? `Request timeout after ${requestTimeoutMs}ms: ${url}`
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : "fetch failed";

    return {
      response: new Response(null, { status: isAbort ? 504 : 503 }),
      json: null,
      text: detail,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function expectStatus(
  results: AuditResult[],
  label: string,
  response: AuditResponse,
  expected: number | number[],
  severity: FindingSeverity,
  remediation: string,
) {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  if (expectedList.includes(response.response.status)) {
    results.push(result("pass", label, `HTTP ${response.response.status} sesuai ekspektasi.`));
    return true;
  }

  results.push(
    result(
      severity,
      label,
      `Expected HTTP ${expectedList.join("/")} tetapi mendapat ${response.response.status}.`,
      messageOf(response.json, response.text),
      remediation,
    ),
  );
  return false;
}

function sensitiveKeyHits(
  value: unknown,
  deniedKeys: Set<string>,
  prefix = "$",
  hits: string[] = [],
) {
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, index) =>
      sensitiveKeyHits(item, deniedKeys, `${prefix}[${index}]`, hits),
    );
    return hits;
  }

  if (!value || typeof value !== "object") {
    return hits;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    const pathLabel = `${prefix}.${key}`;
    if (deniedKeys.has(normalized)) {
      hits.push(pathLabel);
    }
    sensitiveKeyHits(child, deniedKeys, pathLabel, hits);
  }

  return hits;
}

function assertNoSensitiveKeys(
  results: AuditResult[],
  label: string,
  payload: unknown,
  deniedKeys: string[],
  severity: FindingSeverity,
  remediation: string,
) {
  const hits = sensitiveKeyHits(payload, new Set(deniedKeys.map((key) => key.toLowerCase())));
  if (!hits.length) {
    results.push(result("pass", label, "Tidak ada field sensitif di response publik."));
    return;
  }

  results.push(
    result(
      severity,
      label,
      `Response mengandung field sensitif: ${hits.slice(0, 12).join(", ")}.`,
      JSON.stringify(payload).slice(0, 800),
      remediation,
    ),
  );
}

function walkRouteFiles(dir: string, files: string[] = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      walkRouteFiles(fullPath, files);
    } else if (entry === "route.ts") {
      files.push(fullPath);
    }
  }
  return files;
}

function routePathFromFile(filePath: string) {
  const relative = path.relative(path.join(rootDir, "src", "app", "api"), path.dirname(filePath));
  const segments = relative
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => segment.replace(/^\[(.+)\]$/, ":$1"));
  return `/api/${segments.join("/")}`;
}

function inferAuth(text: string): RouteSummary["auth"] {
  if (text.includes("requireGarageSession")) return "staff";
  if (text.includes("requirePermission")) return "staff";
  if (text.includes("requireAnyPermission")) return "staff";
  if (text.includes("requireMemberAuth")) return "member";
  if (text.includes("requirePosTerminal")) return "pos-key";
  if (text.includes("requireGarageAiJobAuthorization")) return "job-secret";
  return "public";
}

function collectRoutes(): RouteSummary[] {
  return walkRouteFiles(path.join(rootDir, "src", "app", "api"))
    .map((filePath) => {
      const text = readFileSync(filePath, "utf8");
      const methods = Array.from(
        new Set(
          Array.from(text.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g))
            .map((match) => match[1])
            .filter(Boolean),
        ),
      ).sort();
      return {
        route: routePathFromFile(filePath),
        methods,
        auth: inferAuth(text),
        rateLimited: text.includes("rateLimit("),
        mutating: methods.some((method) => ["POST", "PUT", "PATCH", "DELETE"].includes(method)),
      };
    })
    .sort((left, right) => left.route.localeCompare(right.route));
}

function routeRecon(results: AuditResult[]) {
  const routes = collectRoutes();
  const publicRoutes = routes.filter((route) => route.auth === "public");
  const staffRoutes = routes.filter((route) => route.auth === "staff");
  const publicMutations = publicRoutes.filter((route) => route.mutating);

  results.push(
    result(
      "info",
      "Recon route matrix",
      `${routes.length} API route terdeteksi: public=${publicRoutes.length}, staff=${staffRoutes.length}, member=${routes.filter((route) => route.auth === "member").length}, pos-key=${routes.filter((route) => route.auth === "pos-key").length}, job-secret=${routes.filter((route) => route.auth === "job-secret").length}.`,
      routes
        .map(
          (route) =>
            `${route.methods.join(",") || "ANY"} ${route.route} auth=${route.auth} rate=${route.rateLimited ? "yes" : "no"}`,
        )
        .join("\n"),
    ),
  );

  // Allowlist public mutating routes yang memang aman by design:
  // - /api/auth, /api/member/auth: Better Auth handler (CSRF-protected)
  // - /api/customer/orders: guest checkout, validated dgn nama+WA
  // - /api/vouchers/validate: rate-limited read-mostly
  // - /api/dev/demo-login: gated NODE_ENV !== production
  // - /api/errors: client error reporting, rate-limited
  // - /api/hr/attendance + /check: kiosk PIN-based auth, rate-limited
  const PUBLIC_MUTATION_ALLOWLIST = new Set([
    "/api/customer/orders",
    "/api/vouchers/validate",
    "/api/dev/demo-login",
    "/api/errors",
    "/api/hr/attendance",
    "/api/hr/attendance/check",
  ]);
  const unauthenticatedMutations = publicMutations
    .filter(
      (route) =>
        !route.route.startsWith("/api/auth") &&
        !route.route.startsWith("/api/member/auth") &&
        !PUBLIC_MUTATION_ALLOWLIST.has(route.route),
    )
    .map((route) => route.route);

  if (unauthenticatedMutations.length) {
    results.push(
      result(
        "high",
        "Public mutating routes review",
        `Ada route mutasi publik di luar allowlist: ${unauthenticatedMutations.join(", ")}.`,
        undefined,
        "Tambahkan auth/role check atau masukkan ke allowlist eksplisit bila memang public-safe.",
      ),
    );
  } else {
    results.push(result("pass", "Public mutating routes review", "Tidak ada route mutasi publik di luar allowlist."));
  }
}

function staticSecurityReview(results: AuditResult[]) {
  const rateLimitText = readFileSync(path.join(rootDir, "src", "lib", "rate-limit.ts"), "utf8");
  if (rateLimitText.includes('headers.get("x-forwarded-for")')) {
    results.push(
      result(
        "medium",
        "Rate limit trusts X-Forwarded-For",
        "Limiter memakai X-Forwarded-For langsung dari request. Di VPS, header ini bisa dipalsukan bila reverse proxy tidak overwrite header.",
        "src/lib/rate-limit.ts",
        "Di production, gunakan IP dari trusted proxy layer saja, overwrite X-Forwarded-For di Nginx/Caddy, atau pakai store rate-limit yang membaca trusted client IP.",
      ),
    );
  }

  const memberAuthRoutes = [
    "src/app/api/member/auth/login/route.ts",
    "src/app/api/member/auth/register/route.ts",
    "src/app/api/member/auth/refresh/route.ts",
  ];
  const missingMemberRateLimit = memberAuthRoutes.filter(
    (file) => !readFileSync(path.join(rootDir, file), "utf8").includes("rateLimit("),
  );
  if (missingMemberRateLimit.length) {
    results.push(
      result(
        "medium",
        "Member auth endpoints lack explicit rate limit",
        "Login/register/refresh member tidak punya rateLimit eksplisit di route.",
        missingMemberRateLimit.join(", "),
        "Tambahkan limiter per IP dan identifier untuk login/register, serta throttle refresh token failure.",
      ),
    );
  }

  const authText = readFileSync(path.join(rootDir, "src", "lib", "auth.ts"), "utf8");
  const memberAuthText = readFileSync(path.join(rootDir, "src", "lib", "member-auth.ts"), "utf8");
  if (authText.includes("garage-development-secret") || memberAuthText.includes("garage-member-development-secret")) {
    results.push(
      result(
        process.env.BETTER_AUTH_SECRET ? "low" : "critical",
        "Development secret fallback",
        process.env.BETTER_AUTH_SECRET
          ? "BETTER_AUTH_SECRET aktif, tetapi source masih punya fallback secret dev."
          : "BETTER_AUTH_SECRET tidak aktif; session/JWT berpotensi memakai secret dev yang predictable.",
        "src/lib/auth.ts, src/lib/member-auth.ts",
        "Fail-fast saat NODE_ENV=production jika BETTER_AUTH_SECRET/MEMBER_AUTH_SECRET tidak tersedia; hapus fallback untuk production.",
      ),
    );
  }

  const providersText = readFileSync(path.join(rootDir, "src", "lib", "garage-ai-providers.ts"), "utf8");
  if (
    providersText.includes("baseUrl: z.string().url()") &&
    providersText.includes('provider: "custom"') &&
    !providersText.includes("assertSafeAiProviderBaseUrl")
  ) {
    results.push(
      result(
        "low",
        "Owner-controlled AI provider baseUrl",
        "Provider AI custom menerima URL arbitrer lalu server melakukan fetch ke baseUrl tersebut. Dampak dibatasi Owner-only, tetapi tetap perlu guardrail VPS.",
        "src/lib/garage-ai-providers.ts",
        "Tambahkan konfirmasi/allowlist untuk private IP, localhost, link-local, dan metadata ranges kecuali mode local Ollama yang eksplisit.",
      ),
    );
  }
}

async function loginStaff(email: string) {
  const jar = new CookieJar();
  const login = await request(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      json: {
        email,
        password: staffPassword,
        callbackURL: "/pos",
      },
    },
    jar,
  );

  if (!login.response.ok) {
    throw new Error(`Staff login ${email} gagal: ${login.response.status} ${messageOf(login.json, login.text)}`);
  }

  return jar;
}

async function ensureCashierShiftOpen(results: AuditResult[], cashierJar: CookieJar) {
  const active = await request<{ data?: { session?: { id?: string; status?: string } | null } }>(
    "/api/finance/cash-sessions/me/active",
    {},
    cashierJar,
  );
  const activeSession = dataOf<{ session?: { id?: string; status?: string } | null }>(
    active.json,
  )?.session;
  if (active.response.ok && activeSession?.status === "open") {
    results.push(result("pass", "Cashier shift guard setup", "Kasir audit sudah punya shift open."));
    return;
  }

  const opened = await request(
    "/api/finance/cash-sessions",
    {
      method: "POST",
      json: {
        openingCash: 100000,
      },
    },
    cashierJar,
  );
  expectStatus(
    results,
    "Cashier shift guard setup",
    opened,
    201,
    "high",
    "Security audit perlu open shift kasir sebelum menguji QR/POS flow.",
  );
}

async function loginMember(results: AuditResult[]) {
  const jar = new CookieJar();
  const login = await request(
    "/api/member/auth/login",
    {
      method: "POST",
      json: {
        identifier: memberIdentifier,
        password: memberPassword,
      },
    },
    jar,
  );

  if (!expectStatus(results, "Member login test", login, 200, "high", "Pastikan seed member tersedia atau set SECURITY_AUDIT_MEMBER_* env.")) {
    return null;
  }

  const setCookie = login.response.headers.get("set-cookie") ?? "";
  const cookieFlagsOk =
    setCookie.includes("HttpOnly") &&
    setCookie.includes("SameSite=Lax") &&
    jar.names().includes("garage_member_access") &&
    jar.names().includes("garage_member_refresh");

  if (cookieFlagsOk) {
    results.push(result("pass", "Member cookie flags", "Member cookies memakai HttpOnly dan SameSite=Lax."));
  } else {
    results.push(
      result(
        "high",
        "Member cookie flags",
        "Cookie member tidak lengkap atau tidak memakai HttpOnly/SameSite=Lax.",
        setCookie,
        "Pastikan access dan refresh cookie selalu HttpOnly + SameSite, dan Secure saat HTTPS.",
      ),
    );
  }

  return jar;
}

async function getSellableMenuItem(results: AuditResult[]) {
  const menu = await request<MenuItem[]>("/api/customer/menu");
  if (!expectStatus(results, "Public menu endpoint", menu, 200, "high", "Pulihkan /api/customer/menu karena checkout QR bergantung pada endpoint ini.")) {
    return null;
  }

  const rows = dataOf<MenuItem[]>(menu.json);
  const selected = Array.isArray(rows)
    ? rows.find((item) => item.variants?.length)
    : null;
  if (!selected) {
    results.push(
      result(
        "high",
        "Public menu sellable item",
        "Menu publik tidak mengembalikan item dengan variant.",
        JSON.stringify(rows).slice(0, 500),
        "Pastikan seed/menu aktif dan hanya item valid yang tampil untuk customer.",
      ),
    );
    return null;
  }

  results.push(result("pass", "Public menu sellable item", `${rows.length} item publik terbaca; memakai ${selected.id}.`));
  return { item: selected, variant: selected.variants[0] };
}

async function createQaOrder(
  results: AuditResult[],
  selected: { item: MenuItem; variant: MenuItem["variants"][number] },
  tableLabel: string,
) {
  const order = await request<CustomerOrderCreateData>("/api/customer/orders", {
    method: "POST",
    json: {
      orderType: "dine-in",
      tableLabel,
      customerMode: "guest",
      guestName: `${marker} Guest`,
      guestPhone: `08137${Date.now().toString().slice(-7)}`,
      customerNote: `${marker} safe-active audit ../qa https://example.invalid/qa 127.0.0.1.invalid`,
      source: "qr_table",
      campaign: "security_audit",
      items: [{ itemId: selected.item.id, variantId: selected.variant.id, qty: 1 }],
    },
  });

  if (!expectStatus(results, `Create QA order ${tableLabel}`, order, 201, "high", "Customer checkout harus bisa membuat order test valid.")) {
    return null;
  }

  const created = dataOf<CustomerOrderCreateData>(order.json);
  if (!created?.order?.id || created.order.status !== "pending_cashier") {
    results.push(
      result(
        "high",
        `Create QA order ${tableLabel} response`,
        "Response order customer tidak memiliki id/status pending_cashier.",
        JSON.stringify(created).slice(0, 700),
        "Stabilkan kontrak /api/customer/orders untuk flow QR.",
      ),
    );
    return null;
  }

  return created.order;
}

async function rejectOrder(jar: CookieJar, orderId: string, reason: string) {
  return request(
    `/api/customer/orders/${orderId}/status`,
    {
      method: "PATCH",
      json: {
        action: "reject",
        reason,
      },
    },
    jar,
  );
}

async function runAuthBoundaryTests(results: AuditResult[], jars: Record<string, CookieJar>) {
  const anonymousStaffEndpoints = [
    "/api/customer/orders?status=pending_cashier",
    "/api/tables/live",
    "/api/print-jobs?status=pending",
    "/api/ai/providers",
  ];

  for (const endpoint of anonymousStaffEndpoints) {
    const response = await request(endpoint);
    expectStatus(
      results,
      `Anonymous blocked ${endpoint}`,
      response,
      401,
      "critical",
      "Pastikan semua endpoint staff memakai requireGarageSession.",
    );
  }

  const ownerProviders = await request("/api/ai/providers", {}, jars.owner);
  expectStatus(results, "Owner can access AI providers", ownerProviders, 200, "medium", "Owner perlu akses provider manager.");

  const cashierProviders = await request("/api/ai/providers", {}, jars.cashier);
  expectStatus(
    results,
    "Cashier blocked from AI providers",
    cashierProviders,
    403,
    "critical",
    "Batasi route /api/ai/providers ke Owner / CEO.",
  );

  const cashierOwnerHistory = await request("/api/ai/owner-chat/history", {}, jars.cashier);
  expectStatus(
    results,
    "Cashier blocked from owner chat history",
    cashierOwnerHistory,
    403,
    "critical",
    "Owner chat history harus tetap Owner-only.",
  );

  const waiterPrintJobs = await request("/api/print-jobs?status=pending", {}, jars.waiter);
  expectStatus(
    results,
    "Waiter blocked from print queue",
    waiterPrintJobs,
    403,
    "high",
    "Print payload dapat mengandung receipt/order; role non-print harus ditolak.",
  );

  const cashierPrintJobs = await request("/api/print-jobs?status=pending", {}, jars.cashier);
  expectStatus(results, "Cashier can read print queue", cashierPrintJobs, 200, "medium", "Kasir butuh print receipt queue.");

  const financeSummaryCashier = await request("/api/finance/summary", {}, jars.cashier);
  expectStatus(
    results,
    "Cashier blocked from finance summary",
    financeSummaryCashier,
    403,
    "high",
    "Ringkasan finance harus tetap role finance/manager/owner/supervisor.",
  );
}

async function runPublicPrivacyTests(results: AuditResult[]) {
  const publicTables = await request("/api/customer/tables/live");
  if (
    expectStatus(
      results,
      "Public table live endpoint",
      publicTables,
      200,
      "high",
      "Landing Cek Meja membutuhkan public read-only endpoint.",
    )
  ) {
    assertNoSensitiveKeys(
      results,
      "Public table live privacy",
      dataOf<unknown>(publicTables.json),
      [
        "currentOrderId",
        "orderNo",
        "customerName",
        "customerPhone",
        "total",
        "timerMinutes",
        "kitchenStatus",
        "payment",
        "payload",
        "metadata",
      ],
      "critical",
      "Return hanya tableNumber, tableLabel, status, available, needsCleaning, lastStatusAt.",
    );
  }

  const queue = await request("/api/display/customer-queue");
  if (expectStatus(results, "Public TV queue endpoint", queue, 200, "high", "TV queue harus public-safe atau diproteksi.")) {
    assertNoSensitiveKeys(
      results,
      "Public TV queue privacy",
      dataOf<unknown>(queue.json),
      ["customerName", "customerPhone", "customerNote", "payment", "payload", "metadata", "whatsappInvoiceUrl"],
      "critical",
      "TV queue tidak boleh mengembalikan identitas/customer contact.",
    );
  }
}

async function runCustomerOrderTests(
  results: AuditResult[],
  cashierJar: CookieJar,
  selected: { item: MenuItem; variant: MenuItem["variants"][number] },
) {
  const createdOrderIds: string[] = [];

  try {
    const badGuest = await request("/api/customer/orders", {
      method: "POST",
      json: {
        orderType: "dine-in",
        tableLabel: "Meja 01",
        customerMode: "guest",
        source: "qr_table",
        items: [{ itemId: selected.item.id, variantId: selected.variant.id, qty: 1 }],
      },
    });
    expectStatus(results, "Guest checkout requires identity", badGuest, 400, "high", "Guest QR checkout wajib nama dan WhatsApp.");

    const invalidItem = await request("/api/customer/orders", {
      method: "POST",
      json: {
        orderType: "dine-in",
        tableLabel: "Meja 01",
        customerMode: "guest",
        guestName: `${marker} Invalid`,
        guestPhone: "081300009999",
        source: "qr_table",
        items: [{ itemId: "missing-item", variantId: "missing-variant", qty: 1 }],
      },
    });
    expectStatus(results, "Invalid item rejected", invalidItem, 400, "high", "Server harus validasi item/variant terhadap database.");

    const qtyOverflow = await request("/api/customer/orders", {
      method: "POST",
      json: {
        orderType: "dine-in",
        tableLabel: "Meja 01",
        customerMode: "guest",
        guestName: `${marker} Qty`,
        guestPhone: "081300009998",
        source: "qr_table",
        items: [{ itemId: selected.item.id, variantId: selected.variant.id, qty: 26 }],
      },
    });
    expectStatus(results, "Customer qty cap enforced", qtyOverflow, 400, "medium", "Batasi qty per line untuk cegah abuse order payload.");

    const orderOne = await createQaOrder(results, selected, "Meja 48");
    const orderTwo = await createQaOrder(results, selected, "Meja 49");
    if (orderOne?.id) createdOrderIds.push(orderOne.id);
    if (orderTwo?.id) createdOrderIds.push(orderTwo.id);

    for (const order of [orderOne, orderTwo].filter(Boolean)) {
      const publicStatus = await request(`/api/customer/orders/${order!.id}/public-status`);
      if (
        expectStatus(
          results,
          `Public status ${order!.orderNo}`,
          publicStatus,
          200,
          "high",
          "Customer harus bisa melihat status order sendiri tanpa data sensitif.",
        )
      ) {
        assertNoSensitiveKeys(
          results,
          `Public status privacy ${order!.orderNo}`,
          dataOf<unknown>(publicStatus.json),
          [
            "customerName",
            "customerPhone",
            "customerNote",
            "subtotal",
            "service",
            "tax",
            "discount",
            "total",
            "payment",
            "cashier",
            "payload",
            "metadata",
            "whatsappInvoiceUrl",
          ],
          "critical",
          "Public status harus status-only; jangan expose contact, nominal, atau payment.",
        );
      }
    }

    const randomStatus = await request("/api/customer/orders/00000000-0000-4000-8000-000000000000/public-status");
    expectStatus(results, "Random order public status 404", randomStatus, 404, "medium", "UUID tidak valid/asing harus tidak bocor detail.");

    if (orderOne?.id) {
      const rejected = await rejectOrder(cashierJar, orderOne.id, `${marker} cleanup first reject`);
      expectStatus(results, "Cashier can reject QA order", rejected, 200, "high", "Kasir perlu bisa reject order test untuk cleanup.");

      const duplicateReject = await rejectOrder(cashierJar, orderOne.id, `${marker} duplicate reject guard`);
      expectStatus(
        results,
        "Duplicate cashier action blocked",
        duplicateReject,
        400,
        "high",
        "Aksi status order yang sudah final harus ditolak agar tidak double-process.",
      );

      const paidRejected = await request(
        `/api/customer/orders/${orderOne.id}/status`,
        {
          method: "PATCH",
          json: { action: "paid", paymentMethod: "Cashier" },
        },
        cashierJar,
      );
      expectStatus(
        results,
        "Paid on rejected order blocked",
        paidRejected,
        400,
        "high",
        "Order rejected tidak boleh bisa berubah jadi paid.",
      );
    }
  } finally {
    if (cleanupOrders) {
      for (const orderId of createdOrderIds) {
        await rejectOrder(cashierJar, orderId, `${marker} cleanup fallback`).catch(() => undefined);
      }
    }
  }
}

async function runMemberAndPosTests(results: AuditResult[], staffJar: CookieJar) {
  const memberJar = await loginMember(results);
  if (memberJar) {
    const memberProfile = await request("/api/member/profile", {}, memberJar);
    expectStatus(results, "Member profile with member cookie", memberProfile, 200, "high", "Member auth harus bisa membaca profil sendiri.");

    const memberStaffEndpoint = await request("/api/customer/orders?status=pending_cashier", {}, memberJar);
    expectStatus(
      results,
      "Member cookie cannot access staff API",
      memberStaffEndpoint,
      401,
      "critical",
      "Pisahkan cookie/session member dari staff Better Auth.",
    );

    const earnOther = await request(
      "/api/points/earn",
      {
        method: "POST",
        json: {
          memberId: "00000000-0000-4000-8000-000000000000",
          amount: 1000,
          source: "WEBSITE",
          lastOrder: marker,
        },
      },
      memberJar,
    );
    expectStatus(results, "Member earn IDOR blocked", earnOther, 403, "critical", "Member tidak boleh menambah points untuk akun lain.");

    const redeemOther = await request(
      "/api/points/redeem",
      {
        method: "POST",
        json: {
          memberId: "00000000-0000-4000-8000-000000000000",
          pointsToRedeem: 100,
        },
      },
      memberJar,
    );
    expectStatus(results, "Member redeem IDOR blocked", redeemOther, 403, "critical", "Member tidak boleh redeem points akun lain.");

    const refresh = await request("/api/member/auth/refresh", { method: "POST" }, memberJar);
    expectStatus(results, "Member refresh works", refresh, 200, "medium", "Refresh token member harus rotasi dengan session aktif.");

    const logout = await request("/api/member/auth/logout", { method: "POST" }, memberJar);
    expectStatus(results, "Member logout works", logout, 200, "medium", "Logout harus revoke refresh token dan clear cookie.");

    const refreshAfterLogout = await request("/api/member/auth/refresh", { method: "POST" }, memberJar);
    expectStatus(
      results,
      "Member refresh after logout blocked",
      refreshAfterLogout,
      401,
      "high",
      "Refresh token harus tidak bisa dipakai setelah logout.",
    );
  }

  const staffMemberEndpoint = await request("/api/member/profile", {}, staffJar);
  expectStatus(
    results,
    "Staff cookie cannot access member profile",
    staffMemberEndpoint,
    401,
    "high",
    "Staff cookie tidak boleh dianggap sebagai member session.",
  );

  const posMissing = await request(`/api/pos/member/${encodeURIComponent(memberIdentifier)}`);
  expectStatus(results, "POS member lookup requires API key", posMissing, 401, "high", "Endpoint POS harus menolak request tanpa x-api-key.");

  const posInvalid = await request(`/api/pos/member/${encodeURIComponent(memberIdentifier)}`, {
    headers: { "x-api-key": "invalid-key" },
  });
  expectStatus(results, "POS member lookup rejects invalid API key", posInvalid, 401, "high", "Hash API key terminal harus diverifikasi constant-time.");

  const posValid = await request(`/api/pos/member/${encodeURIComponent(memberIdentifier)}`, {
    headers: { "x-api-key": posApiKey },
  });
  expectStatus(results, "POS member lookup with valid API key", posValid, 200, "medium", "Seed terminal POS perlu valid untuk integrasi kasir.");

  const syncMismatch = await request("/api/pos/sync-transaction", {
    method: "POST",
    headers: { "x-api-key": posApiKey },
    json: {
      terminalCode: "GARAGE-POS-NOT-REAL",
      memberPhone: memberIdentifier,
      totalAmount: 1000,
    },
  });
  expectStatus(results, "POS terminal code mismatch blocked", syncMismatch, 401, "high", "API key valid tidak boleh dipakai untuk terminalCode lain.");
}

async function runPrintAndTableTests(results: AuditResult[], cashierJar: CookieJar) {
  const anonPatch = await request("/api/print-jobs/00000000-0000-4000-8000-000000000000", {
    method: "PATCH",
    json: { status: "printed" },
  });
  expectStatus(results, "Anonymous print job patch blocked", anonPatch, 401, "high", "Patch print jobs wajib staff auth.");

  const cashierPatchMissing = await request(
    "/api/print-jobs/00000000-0000-4000-8000-000000000000",
    {
      method: "PATCH",
      json: { status: "printed" },
    },
    cashierJar,
  );
  expectStatus(results, "Cashier random print job patch 404", cashierPatchMissing, 404, "medium", "ID print job acak harus 404 tanpa data tambahan.");

  const anonTable = await request("/api/tables/01/status");
  expectStatus(results, "Anonymous table status blocked", anonTable, 401, "high", "Endpoint meja internal harus staff-only.");

  const invalidTable = await request("/api/tables/51/status", {}, cashierJar);
  expectStatus(results, "Invalid table number rejected", invalidTable, 400, "medium", "Nomor meja harus dibatasi 01-50.");
}

async function runLanChecks(results: AuditResult[]) {
  const localHealth = await request("/api/health");
  expectStatus(results, "Local health", localHealth, 200, "high", "Server lokal harus reachable sebelum audit aktif.");

  const lanHealth = await request(`${lanBaseUrl}/api/health`).catch((error) => ({
    response: new Response(null, { status: 503 }),
    json: null,
    text: error instanceof Error ? error.message : "LAN health failed",
  }));
  expectStatus(results, "LAN health", lanHealth, 200, "medium", "Pastikan dev server bind 0.0.0.0 dan firewall LAN mengizinkan port 3001.");
}

async function runAudit() {
  const results: AuditResult[] = [
    result("info", "Audit target", `Base=${baseUrl}; LAN=${lanBaseUrl}; marker=${marker}.`),
  ];

  routeRecon(results);
  staticSecurityReview(results);
  await runLanChecks(results);
  await runPublicPrivacyTests(results);

  const selected = await getSellableMenuItem(results);
  if (!selected) return results;

  const jars = {
    owner: await loginStaff(roleEmails.owner),
    cashier: await loginStaff(roleEmails.cashier),
    waiter: await loginStaff(roleEmails.waiter),
    kitchen: await loginStaff(roleEmails.kitchen),
    finance: await loginStaff(roleEmails.finance),
  };
  results.push(result("pass", "Seed staff login", "Owner, Kasir, Waiter, Kitchen, dan Finance login berhasil."));

  await ensureCashierShiftOpen(results, jars.cashier);
  await runAuthBoundaryTests(results, jars);
  await runCustomerOrderTests(results, jars.cashier, selected);
  await runMemberAndPosTests(results, jars.cashier);
  await runPrintAndTableTests(results, jars.cashier);

  return results;
}

function printResults(results: AuditResult[]) {
  const ordered = [...results].sort((left, right) => {
    const severityDelta = severityRank[right.severity] - severityRank[left.severity];
    return severityDelta || left.check.localeCompare(right.check);
  });

  for (const item of ordered) {
    const prefix = item.severity.toUpperCase().padEnd(8, " ");
    console.log(`${prefix} ${item.check}: ${item.detail}`);
    if (item.evidence) console.log(`         evidence: ${item.evidence}`);
    if (item.remediation) console.log(`         fix: ${item.remediation}`);
  }

  const findings = results.filter((item) => !["pass", "info"].includes(item.severity));
  const highest = findings.sort((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];
  const counts = (["critical", "high", "medium", "low", "info", "pass"] as const)
    .map((severity) => `${severity}=${results.filter((item) => item.severity === severity).length}`)
    .join(" ");

  console.log(`SECURITY AUDIT SUMMARY: ${counts}`);
  console.log(`SECURITY AUDIT STATUS: ${highest ? `FINDINGS (${highest.severity.toUpperCase()} max)` : "PASS"}`);

  const shouldFail =
    strictExit && findings.some((item) => item.severity === "critical" || item.severity === "high");
  if (shouldFail) {
    process.exitCode = 1;
  }
}

runAudit()
  .then(printResults)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
