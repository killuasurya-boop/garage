// =============================================================================
// QA — UAT per peran (Owner / Manajer / Kasir / Bar / Dapur / Helper / Waiter)
// terhadap server GLADI (port 3002, DB salinan). Melengkapi gladi-scenario.ts
// (alur transaksi) dengan MATRIKS AKSES: tiap peran membuka layar/laporan yang
// menjadi tugasnya (harus 200) dan mencoba aksi di luar wewenangnya (harus
// 401/403). Hasil PASS/FAIL per baris → .tmp/qa-uat.json
//
// Pakai: npx tsx src/scripts/qa-uat.ts
// =============================================================================
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.GLADI_BASE_URL ?? "http://127.0.0.1:3002").replace(/\/+$/, "");
const ORIGIN = "http://localhost:3002";
const accounts = (
  JSON.parse(fs.readFileSync(path.join(".tmp", "gladi-accounts.json"), "utf8")) as {
    accounts: Record<string, { email: string; password: string }>;
  }
).accounts;

let seq = 0;
class Actor {
  private cookie = "";
  private readonly ip = `10.40.0.${++seq}`;
  constructor(readonly role: string, private readonly key: string) {}
  async api(method: string, route: string, body?: unknown) {
    const res = await fetch(`${BASE}${route}`, {
      method,
      headers: {
        Origin: ORIGIN,
        "X-Forwarded-For": this.ip,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    if (set.length) this.cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json: { data?: unknown; error?: { code?: string; message?: string } } = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { status: res.status, data: json.data as never, error: json.error };
  }
  async login() {
    const account = accounts[this.key];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await this.api("POST", "/api/auth/sign-in/email", { email: account.email, password: account.password });
      if (res.status === 200) return;
      await new Promise((r) => setTimeout(r, 12_000));
    }
    throw new Error(`login ${this.role} gagal`);
  }
}

type Row = { role: string; task: string; expect: string; status: number; ok: boolean };
const rows: Row[] = [];
async function allow(actor: Actor, task: string, method: string, route: string, body?: unknown) {
  const res = await actor.api(method, route, body);
  const ok = res.status >= 200 && res.status < 300;
  rows.push({ role: actor.role, task, expect: "boleh (2xx)", status: res.status, ok });
  return res;
}
async function deny(actor: Actor, task: string, method: string, route: string, body?: unknown) {
  const res = await actor.api(method, route, body);
  const ok = res.status === 401 || res.status === 403;
  rows.push({ role: actor.role, task, expect: "ditolak (401/403)", status: res.status, ok });
  return res;
}

async function main() {
  const owner = new Actor("Owner", "owner");
  const manajer = new Actor("Manajer", "manajer");
  const kasir = new Actor("Kasir", "kasir");
  const bar = new Actor("Bar", "bar");
  const dapur = new Actor("Dapur", "dapur");
  const helper = new Actor("Helper", "helperBar");
  const waiter = new Actor("Waiter", "waiter1");
  for (const a of [owner, manajer, kasir, bar, dapur, helper, waiter]) await a.login();

  // Order uji untuk aksi negatif (void oleh waiter, dsb).
  const menu = (await kasir.api("GET", "/api/customer/menu")).data as Array<{ id: string; variants: Array<{ id: string }> }>;
  const shift = await kasir.api("POST", "/api/finance/cash-sessions", { openingCash: 500_000 });
  if (shift.status !== 201 && shift.error?.code !== "CASH_SESSION_ALREADY_OPEN") throw new Error(`shift: ${shift.status}`);
  const order = await kasir.api("POST", "/api/orders", {
    orderType: "dine-in",
    tableNumber: "12",
    guestName: "UAT",
    paymentMethod: "Cash",
    cashReceived: 500_000,
    items: [{ itemId: menu[0].id, variantId: menu[0].variants[0].id, qty: 1 }],
  });
  const orderId = (order.data as { orderId?: string } | undefined)?.orderId ?? "00000000-0000-4000-8000-000000000000";

  // ---------------- Owner: laporan & pengaturan sistem
  await allow(owner, "Dashboard", "GET", "/api/dashboard");
  await allow(owner, "Laba rugi", "GET", "/api/finance/profit-loss");
  await allow(owner, "Arus kas", "GET", "/api/finance/cashflow");
  await allow(owner, "Ringkasan keuangan", "GET", "/api/finance/summary");
  await allow(owner, "Manajemen user", "GET", "/api/admin/users");
  await allow(owner, "Kesehatan sistem", "GET", "/api/admin/health");
  await allow(owner, "Pengaturan", "GET", "/api/settings");
  await allow(owner, "Audit log", "GET", "/api/audit");
  await allow(owner, "Persetujuan", "GET", "/api/approvals");
  await allow(owner, "Info purge (Owner saja)", "GET", "/api/admin/purge");

  // ---------------- Manajer: operasional + keuangan, bukan setting inti
  await allow(manajer, "Dashboard", "GET", "/api/dashboard");
  await allow(manajer, "Persetujuan", "GET", "/api/approvals");
  await allow(manajer, "Laba rugi", "GET", "/api/finance/profit-loss");
  await allow(manajer, "Stok / inventory", "GET", "/api/inventory");
  await allow(manajer, "Gudang (WMS) produk", "GET", "/api/wms/products");
  await allow(manajer, "CRM pelanggan", "GET", "/api/crm/customers");
  await allow(manajer, "Audit log", "GET", "/api/audit");
  await deny(manajer, "Purge database (Owner saja)", "POST", "/api/admin/purge", { dryRun: true, targets: ["chat"] });
  await deny(manajer, "Info purge (Owner saja)", "GET", "/api/admin/purge");

  // ---------------- Kasir: POS, shift, stok; tanpa laporan keuangan/admin
  await allow(kasir, "Daftar order", "GET", "/api/orders");
  await allow(kasir, "Monitor meja", "GET", "/api/tables/live");
  await allow(kasir, "Stok / inventory", "GET", "/api/inventory");
  await deny(kasir, "Laba rugi", "GET", "/api/finance/profit-loss");
  await deny(kasir, "Manajemen user", "GET", "/api/admin/users");
  await deny(kasir, "Audit log", "GET", "/api/audit");
  await deny(kasir, "Void langsung tanpa PIN Manajer", "POST", `/api/orders/${orderId}/void`, { reason: "uji UAT" });

  // ---------------- Bar / Dapur / Helper: papan produksi
  await allow(bar, "Papan produksi Bar", "GET", "/api/production");
  await allow(dapur, "Papan produksi Dapur", "GET", "/api/production");
  await allow(helper, "Papan produksi Helper", "GET", "/api/production");
  await deny(bar, "Laba rugi", "GET", "/api/finance/profit-loss");
  await deny(helper, "Manajemen user", "GET", "/api/admin/users");

  // ---------------- Waiter: meja & antar; tanpa kas/keuangan/produksi
  await allow(waiter, "Denah meja", "GET", "/api/waiter/tables");
  await allow(waiter, "Tiket antar", "GET", "/api/waiter/tickets");
  await deny(waiter, "Papan produksi (bukan workstation)", "GET", "/api/production");
  await deny(waiter, "Laba rugi", "GET", "/api/finance/profit-loss");
  await deny(waiter, "Buka shift kas", "POST", "/api/finance/cash-sessions", { openingCash: 1 });
  await deny(waiter, "Void order", "POST", `/api/orders/${orderId}/void`, { reason: "uji UAT" });
  await deny(waiter, "Ubah pengaturan", "PATCH", "/api/settings", { category: "production", values: {} });
  await deny(waiter, "Manajemen user", "GET", "/api/admin/users");

  // ---------------- Anonim
  const anon = new Actor("Anonim", "none");
  await deny(anon, "Dashboard tanpa login", "GET", "/api/dashboard");
  await deny(anon, "Daftar order tanpa login", "GET", "/api/orders");

  console.table(rows.map((r) => ({ ...r, ok: r.ok ? "PASS" : "FAIL" })));
  const failed = rows.filter((r) => !r.ok);
  const byRole = new Map<string, { pass: number; fail: number }>();
  for (const r of rows) {
    const v = byRole.get(r.role) ?? { pass: 0, fail: 0 };
    if (r.ok) v.pass += 1;
    else v.fail += 1;
    byRole.set(r.role, v);
  }
  console.log("\nRingkasan per peran:");
  for (const [role, v] of byRole) console.log(`  ${role.padEnd(8)} PASS=${v.pass} FAIL=${v.fail}`);
  console.log(`\nTOTAL: ${rows.length} cek, PASS=${rows.length - failed.length}, FAIL=${failed.length}`);
  fs.writeFileSync(".tmp/qa-uat.json", JSON.stringify(rows, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("GAGAL:", error instanceof Error ? error.message : error);
  process.exit(2);
});
