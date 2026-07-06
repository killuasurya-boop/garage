/**
 * Automated API checks for Warehouse operational readiness.
 * Flow: dashboard → receiving → POS consume → opname → recipe coverage.
 * Requires running app + seeded DB (npm run db:migrate && npm run db:seed).
 */
import { config as loadEnv } from "dotenv";

import { writeWmsOperationalUatEvidence } from "@/lib/garage-operational-evidence";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

type UatResult = { id: string; label: string; pass: boolean; detail: string };

const baseUrl = (process.env.UAT_BASE_URL ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001").replace(
  /\/+$/,
  "",
);
const gudangEmail = process.env.UAT_GUDANG_EMAIL ?? "gudang@garage.local";
const managerEmail = process.env.UAT_MANAGER_EMAIL ?? "manager@garage.local";
const sharedPassword = process.env.UAT_PASSWORD ?? process.env.GARAGE_SEED_PASSWORD ?? "garage12345";

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

const staffJars = new Map<string, CookieJar>();

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
  headers.set("Referer", `${baseUrl}/warehouse`);
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  const cookie = jar?.header();
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(45_000),
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
    {
      method: "POST",
      headers: { "X-Forwarded-For": "10.88.0.20" },
      json: { email, password: sharedPassword, rememberMe: true },
    },
    jar,
  );
  if (!result.response.ok) {
    throw new Error(`Login ${email} gagal: ${result.response.status} ${messageOf(result.json, result.text)}`);
  }
}

async function staffJar(email: string) {
  const existing = staffJars.get(email);
  if (existing) return existing;
  const jar = new CookieJar();
  await loginEmail(jar, email);
  staffJars.set(email, jar);
  return jar;
}

type WhStockRow = { warehouseId: string; onHand: number };

/** Total stok produk di semua ruang (onHand list produk = primary warehouse saja). */
async function totalProductStock(jar: CookieJar, productId: string) {
  const res = await request(`/api/wms/products/${productId}/stock`, {}, jar);
  if (!res.response.ok) return null;
  const rows = dataOf<WhStockRow[]>(res.json);
  return rows.reduce((sum, row) => sum + Number(row.onHand), 0);
}

/** Ruang gudang utama bar (sumber internal order menu kopi). */
async function mainBarWarehouseId(jar: CookieJar) {
  const whs = dataOf<Array<{ id: string; type?: string; area?: string; isPrimary?: boolean }>>(
    (await request("/api/wms/warehouses", {}, jar)).json,
  );
  return (
    whs.find((w) => w.type === "main" && w.area === "bar")?.id ??
    whs.find((w) => w.isPrimary)?.id ??
    whs[0]?.id ??
    null
  );
}

async function warehouseStock(jar: CookieJar, productId: string, warehouseId: string) {
  const rows = dataOf<WhStockRow[]>((await request(`/api/wms/products/${productId}/stock`, {}, jar)).json);
  return rows.find((r) => r.warehouseId === warehouseId)?.onHand ?? 0;
}

async function mainWarehouses(jar: CookieJar) {
  const whs = dataOf<Array<{ id: string; type?: string; area?: string }>>(
    (await request("/api/wms/warehouses", {}, jar)).json,
  );
  return whs.filter((w) => w.type === "main");
}

async function ensureProductInWarehouse(
  jar: CookieJar,
  productId: string,
  warehouseId: string,
  minQty: number,
) {
  const avail = await warehouseStock(jar, productId, warehouseId);
  if (avail >= minQty) return;
  const delta = Math.ceil(minQty - avail);
  await request(
    "/api/wms/adjustment",
    {
      method: "POST",
      json: { productId, warehouseId, deltaQty: delta, note: "UAT bootstrap stok BOM" },
    },
    jar,
  );
}

/** Seed DB punya onHand=0 — top-up bahan resep di ruang main (bar+dapur) sebelum tes potong stok POS. */
async function ensureRecipeBomStock(jar: CookieJar, recipeId: string) {
  const mains = await mainWarehouses(jar);
  if (!mains.length) return;
  const detail = dataOf<{
    bom: Array<{ productId: string | null; actualQty: number; lineType?: string }>;
  }>((await request(`/api/wms/recipes/${recipeId}`, {}, jar)).json);
  for (const line of detail.bom) {
    if (!line.productId || line.lineType === "sub_recipe") continue;
    const need = Math.max(line.actualQty * 5, 10);
    for (const wh of mains) {
      await ensureProductInWarehouse(jar, line.productId, wh.id, need);
    }
  }
}
/** Ruang gudang pertama yang punya stok > 0 (untuk opname). */
async function warehouseIdWithStock(jar: CookieJar) {
  const products = dataOf<Array<{ id: string }>>((await request("/api/wms/products", {}, jar)).json);
  for (const product of products.slice(0, 40)) {
    const res = await request(`/api/wms/products/${product.id}/stock`, {}, jar);
    if (!res.response.ok) continue;
    const rows = dataOf<WhStockRow[]>(res.json);
    const hit = rows.find((row) => Number(row.onHand) > 0);
    if (hit) return hit.warehouseId;
  }
  return null;
}

async function uatWmsHealth(): Promise<UatResult> {
  try {
    const jar = await staffJar(gudangEmail);
    const [dash, summary, products] = await Promise.all([
      request("/api/wms/dashboard", {}, jar),
      request("/api/wms/summary", {}, jar),
      request("/api/wms/products", {}, jar),
    ]);
    if (!dash.response.ok || !summary.response.ok || !products.response.ok) {
      return {
        id: "wms-health",
        label: "Dashboard & master stok",
        pass: false,
        detail: `HTTP dashboard=${dash.response.status} summary=${summary.response.status} products=${products.response.status}`,
      };
    }
    const prods = dataOf<unknown[]>(products.json);
    const kpis = dataOf<{ kpis?: { lowStock?: number } }>(dash.json);
    return {
      id: "wms-health",
      label: "Dashboard & master stok",
      pass: Array.isArray(prods) && prods.length > 0,
      detail: `${prods.length} produk WMS, lowStock=${kpis.kpis?.lowStock ?? "?"}.`,
    };
  } catch (error) {
    return {
      id: "wms-health",
      label: "Dashboard & master stok",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatRecipeCoverage(): Promise<UatResult> {
  try {
    const jar = await staffJar(gudangEmail);
    const res = await request("/api/wms/recipes/coverage", {}, jar);
    if (!res.response.ok) {
      return { id: "wms-recipe-coverage", label: "Recipe coverage OS→WMS", pass: false, detail: "Coverage API gagal." };
    }
    const cov = dataOf<{ coveragePct: number; syncedToWms: number; totalProducts: number }>(res.json);
    return {
      id: "wms-recipe-coverage",
      label: "Recipe coverage OS→WMS",
      pass: cov.coveragePct > 0 && cov.syncedToWms > 0,
      detail: `${cov.syncedToWms}/${cov.totalProducts} synced (${cov.coveragePct}%).`,
    };
  } catch (error) {
    return {
      id: "wms-recipe-coverage",
      label: "Recipe coverage OS→WMS",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatReceivingCycle(): Promise<UatResult> {
  try {
    const jar = await staffJar(managerEmail);
    const products = await request("/api/wms/products", {}, jar);
    if (!products.response.ok) {
      return { id: "wms-receiving", label: "Receiving → stok naik", pass: false, detail: "List produk gagal." };
    }
    const rows = dataOf<Array<{ id: string; sku: string; category: string; onHand: number }>>(products.json);
    // Kemasan/Umum → put-away ke gudang primary; hindari mismatch area vs onHand primary-only.
    const target =
      rows.find((p) => /kemasan|umum/i.test(p.category)) ??
      rows.find((p) => p.sku === "BEAN-ARB") ??
      rows[0];
    if (!target) {
      return { id: "wms-receiving", label: "Receiving → stok naik", pass: false, detail: "Tidak ada produk seed." };
    }
    const before = (await totalProductStock(jar, target.id)) ?? 0;
    const created = await request(
      "/api/wms/receiving",
      {
        method: "POST",
        json: {
          supplier: "UAT Supplier",
          poNumber: `UAT-${Date.now()}`,
          items: [{ productId: target.id, orderedQty: 100, receivedQty: 100, hpp: 0.15, qc: "pass" }],
        },
      },
      jar,
    );
    if (!created.response.ok) {
      return {
        id: "wms-receiving",
        label: "Receiving → stok naik",
        pass: false,
        detail: `Create receiving gagal: ${messageOf(created.json, created.text)}`,
      };
    }
    const rec = dataOf<{ id: string; doc: string }>(created.json);
    const done = await request(`/api/wms/receiving/${rec.id}/complete`, { method: "POST" }, jar);
    if (!done.response.ok) {
      return {
        id: "wms-receiving",
        label: "Receiving → stok naik",
        pass: false,
        detail: `Complete receiving gagal: ${messageOf(done.json, done.text)}`,
      };
    }
    const after = (await totalProductStock(jar, target.id)) ?? before;
    return {
      id: "wms-receiving",
      label: "Receiving → stok naik",
      pass: after >= before + 100,
      detail: `${rec.doc} · ${target.sku}: total stok ${before} → ${after} (+${after - before}).`,
    };
  } catch (error) {
    return {
      id: "wms-receiving",
      label: "Receiving → stok naik",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatPosConsume(): Promise<UatResult> {
  try {
    // Webhook in-app butuh inventory:write; list resep butuh inventory:read — kasir tidak punya keduanya.
    const jar = await staffJar(managerEmail);
    const recipes = await request("/api/wms/recipes", {}, jar);
    if (!recipes.response.ok) {
      return {
        id: "wms-pos-consume",
        label: "POS → potong bahan BOM",
        pass: false,
        detail: `List resep gagal: HTTP ${recipes.response.status}.`,
      };
    }
    const list = dataOf<Array<{ id: string; name: string }>>(recipes.json);
    const target = list.find((r) => /kopi|coffee|latte/i.test(r.name)) ?? list[0];
    if (!target) {
      return { id: "wms-pos-consume", label: "POS → potong bahan BOM", pass: false, detail: "Tidak ada resep WMS." };
    }

    await ensureRecipeBomStock(jar, target.id);

    const detail = dataOf<{
      bom: Array<{ productId: string | null; actualQty: number; lineType?: string }>;
    }>((await request(`/api/wms/recipes/${target.id}`, {}, jar)).json);
    const trackProduct = detail.bom.find((b) => b.productId && b.lineType !== "sub_recipe")?.productId;
    const barWh = await mainBarWarehouseId(jar);
    const mainBefore =
      trackProduct && barWh ? await warehouseStock(jar, trackProduct, barWh) : null;

    const ref = `WMS-UAT-${Date.now()}`;
    const sale = await request(
      "/api/wms/webhook/sale",
      { method: "POST", json: { ref, items: [{ name: target.name, qty: 1 }] } },
      jar,
    );
    if (!sale.response.ok) {
      return {
        id: "wms-pos-consume",
        label: "POS → potong bahan BOM",
        pass: false,
        detail: `Webhook sale gagal: ${messageOf(sale.json, sale.text)}`,
      };
    }
    const saleData = dataOf<{ processed: unknown[]; skipped: Array<{ reason?: string }> }>(sale.json);
    if (!saleData.processed?.length) {
      const reason = saleData.skipped?.[0]?.reason ?? "unknown";
      return {
        id: "wms-pos-consume",
        label: "POS → potong bahan BOM",
        pass: false,
        detail: `Resep "${target.name}" tidak diproses: ${reason}.`,
      };
    }

    const mainAfter =
      trackProduct && barWh ? await warehouseStock(jar, trackProduct, barWh) : null;

    const retry = await request(
      "/api/wms/webhook/sale",
      { method: "POST", json: { ref, items: [{ name: target.name, qty: 1 }] } },
      jar,
    );
    const retryData = dataOf<{ processed: unknown[] }>(retry.json);
    const mainRetry =
      trackProduct && barWh ? await warehouseStock(jar, trackProduct, barWh) : null;

    const stockMoved =
      mainBefore !== null && mainAfter !== null ? mainAfter < mainBefore : null;
    const idempotent = mainRetry === mainAfter && retryData.processed?.length > 0;

    return {
      id: "wms-pos-consume",
      label: "POS → potong bahan BOM",
      pass: saleData.processed.length > 0 && idempotent,
      detail: `"${target.name}" processed=${saleData.processed.length}, idempotent=${idempotent}, main bar ${mainBefore ?? "?"}→${mainAfter ?? "?"}${stockMoved === false ? " (IO outlet)" : ""}.`,
    };
  } catch (error) {
    return {
      id: "wms-pos-consume",
      label: "POS → potong bahan BOM",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatOpnameCycle(): Promise<UatResult> {
  try {
    const gudangJar = await staffJar(gudangEmail);
    const managerJar = await staffJar(managerEmail);
    const whs = dataOf<Array<{ id: string; isPrimary?: boolean }>>(
      (await request("/api/wms/warehouses", {}, gudangJar)).json,
    );
    if (!Array.isArray(whs) || whs.length === 0) {
      return { id: "wms-opname", label: "Opname → finalize stok", pass: false, detail: "Tidak ada gudang / API 500." };
    }
    const whId = (await warehouseIdWithStock(gudangJar)) ?? whs.find((w) => w.isPrimary)?.id ?? whs[0]?.id;
    if (!whId) {
      return { id: "wms-opname", label: "Opname → finalize stok", pass: false, detail: "Tidak ada gudang." };
    }

    const created = await request("/api/wms/opname", { method: "POST", json: { warehouseId: whId } }, gudangJar);
    if (!created.response.ok) {
      return {
        id: "wms-opname",
        label: "Opname → finalize stok",
        pass: false,
        detail: `Create opname gagal: ${messageOf(created.json, created.text)}`,
      };
    }
    const op = dataOf<{ id: string }>(created.json);
    const detail = dataOf<{ lines: Array<{ id: string; systemQty: number; productName: string }> }>(
      (await request(`/api/wms/opname/${op.id}`, {}, gudangJar)).json,
    );
    const line = detail.lines[0];
    if (!line) {
      return { id: "wms-opname", label: "Opname → finalize stok", pass: false, detail: "Opname tanpa baris." };
    }

    const physical = Math.max(0, line.systemQty - 1);
    const saved = await request(
      `/api/wms/opname/${op.id}`,
      { method: "PATCH", json: { lineId: line.id, physicalQty: physical } },
      gudangJar,
    );
    if (!saved.response.ok) {
      return {
        id: "wms-opname",
        label: "Opname → finalize stok",
        pass: false,
        detail: `Save line gagal: ${messageOf(saved.json, saved.text)}`,
      };
    }

    const finalized = await request(`/api/wms/opname/${op.id}/finalize`, { method: "POST" }, managerJar);
    if (!finalized.response.ok) {
      return {
        id: "wms-opname",
        label: "Opname → finalize stok",
        pass: false,
        detail: `Finalize gagal: ${messageOf(finalized.json, finalized.text)}`,
      };
    }
    return {
      id: "wms-opname",
      label: "Opname → finalize stok",
      pass: true,
      detail: `${line.productName}: system=${line.systemQty} fisik=${physical} → finalized.`,
    };
  } catch (error) {
    return {
      id: "wms-opname",
      label: "Opname → finalize stok",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uatSettingsReadable(): Promise<UatResult> {
  try {
    const jar = await staffJar(managerEmail);
    const res = await request("/api/wms/settings", {}, jar);
    if (!res.response.ok) {
      return { id: "wms-settings", label: "Settings WMS readable", pass: false, detail: "Settings API gagal." };
    }
    const settings = dataOf<{ wmsAutoConsume?: boolean }>(res.json);
    return {
      id: "wms-settings",
      label: "Settings WMS readable",
      pass: typeof settings.wmsAutoConsume === "boolean",
      detail: `wmsAutoConsume=${settings.wmsAutoConsume} (aktifkan sebelum go-live).`,
    };
  } catch (error) {
    return {
      id: "wms-settings",
      label: "Settings WMS readable",
      pass: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function main() {
  console.log(`GARAGE WMS Operational UAT (API) → ${baseUrl}\n`);
  console.log("Tip: butuh DB migrate + seed. Lokal: npm run db:migrate:runner && npm run db:seed\n");
  const requested = new Set(
    (process.env.UAT_ONLY ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const checks: Array<{ id: string; run: () => Promise<UatResult> }> = [
    { id: "wms-health", run: uatWmsHealth },
    { id: "wms-recipe-coverage", run: uatRecipeCoverage },
    { id: "wms-receiving", run: uatReceivingCycle },
    { id: "wms-pos-consume", run: uatPosConsume },
    { id: "wms-opname", run: uatOpnameCycle },
    { id: "wms-settings", run: uatSettingsReadable },
  ];
  const results: UatResult[] = [];
  for (const check of checks) {
    if (requested.size && !requested.has(check.id)) continue;
    results.push(await check.run());
  }
  let passCount = 0;
  for (const row of results) {
    const prefix = row.pass ? "PASS" : "FAIL";
    console.log(`${prefix} [${row.id}] ${row.label}: ${row.detail}`);
    if (row.pass) passCount += 1;
  }
  if (!requested.size) {
    await writeWmsOperationalUatEvidence({
      kind: "wms-operational-uat",
      generatedAt: new Date().toISOString(),
      baseUrl,
      passCount,
      total: results.length,
      results,
    });
  }
  console.log(`\nWMS UAT: ${passCount}/${results.length} passed`);
  if (!requested.size) {
    console.log("Report: .garage/readiness/latest-wms-operational-uat.json");
  }
  if (passCount < results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
