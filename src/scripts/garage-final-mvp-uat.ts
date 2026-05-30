/**
 * Automated API checks for Final MVP UAT 1-5 (POS-first).
 * Manual UI verification still required for print/PDF and tablet layout.
 */
import { config as loadEnv } from "dotenv";

import { GARAGE_SMOKE_MEMBER_PHONE } from "@/lib/garage-member-seed";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

type UatResult = { id: string; label: string; pass: boolean; detail: string };

const baseUrl = (process.env.UAT_BASE_URL ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001").replace(
  /\/+$/,
  "",
);
const kasirEmail = process.env.UAT_KASIR_EMAIL ?? "kasir@garage.local";
const kasirPassword = process.env.UAT_KASIR_PASSWORD ?? process.env.GARAGE_SEED_PASSWORD ?? "garage12345";
const financeEmail = process.env.UAT_FINANCE_EMAIL ?? "finance@garage.local";
const managerEmail = process.env.UAT_MANAGER_EMAIL ?? "manager@garage.local";
const gudangEmail = process.env.UAT_GUDANG_EMAIL ?? "gudang@garage.local";
const sharedPassword = process.env.UAT_PASSWORD ?? kasirPassword;
const memberPhone = process.env.SMOKE_MEMBER_IDENTIFIER ?? GARAGE_SMOKE_MEMBER_PHONE;

class CookieJar {
  private readonly cookies = new Map<string, string>();
  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
  store(headers: Headers) {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const raw =
      typeof getSetCookie === "function"
        ? getSetCookie.call(headers)
        : (headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,\s]+=)/);
    for (const cookie of raw) {
      const pair = cookie.split(";")[0];
      const sep = pair.indexOf("=");
      if (sep <= 0) continue;
      const name = pair.slice(0, sep).trim();
      const value = pair.slice(sep + 1).trim();
      if (/max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
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
  const error = asRecord(asRecord(json).error);
  return String(error.message ?? fallback);
}

async function request<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
  jar?: CookieJar,
) {
  const headers = new Headers(options.headers);
  headers.set("Origin", baseUrl);
  headers.set("Referer", `${baseUrl}/os`);
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  const cookie = jar?.header();
  if (cookie) headers.set("Cookie", cookie);
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

async function loginEmail(jar: CookieJar, email: string) {
  const result = await request(
    "/api/auth/sign-in/email",
    { method: "POST", json: { email, password: sharedPassword, callbackURL: "/os" } },
    jar,
  );
  if (!result.response.ok) {
    throw new Error(`login ${email} failed: ${result.response.status} ${messageOf(result.json, result.text)}`);
  }
}

async function uatCashierShift(): Promise<UatResult> {
  const jar = new CookieJar();
  try {
    await loginEmail(jar, kasirEmail);
    const active = await request("/api/finance/cash-sessions/me/active", {}, jar);
    if (!active.response.ok) {
      return { id: "cashier-shift", label: "Kasir shift", pass: false, detail: "Active session endpoint gagal." };
    }
    const activeData = dataOf<{ session: { id: string } | null }>(active.json);
    let sessionId = activeData.session?.id;
    if (!sessionId) {
      const opened = await request(
        "/api/finance/cash-sessions",
        { method: "POST", json: { openingCash: 50000, shiftNumber: 1 } },
        jar,
      );
      if (opened.response.status !== 201 && opened.response.status !== 409) {
        return {
          id: "cashier-shift",
          label: "Kasir shift",
          pass: false,
          detail: `Buka shift gagal: ${opened.response.status}`,
        };
      }
      const openedData = dataOf<{ id: string }>(opened.json);
      sessionId = openedData.id;
      if (!sessionId && opened.response.status === 409) {
        const again = await request("/api/finance/cash-sessions/me/active", {}, jar);
        sessionId = dataOf<{ session: { id: string } | null }>(again.json).session?.id;
      }
    }
    if (!sessionId) {
      return { id: "cashier-shift", label: "Kasir shift", pass: false, detail: "Tidak ada session aktif." };
    }
    const summary = await request(`/api/finance/cash-sessions/${sessionId}/summary`, {}, jar);
    if (!summary.response.ok) {
      return { id: "cashier-shift", label: "Kasir shift", pass: false, detail: "Summary shift gagal." };
    }
    return {
      id: "cashier-shift",
      label: "Kasir shift",
      pass: true,
      detail: `Session ${sessionId} aktif, summary OK.`,
    };
  } catch (error) {
    return {
      id: "cashier-shift",
      label: "Kasir shift",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatFinanceExpense(): Promise<UatResult> {
  const jar = new CookieJar();
  try {
    await loginEmail(jar, financeEmail);
    const small = await request(
      "/api/finance/expenses",
      {
        method: "POST",
        json: {
          category: "Operasional",
          description: "UAT expense kecil",
          amount: 25000,
          paymentMethod: "Cash",
        },
      },
      jar,
    );
    if (!small.response.ok) {
      return { id: "finance-expense", label: "Finance pengeluaran", pass: false, detail: "Expense kecil gagal." };
    }
    const large = await request(
      "/api/finance/expenses",
      {
        method: "POST",
        json: {
          category: "Operasional",
          description: "UAT expense besar approval",
          amount: 1_500_000,
          paymentMethod: "Transfer",
        },
      },
      jar,
    );
    if (!large.response.ok) {
      return { id: "finance-expense", label: "Finance pengeluaran", pass: false, detail: "Expense besar gagal." };
    }
    const largeRow = dataOf<{ status: string; id: string }>(large.json);
    if (largeRow.status !== "pending_approval") {
      return {
        id: "finance-expense",
        label: "Finance pengeluaran",
        pass: false,
        detail: `Expense besar status=${largeRow.status}, expected pending_approval.`,
      };
    }
    const managerJar = new CookieJar();
    await loginEmail(managerJar, managerEmail);
    const approved = await request(
      `/api/finance/expenses/${largeRow.id}/approve`,
      { method: "PATCH", json: {} },
      managerJar,
    );
    if (!approved.response.ok) {
      return { id: "finance-expense", label: "Finance pengeluaran", pass: false, detail: "Approve expense gagal." };
    }
    const overview = await request("/api/finance/overview", {}, jar);
    if (!overview.response.ok) {
      return { id: "finance-expense", label: "Finance pengeluaran", pass: false, detail: "Overview gagal." };
    }
    const exportRes = await request(
      `/api/finance/export?date=${new Date().toISOString().slice(0, 10)}`,
      {},
      jar,
    );
    if (!exportRes.response.ok) {
      return { id: "finance-expense", label: "Finance pengeluaran", pass: false, detail: "Export XLSX gagal." };
    }
    return {
      id: "finance-expense",
      label: "Finance pengeluaran",
      pass: true,
      detail: "Expense kecil/besar, approve, overview, export OK.",
    };
  } catch (error) {
    return {
      id: "finance-expense",
      label: "Finance pengeluaran",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatInventoryOpname(): Promise<UatResult> {
  const jar = new CookieJar();
  try {
    await loginEmail(jar, gudangEmail);
    const inventory = await request("/api/inventory", {}, jar);
    if (!inventory.response.ok) {
      return { id: "inventory-opname", label: "Stok opname", pass: false, detail: "List inventory gagal." };
    }
    const items = dataOf<Array<{ sku: string; onHand: number }>>(inventory.json);
    const sku = items[0]?.sku;
    if (!sku) {
      return { id: "inventory-opname", label: "Stok opname", pass: false, detail: "Tidak ada SKU seed." };
    }
    const onHand = items[0].onHand ?? 0;
    const created = await request(
      "/api/inventory/opname",
      {
        method: "POST",
        json: {
          locationType: "warehouse",
          note: "UAT Final MVP opname",
          items: [{ sku, systemQty: onHand, physicalQty: onHand }],
        },
      },
      jar,
    );
    if (!created.response.ok) {
      return {
        id: "inventory-opname",
        label: "Stok opname",
        pass: false,
        detail: `Create opname gagal: ${created.response.status}`,
      };
    }
    const createdPayload = dataOf<{ session: { id: string; status: string } }>(created.json);
    const sessionId = createdPayload.session?.id;
    if (!sessionId) {
      return { id: "inventory-opname", label: "Stok opname", pass: false, detail: "Response opname tanpa session id." };
    }
    const managerJar = new CookieJar();
    await loginEmail(managerJar, managerEmail);
    const approved = await request(`/api/inventory/opname/${sessionId}/approve`, { method: "PATCH" }, managerJar);
    if (!approved.response.ok) {
      return {
        id: "inventory-opname",
        label: "Stok opname",
        pass: false,
        detail: `Approve opname gagal: ${approved.response.status} ${messageOf(approved.json, approved.text)}`,
      };
    }
    const applied = await request(`/api/inventory/opname/${sessionId}/apply`, { method: "PATCH" }, managerJar);
    if (!applied.response.ok) {
      return {
        id: "inventory-opname",
        label: "Stok opname",
        pass: false,
        detail: `Apply opname gagal: ${applied.response.status} ${messageOf(applied.json, applied.text)}`,
      };
    }
    const appliedRow = dataOf<{ status: string }>(applied.json);
    return {
      id: "inventory-opname",
      label: "Stok opname",
      pass: appliedRow.status === "applied",
      detail: `Opname ${sessionId} status=${appliedRow.status}.`,
    };
  } catch (error) {
    return {
      id: "inventory-opname",
      label: "Stok opname",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatQrOrder(): Promise<UatResult> {
  const jar = new CookieJar();
  try {
    await loginEmail(jar, kasirEmail);
    const menu = await request("/api/customer/menu");
    if (!menu.response.ok) {
      return { id: "qr-order", label: "QR order", pass: false, detail: "Menu API gagal." };
    }
    const menuItems = dataOf<Array<{ id: string; variants: Array<{ id: string }> }>>(menu.json);
    const item = menuItems.find((row) => row.variants.length > 0);
    if (!item) {
      return { id: "qr-order", label: "QR order", pass: false, detail: "Menu kosong." };
    }
    const variantId = item.variants[0].id;
    const guest = await request("/api/customer/orders", {
      method: "POST",
      json: {
        orderType: "dine-in",
        tableLabel: "Meja 01",
        customerMode: "guest",
        guestName: "UAT Guest",
        guestPhone: `0813888${Date.now().toString().slice(-4)}`,
        source: "qr_table",
        campaign: "final-mvp-uat",
        items: [{ itemId: item.id, variantId, qty: 1 }],
      },
    });
    if (guest.response.status !== 201) {
      return { id: "qr-order", label: "QR order", pass: false, detail: "Guest order create gagal." };
    }
    const guestOrder = dataOf<{ order: { id: string } }>(guest.json);
    const rejected = await request(
      `/api/customer/orders/${guestOrder.order.id}/status`,
      { method: "PATCH", json: { action: "reject", reason: "UAT reject meja 01" } },
      jar,
    );
    if (!rejected.response.ok) {
      return { id: "qr-order", label: "QR order", pass: false, detail: "Reject QR order gagal." };
    }
    const insights = await request("/api/customer/orders/insights", {}, jar);
    if (!insights.response.ok) {
      return { id: "qr-order", label: "QR order", pass: false, detail: "QR insights gagal." };
    }
    return {
      id: "qr-order",
      label: "QR order",
      pass: true,
      detail: "Guest order + reject + QR insights OK (accept/paid: verifikasi manual pilot).",
    };
  } catch (error) {
    return {
      id: "qr-order",
      label: "QR order",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatMemberLock(): Promise<UatResult> {
  try {
    const menu = await request("/api/customer/menu");
    const menuItems = dataOf<Array<{ id: string; variants: Array<{ id: string }> }>>(menu.json);
    const item = menuItems.find((row) => row.variants.length > 0);
    if (!item) {
      return { id: "member-lock", label: "Member lock", pass: false, detail: "Menu kosong." };
    }
    const memberJar = new CookieJar();
    const loginMember = await request(
      "/api/member/auth/login",
      {
        method: "POST",
        json: { identifier: memberPhone, password: process.env.SMOKE_MEMBER_PASSWORD ?? "member12345" },
      },
      memberJar,
    );
    if (!loginMember.response.ok) {
      return { id: "member-lock", label: "Member lock", pass: false, detail: "Member login gagal." };
    }
    const profile = await request("/api/member/profile", {}, memberJar);
    if (!profile.response.ok) {
      return { id: "member-lock", label: "Member lock", pass: false, detail: "Member profile gagal." };
    }
    const profileData = dataOf<{ member: { name: string } }>(profile.json);
    const canonicalName = profileData.member?.name;
    if (!canonicalName?.trim()) {
      return { id: "member-lock", label: "Member lock", pass: false, detail: "Nama member seed tidak ditemukan." };
    }
    const order = await request("/api/customer/orders", {
      method: "POST",
      json: {
        orderType: "dine-in",
        tableLabel: "Meja 50",
        customerMode: "guest",
        guestName: "Nama Berbeda UAT",
        guestPhone: memberPhone,
        source: "qr_table",
        items: [{ itemId: item.id, variantId: item.variants[0].id, qty: 1 }],
      },
    });
    if (order.response.status !== 201) {
      return { id: "member-lock", label: "Member lock", pass: false, detail: "Order dengan HP member gagal." };
    }
    const orderData = dataOf<{ order: { customerName?: string; id: string } }>(order.json);
    const kasirJar = new CookieJar();
    await loginEmail(kasirJar, kasirEmail);
    await request(
      `/api/customer/orders/${orderData.order.id}/status`,
      { method: "PATCH", json: { action: "reject", reason: "UAT cleanup member lock" } },
      kasirJar,
    );
    const locked =
      (orderData.order.customerName ?? "").trim().toLowerCase() === canonicalName.trim().toLowerCase();
    return {
      id: "member-lock",
      label: "Member lock",
      pass: locked,
      detail: locked
        ? `Nama terkunci ke "${canonicalName}".`
        : `Expected "${canonicalName}", got "${orderData.order.customerName ?? ""}".`,
    };
  } catch (error) {
    return {
      id: "member-lock",
      label: "Member lock",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function main() {
  console.log(`GARAGE Final MVP UAT (API) → ${baseUrl}\n`);
  const results = await Promise.all([
    uatCashierShift(),
    uatFinanceExpense(),
    uatInventoryOpname(),
    uatQrOrder(),
    uatMemberLock(),
  ]);
  let passCount = 0;
  for (const row of results) {
    const prefix = row.pass ? "PASS" : "FAIL";
    console.log(`${prefix} [${row.id}] ${row.label}: ${row.detail}`);
    if (row.pass) passCount += 1;
  }
  console.log(`\nAPI UAT: ${passCount}/${results.length} passed`);
  console.log("Item 6 (fee karyawan): verifikasi otomatis sistem — cek Finance fee liability setelah transaksi POS.");
  console.log("UI manual: centang panel UAT di Finance setelah verifikasi tablet/desktop/HP.");
  if (passCount < results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
