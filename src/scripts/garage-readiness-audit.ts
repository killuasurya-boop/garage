import { config as loadEnv } from "dotenv";

import { GARAGE_SMOKE_MEMBER_PHONE } from "@/lib/garage-member-seed";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
type Severity = "pass" | "warn" | "fail";

type AuditResult = {
  severity: Severity;
  check: string;
  detail: string;
};

type AuditResponse<T = JsonValue> = {
  response: Response;
  json: T | null;
  text: string;
};

type PendingQrOrder = {
  id: string;
  orderNo: string;
  tableLabel: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerNote?: string | null;
  campaign?: string | null;
};

const baseUrl = (process.env.READINESS_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const lanBaseUrl = (
  process.env.READINESS_LAN_URL ??
  process.env.GARAGE_PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ??
  process.env.BETTER_AUTH_URL ??
  "http://192.168.110.142:3001"
).replace(/\/+$/, "");
const staffEmail = process.env.READINESS_STAFF_EMAIL ?? process.env.SMOKE_STAFF_EMAIL ?? "kasir@garage.local";
const staffPassword =
  process.env.READINESS_STAFF_PASSWORD ??
  process.env.SMOKE_STAFF_PASSWORD ??
  process.env.GARAGE_SEED_PASSWORD ??
  "garage12345";
const memberIdentifier = process.env.SMOKE_MEMBER_IDENTIFIER ?? GARAGE_SMOKE_MEMBER_PHONE;
const memberPassword = process.env.SMOKE_MEMBER_PASSWORD ?? "member12345";
const cleanupTestOrders = process.env.READINESS_CLEANUP_TEST_ORDERS === "1";
const pilotTables = ["01", "25", "50"];

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
      this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
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
  return String(error.message ?? record.message ?? fallback);
}

function result(severity: Severity, check: string, detail: string): AuditResult {
  return { severity, check, detail };
}

async function request<T = JsonValue>(
  pathOrUrl: string,
  options: RequestInit & { json?: JsonValue } = {},
  jar?: CookieJar,
): Promise<AuditResponse<T>> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const headers = new Headers(options.headers);
  if (!headers.has("Origin")) headers.set("Origin", baseUrl);
  if (!headers.has("Referer")) headers.set("Referer", `${baseUrl}/pos-login`);
  if (options.json !== undefined) headers.set("Content-Type", "application/json");

  const cookieHeader = jar?.header();
  if (cookieHeader) headers.set("Cookie", cookieHeader);

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
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
}

function isLikelyTestOrder(order: PendingQrOrder) {
  const haystack = [
    order.orderNo,
    order.tableLabel,
    order.customerName,
    order.customerPhone,
    order.customerNote,
    order.campaign,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\b(codex|qa smoke|smoke|test|testing)\b/.test(haystack) ||
    order.tableLabel.toLowerCase() === "meja 99"
  );
}

async function loginStaff(jar: CookieJar) {
  const login = await request(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      json: {
        email: staffEmail,
        password: staffPassword,
        callbackURL: "/pos",
      },
    },
    jar,
  );

  if (!login.response.ok) {
    throw new Error(`staff login failed: ${login.response.status} ${messageOf(login.json, login.text)}`);
  }
}

async function rejectTestOrder(jar: CookieJar, order: PendingQrOrder) {
  return request(
    `/api/customer/orders/${order.id}/status`,
    {
      method: "PATCH",
      json: {
        action: "reject",
        reason: "Production readiness cleanup: stale test QR order",
      },
    },
    jar,
  );
}

async function runAudit() {
  const results: AuditResult[] = [];
  const staffJar = new CookieJar();

  results.push(result("pass", "Target", `Base ${baseUrl}; LAN ${lanBaseUrl}`));

  const trustedOrigins = process.env.GARAGE_TRUSTED_ORIGINS ?? "";
  if (!process.env.BETTER_AUTH_URL?.includes(new URL(lanBaseUrl).host)) {
    results.push(result("fail", "LAN auth URL", "BETTER_AUTH_URL belum memakai host LAN outlet."));
  } else if (!trustedOrigins.includes(lanBaseUrl)) {
    results.push(result("fail", "Trusted origins", "GARAGE_TRUSTED_ORIGINS belum mencakup URL LAN outlet."));
  } else {
    results.push(result("pass", "LAN auth config", "BETTER_AUTH_URL dan trusted origins sudah cocok."));
  }

  if (
    process.env.GARAGE_PUBLIC_BASE_URL === lanBaseUrl &&
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL === lanBaseUrl
  ) {
    results.push(result("pass", "QR public base URL", "Server dan client memakai base URL LAN yang sama."));
  } else {
    results.push(result("fail", "QR public base URL", "GARAGE_PUBLIC_BASE_URL dan NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL harus sama dengan LAN URL."));
  }

  const health = await request<{ data?: { ok?: boolean; database?: { status?: string } } }>("/api/health");
  const healthData = dataOf<{ ok?: boolean; database?: { status?: string } }>(health.json);
  if (health.response.ok && healthData?.ok && healthData.database?.status?.startsWith("reachable")) {
    results.push(result("pass", "Health DB", "Database reachable."));
  } else {
    results.push(result("fail", "Health DB", messageOf(health.json, health.text)));
  }

  const lanHealth = await request<{ data?: { ok?: boolean } }>(`${lanBaseUrl}/api/health`).catch((error) => ({
    response: new Response(null, { status: 503 }),
    json: null,
    text: error instanceof Error ? error.message : "LAN health request failed",
  }));
  if (lanHealth.response.ok) {
    results.push(result("pass", "LAN health", `${lanBaseUrl}/api/health reachable.`));
  } else if (health.response.ok) {
    results.push(
      result(
        "warn",
        "LAN health",
        `${lanBaseUrl}/api/health tidak terjangkau dari mesin ini (${lanHealth.text || "unreachable"}). Localhost OK — cek dari tablet WiFi sebelum pilot.`,
      ),
    );
  } else {
    results.push(result("fail", "LAN health", lanHealth.text || "LAN health unreachable."));
  }

  const menu = await request<{ data?: unknown[] }>("/api/customer/menu");
  const menuRows = dataOf<unknown[]>(menu.json);
  if (menu.response.ok && Array.isArray(menuRows) && menuRows.length > 0) {
    results.push(result("pass", "Menu API", `${menuRows.length} menu item terbaca.`));
  } else {
    results.push(result("fail", "Menu API", "Menu API kosong atau gagal."));
  }

  for (const table of pilotTables) {
    const qr = await request(`/api/customer/qr?table=${table}`);
    const orderUrl = qr.response.headers.get("X-Garage-Order-Url");
    const expectedUrl = `${lanBaseUrl}/order?table=${table}&source=qr_table`;
    if (qr.response.ok && qr.text.includes("<svg") && orderUrl === expectedUrl) {
      results.push(result("pass", `QR meja ${table}`, expectedUrl));
    } else {
      results.push(result("fail", `QR meja ${table}`, `Expected ${expectedUrl}; got ${orderUrl ?? "no URL"}.`));
    }
  }

  const invalidQr = await request("/api/customer/qr?table=51");
  results.push(
    invalidQr.response.status === 400
      ? result("pass", "QR invalid table", "Table di luar 01-50 ditolak.")
      : result("fail", "QR invalid table", `Expected 400; got ${invalidQr.response.status}.`),
  );

  const pilotPrint = await request("/order/qr-print?tables=01,25,50");
  const pilotPrintText = pilotPrint.text.replace(/<!-- -->/g, "");
  const pilotPrintOk =
    pilotPrint.response.ok &&
    pilotPrintText.includes("QR Pilot 3 Meja") &&
    pilotPrintText.includes("Meja 01") &&
    pilotPrintText.includes("Meja 25") &&
    pilotPrintText.includes("Meja 50") &&
    !pilotPrintText.includes("Meja 02");
  results.push(
    pilotPrintOk
      ? result("pass", "Print pilot", "Halaman pilot hanya memuat meja 01, 25, 50.")
      : result("fail", "Print pilot", "Halaman pilot tidak sesuai meja UAT."),
  );

  const badGuest = await request("/api/customer/orders", {
    method: "POST",
    json: {
      orderType: "dine-in",
      tableLabel: "Meja 01",
      customerMode: "guest",
      source: "qr_table",
      items: [{ itemId: "missing", variantId: "missing", qty: 1 }],
    },
  });
  results.push(
    badGuest.response.status === 400
      ? result("pass", "Guest validation", "Guest tanpa nama/WhatsApp ditolak sebelum checkout.")
      : result("fail", "Guest validation", `Expected 400; got ${badGuest.response.status}.`),
  );

  const anonymousCashier = await request("/api/customer/orders?status=pending_cashier");
  results.push(
    anonymousCashier.response.status === 401
      ? result("pass", "Cashier auth", "Pending QR endpoint menolak anonymous.")
      : result("fail", "Cashier auth", `Expected 401; got ${anonymousCashier.response.status}.`),
  );

  const anonymousInsights = await request("/api/customer/orders/insights");
  results.push(
    anonymousInsights.response.status === 401
      ? result("pass", "QR control auth", "Insight QR menolak anonymous.")
      : result("fail", "QR control auth", `Expected 401; got ${anonymousInsights.response.status}.`),
  );

  const anonymousTables = await request("/api/tables/live");
  results.push(
    anonymousTables.response.status === 401
      ? result("pass", "Table map auth", "Live table map menolak anonymous.")
      : result("fail", "Table map auth", `Expected 401; got ${anonymousTables.response.status}.`),
  );

  const displayQueue = await request<{ data?: Array<Record<string, unknown>> }>("/api/display/customer-queue");
  const displayRows = dataOf<Array<Record<string, unknown>>>(displayQueue.json);
  if (
    displayQueue.response.ok &&
    Array.isArray(displayRows) &&
    displayRows.every((row) => !("customerPhone" in row) && !("customerName" in row))
  ) {
    results.push(result("pass", "Customer display privacy", "TV queue tidak mengembalikan nama/WA customer."));
  } else {
    results.push(result("fail", "Customer display privacy", "TV queue gagal atau mengandung data customer sensitif."));
  }

  await loginStaff(staffJar);
  const qrInsights = await request<{ data?: { summary?: { total?: number }; shiftReport?: { gate?: string } } }>(
    "/api/customer/orders/insights",
    {},
    staffJar,
  );
  const qrInsightData = dataOf<{ summary?: { total?: number }; shiftReport?: { gate?: string } }>(qrInsights.json);
  if (
    qrInsights.response.ok &&
    typeof qrInsightData?.summary?.total === "number" &&
    Boolean(qrInsightData?.shiftReport?.gate)
  ) {
    results.push(result("pass", "QR control insights", "Dashboard QR Control harian tersedia."));
  } else {
    results.push(result("fail", "QR control insights", messageOf(qrInsights.json, qrInsights.text)));
  }

  const tableLive = await request<{ data?: Array<{ tableNumber?: string; status?: string }> }>(
    "/api/tables/live",
    {},
    staffJar,
  );
  const tableLiveRows = dataOf<Array<{ tableNumber?: string; status?: string }>>(tableLive.json);
  if (
    tableLive.response.ok &&
    Array.isArray(tableLiveRows) &&
    tableLiveRows.length === 50 &&
    tableLiveRows[0]?.tableNumber === "01" &&
    tableLiveRows[49]?.tableNumber === "50"
  ) {
    results.push(result("pass", "Table map 50 meja", "Endpoint live table mengembalikan meja 01-50."));
  } else {
    results.push(result("fail", "Table map 50 meja", "Live table tidak lengkap 01-50."));
  }

  const printJobs = await request("/api/print-jobs?status=pending", {}, staffJar);
  results.push(
    printJobs.response.ok
      ? result("pass", "Print queue", "Endpoint print queue kasir/kitchen tersedia.")
      : result("fail", "Print queue", messageOf(printJobs.json, printJobs.text)),
  );

  const pendingOrders = await request<{ data?: PendingQrOrder[] }>(
    "/api/customer/orders?status=pending_cashier",
    {},
    staffJar,
  );
  if (!pendingOrders.response.ok) {
    results.push(result("fail", "Cashier pending QR", messageOf(pendingOrders.json, pendingOrders.text)));
  } else {
    const pendingRows = dataOf<PendingQrOrder[]>(pendingOrders.json) ?? [];
    const testOrders = pendingRows.filter(isLikelyTestOrder);
    const operationalPending = pendingRows.filter((order) => !isLikelyTestOrder(order));

    if (testOrders.length && cleanupTestOrders) {
      for (const order of testOrders) {
        const rejected = await rejectTestOrder(staffJar, order);
        if (!rejected.response.ok) {
          results.push(result("fail", "Cleanup test order", `${order.orderNo} gagal reject: ${rejected.text}`));
        }
      }
      results.push(result("pass", "Cleanup test order", `${testOrders.length} pending test order direject.`));
    } else if (testOrders.length) {
      results.push(
        result(
          "warn",
          "Pending test orders",
          `${testOrders.length} order test masih pending. Jalankan READINESS_CLEANUP_TEST_ORDERS=1 untuk cleanup aman.`,
        ),
      );
    } else {
      results.push(result("pass", "Pending test orders", "Tidak ada pending QR test order."));
    }

    if (operationalPending.length) {
      results.push(
        result(
          "warn",
          "Pending operational QR",
          `${operationalPending.length} order QR pending perlu dicek kasir sebelum pilot.`,
        ),
      );
    } else {
      results.push(result("pass", "Pending operational QR", "Tidak ada pending QR operasional."));
    }
  }

  if (process.env.DATABASE_URL || healthData?.database?.status?.startsWith("reachable")) {
    const memberLogin = await request("/api/member/auth/login", {
      method: "POST",
      json: {
        identifier: memberIdentifier,
        password: memberPassword,
      },
    });
    if (memberLogin.response.ok) {
      results.push(
        result(
          "pass",
          "Smoke member account",
          `${memberIdentifier} bisa login via member auth API.`,
        ),
      );
    } else {
      results.push(
        result(
          "warn",
          "Smoke member account",
          `Akun smoke ${memberIdentifier} belum bisa login. Untuk UAT membership, jalankan seed demo/member atau set SMOKE_MEMBER_PASSWORD yang sesuai.`,
        ),
      );
    }
  } else {
    results.push(
      result(
        "warn",
        "Smoke member account",
        "DATABASE_URL tidak diset; cek akun smoke member dilewati.",
      ),
    );
  }

  return results;
}

function printResults(results: AuditResult[]) {
  for (const item of results) {
    const prefix = item.severity === "pass" ? "PASS" : item.severity === "warn" ? "WARN" : "FAIL";
    console.log(`${prefix} ${item.check}: ${item.detail}`);
  }

  const hasFail = results.some((item) => item.severity === "fail");
  const hasWarn = results.some((item) => item.severity === "warn");
  const status = hasFail ? "NO-GO" : hasWarn ? "CONDITIONAL GO" : "GO";
  console.log(`READINESS STATUS: ${status}`);

  if (hasFail) {
    process.exitCode = 1;
  }
}

runAudit()
  .then(printResults)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
