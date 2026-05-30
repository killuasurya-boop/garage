import { config as loadEnv } from "dotenv";

import {
  ensureGarageMemberLoyaltySeed,
  GARAGE_SMOKE_MEMBER_PHONE,
} from "@/lib/garage-member-seed";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

type SmokeResponse<T = JsonValue> = {
  response: Response;
  json: T | null;
  text: string;
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

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const staffEmail = process.env.SMOKE_STAFF_EMAIL ?? "kasir@garage.local";
const staffPassword = process.env.SMOKE_STAFF_PASSWORD ?? "garage12345";
const memberIdentifier =
  process.env.SMOKE_MEMBER_IDENTIFIER ?? GARAGE_SMOKE_MEMBER_PHONE;
const memberPassword = process.env.SMOKE_MEMBER_PASSWORD ?? "member12345";
const smokeStamp = Date.now().toString().slice(-6);

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
      if (separator <= 0) {
        continue;
      }

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = /max-age=0/i.test(cookie) || /expires=thu,\s*01 jan 1970/i.test(cookie);
      if (expired) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}

function splitSetCookieHeader(value: string | null) {
  if (!value) {
    return [];
  }

  return value.split(/,(?=\s*[^;,\s]+=)/).map((cookie) => cookie.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function dataOf<T>(json: unknown): T {
  const record = asRecord(json);
  return record.data as T;
}

function messageOf(json: unknown, fallback: string) {
  const record = asRecord(json);
  const error = asRecord(record.error);
  return String(error.message ?? record.message ?? fallback);
}

async function request<T = JsonValue>(
  path: string,
  options: RequestInit & { json?: JsonValue } = {},
  jar?: CookieJar,
): Promise<SmokeResponse<T>> {
  const headers = new Headers(options.headers);
  if (!headers.has("Origin")) {
    headers.set("Origin", baseUrl);
  }
  if (!headers.has("Referer")) {
    headers.set("Referer", `${baseUrl}/pos-login`);
  }

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const cookieHeader = jar?.header();
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const response = await fetch(`${baseUrl}${path}`, {
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

function expectStatus(result: SmokeResponse, status: number, label: string) {
  if (result.response.status !== status) {
    throw new Error(`${label} expected ${status}, got ${result.response.status}: ${messageOf(result.json, result.text)}`);
  }
}

async function rejectOrder(jar: CookieJar, orderId: string, reason: string, allowAlreadyProcessed = true) {
  const result = await request(
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

  if (result.response.ok) {
    return result;
  }

  if (allowAlreadyProcessed && result.response.status === 400) {
    return result;
  }

  throw new Error(`cleanup reject failed for ${orderId}: ${result.response.status} ${result.text}`);
}

async function loginStaff(jar: CookieJar) {
  const result = await request(
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

  if (!result.response.ok) {
    throw new Error(`staff login failed: ${result.response.status} ${messageOf(result.json, result.text)}`);
  }
}

async function loginMember(jar: CookieJar) {
  const attemptLogin = () =>
    request(
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

  let result = await attemptLogin();

  if (!result.response.ok && process.env.DATABASE_URL) {
    await ensureGarageMemberLoyaltySeed(memberPassword);
    result = await attemptLogin();
  }

  if (!result.response.ok) {
    throw new Error(
      `member login failed: ${result.response.status} ${messageOf(result.json, result.text)}. ` +
        "Jalankan npm run db:seed atau set DATABASE_URL agar smoke bisa auto-seed member.",
    );
  }
}

async function main() {
  const staffJar = new CookieJar();
  const memberJar = new CookieJar();
  const createdOrderIds: string[] = [];

  console.log(`GARAGE LAN smoke target: ${baseUrl}`);

  const health = await request("/api/health");
  expectStatus(health, 200, "health");
  const healthData = dataOf<{ ok: boolean; database?: { status?: string } }>(health.json);
  if (!healthData.ok || healthData.database?.status !== "reachable") {
    throw new Error(`database health failed: ${JSON.stringify(healthData)}`);
  }
  console.log("OK health DB");

  const menu = await request("/api/customer/menu");
  expectStatus(menu, 200, "customer menu");
  const menuItems = dataOf<MenuItem[]>(menu.json);
  const selectedItem = menuItems.find((item) => item.variants.length > 0);
  const selectedVariant = selectedItem?.variants[0];
  if (!selectedItem || !selectedVariant) {
    throw new Error("menu API returned no sellable item variant");
  }
  console.log(`OK menu API (${menuItems.length} items)`);

  const unauthenticated = await request("/api/customer/orders?status=pending_cashier");
  expectStatus(unauthenticated, 401, "cashier orders without login");
  console.log("OK cashier endpoint blocks anonymous user");

  await loginStaff(staffJar);
  const cashierOrders = await request("/api/customer/orders?status=pending_cashier", {}, staffJar);
  expectStatus(cashierOrders, 200, "cashier orders after login");
  console.log("OK cashier login and pending QR endpoint");

  const qrInsights = await request("/api/customer/orders/insights", {}, staffJar);
  expectStatus(qrInsights, 200, "QR control insights after login");
  const qrInsightData = dataOf<{ summary?: { total?: number }; shiftReport?: { gate?: string } }>(qrInsights.json);
  if (typeof qrInsightData.summary?.total !== "number" || !qrInsightData.shiftReport?.gate) {
    throw new Error(`QR control insight response invalid: ${JSON.stringify(qrInsightData)}`);
  }
  console.log("OK QR control insights endpoint");

  const tableLive = await request("/api/tables/live", {}, staffJar);
  expectStatus(tableLive, 200, "table live after login");
  const tableRows = dataOf<Array<{ tableNumber?: string; status?: string }>>(tableLive.json);
  if (!Array.isArray(tableRows) || tableRows.length !== 50 || tableRows[0]?.tableNumber !== "01") {
    throw new Error(`table live response invalid: ${JSON.stringify(tableRows?.slice?.(0, 3))}`);
  }
  console.log("OK table live endpoint");

  const displayQueue = await request("/api/display/customer-queue");
  expectStatus(displayQueue, 200, "customer display queue");
  const displayRows = dataOf<Array<Record<string, unknown>>>(displayQueue.json);
  if (!Array.isArray(displayRows) || displayRows.some((row) => "customerPhone" in row || "customerName" in row)) {
    throw new Error("customer display queue leaked customer identity fields");
  }
  console.log("OK customer display queue endpoint");

  const printJobs = await request("/api/print-jobs?status=pending", {}, staffJar);
  expectStatus(printJobs, 200, "print jobs after login");
  console.log("OK print jobs endpoint");

  const voucherCheck = await request("/api/vouchers/validate", {
    method: "POST",
    json: {
      code: "SMOKE-NOT-REAL",
      subtotal: selectedVariant.price,
      customerMode: "guest",
    },
  });
  expectStatus(voucherCheck, 200, "voucher validate fallback");
  const voucherData = dataOf<{ valid?: boolean }>(voucherCheck.json);
  if (voucherData.valid !== false) {
    throw new Error(`invalid voucher should not validate: ${JSON.stringify(voucherData)}`);
  }
  console.log("OK voucher validation endpoint");

  try {
    const guestOrder = await request(
      "/api/customer/orders",
      {
        method: "POST",
        json: {
          orderType: "dine-in",
          tableLabel: "Meja 50",
          customerMode: "guest",
          guestName: `QA Smoke Guest ${smokeStamp}`,
          guestPhone: `0813999${smokeStamp}`,
          source: "qr_table",
          campaign: "smoke",
          items: [{ itemId: selectedItem.id, variantId: selectedVariant.id, qty: 1 }],
        },
      },
    );
    expectStatus(guestOrder, 201, "guest QR order create");
    const guestData = dataOf<{ order: { id: string; status: string; whatsappInvoiceUrl?: string } }>(guestOrder.json);
    if (!guestData.order?.id || guestData.order.status !== "pending_cashier") {
      throw new Error(`guest order response invalid: ${JSON.stringify(guestData)}`);
    }
    createdOrderIds.push(guestData.order.id);
    if (!guestData.order.whatsappInvoiceUrl?.startsWith("https://wa.me/")) {
      throw new Error("guest order did not return wa.me invoice fallback link");
    }
    const publicStatus = await request(`/api/customer/orders/${guestData.order.id}/public-status`);
    expectStatus(publicStatus, 200, "guest public status");
    const publicStatusData = dataOf<{ orderNo?: string; kitchenStatus?: string }>(publicStatus.json);
    if (!publicStatusData.orderNo || publicStatusData.kitchenStatus !== "waiting_cashier") {
      throw new Error(`public status invalid: ${JSON.stringify(publicStatusData)}`);
    }
    await rejectOrder(staffJar, guestData.order.id, "Smoke cleanup guest order", false);
    createdOrderIds.pop();
    const duplicateReject = await rejectOrder(
      staffJar,
      guestData.order.id,
      "Smoke duplicate reject guard",
      true,
    );
    if (duplicateReject.response.status !== 400) {
      throw new Error(`duplicate reject guard expected 400, got ${duplicateReject.response.status}`);
    }
    console.log("OK guest QR order create, reject cleanup, and duplicate guard");

    await loginMember(memberJar);
    const memberProfile = await request("/api/member/profile", {}, memberJar);
    expectStatus(memberProfile, 200, "member profile");
    const memberOrder = await request(
      "/api/customer/orders",
      {
        method: "POST",
        json: {
          orderType: "dine-in",
          tableLabel: "Meja 49",
          customerMode: "member",
          source: "qr_table",
          campaign: "smoke",
          items: [{ itemId: selectedItem.id, variantId: selectedVariant.id, qty: 1 }],
        },
      },
      memberJar,
    );
    expectStatus(memberOrder, 201, "member QR order create");
    const memberData = dataOf<{ order: { id: string; status: string } }>(memberOrder.json);
    if (!memberData.order?.id || memberData.order.status !== "pending_cashier") {
      throw new Error(`member order response invalid: ${JSON.stringify(memberData)}`);
    }
    createdOrderIds.push(memberData.order.id);
    await rejectOrder(staffJar, memberData.order.id, "Smoke cleanup member order", false);
    createdOrderIds.pop();
    console.log("OK member login, profile, QR order create and reject cleanup");
  } finally {
    while (createdOrderIds.length) {
      const orderId = createdOrderIds.pop();
      if (orderId) {
        await rejectOrder(staffJar, orderId, "Smoke cleanup fallback");
      }
    }
  }

  console.log("GARAGE LAN smoke passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
