// =============================================================================
// QA — Uji beban "jam sibuk" + stress ke server GLADI (port 3002, DB salinan).
//
// Mensimulasikan perangkat nyata di LAN outlet:
//   - N kasir   : buat order POS tiap ±6 dtk
//   - Bar/Dapur : polling papan produksi tiap 4 dtk (seperti layar produksi)
//   - Waiter    : polling meja + tiket tiap 6 dtk (seperti HP waiter)
//   - Pelanggan : order QR sekali, lalu polling status tiap 8 dtk (halaman /order)
//   - Owner     : dashboard tiap 30 dtk
// Tiap perangkat punya IP sendiri (seperti HP di Wi-Fi outlet); --same-ip untuk
// kasus terburuk semua perangkat terlihat sebagai satu IP.
//
// Pakai (server gladi harus jalan):
//   npx tsx src/scripts/qa-load.ts --duration 180 --customers 30 --cashiers 3
// Hasil: ringkasan per endpoint (jumlah, status, p50/p95/max) → .tmp/qa-load.json
// Keluar kode 1 bila ada 5xx, 429 pada trafik sah, atau p95 > 1000 ms.
// =============================================================================
import fs from "node:fs";
import path from "node:path";

function arg(name: string, fallback: number) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
}
const DURATION_S = arg("duration", 180);
const CUSTOMERS = arg("customers", 30);
const CASHIERS = arg("cashiers", 3);
const WAITERS = arg("waiters", 4);
// --same-ip: semua perangkat terlihat satu IP (kasus terburuk / tanpa IP klien).
const SAME_IP = process.argv.includes("--same-ip");
const BASE = (process.env.GLADI_BASE_URL ?? "http://127.0.0.1:3002").replace(/\/+$/, "");
const ORIGIN = "http://localhost:3002";

type AccountFile = { accounts: Record<string, { email: string; password: string }> };
const accountFile = JSON.parse(fs.readFileSync(path.join(".tmp", "gladi-accounts.json"), "utf8")) as AccountFile;

type Sample = { endpoint: string; status: number; ms: number };
const samples: Sample[] = [];
const errorsSeen = new Map<string, string>();

let deviceSeq = 0;
class Device {
  private cookies = new Map<string, string>();
  readonly ip = `10.30.${Math.floor(++deviceSeq / 250)}.${deviceSeq % 250}`;
  constructor(readonly label: string) {}

  async call(method: string, route: string, endpoint: string, body?: unknown, opts: { forwardIp?: boolean } = {}) {
    const headers = new Headers({ Origin: ORIGIN, Referer: `${ORIGIN}/os` });
    // Next.js mengisi X-Forwarded-For dari IP soket bila klien tidak mengirimnya;
    // semua klien uji berasal dari 127.0.0.1, jadi IP perangkat disimulasikan di sini.
    if (opts.forwardIp ?? !SAME_IP) headers.set("X-Forwarded-For", this.ip);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (this.cookies.size) headers.set("Cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const started = performance.now();
    let status = 0;
    let json: { data?: unknown; error?: { code?: string; message?: string } } = {};
    try {
      const res = await fetch(`${BASE}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      status = res.status;
      const raw = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      for (const cookie of raw) {
        const pair = cookie.split(";")[0];
        const i = pair.indexOf("=");
        if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      const text = await res.text();
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      if (status >= 400 && !errorsSeen.has(`${endpoint}:${status}`)) {
        errorsSeen.set(`${endpoint}:${status}`, json.error?.message ?? text.slice(0, 160));
      }
    } catch (error) {
      errorsSeen.set(`${endpoint}:timeout`, error instanceof Error ? error.message : String(error));
    }
    samples.push({ endpoint, status, ms: performance.now() - started });
    return { status, data: json.data as never, error: json.error };
  }

  async login(email: string, password: string) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await this.call("POST", "/api/auth/sign-in/email", "login", { email, password }, { forwardIp: true });
      if (res.status === 200) return;
      await sleep(12_000);
    }
    throw new Error(`login ${email} gagal`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);
const deadline = () => Date.now() + DURATION_S * 1000;

type MenuItem = { id: string; name: string; variants: Array<{ id: string }> };

async function main() {
  const probe = new Device("probe");
  const menuRes = await probe.call("GET", "/api/customer/menu", "GET customer/menu");
  const menu = ((menuRes.data as MenuItem[]) ?? []).filter((m) => m.variants?.length);
  if (!menu.length) throw new Error("menu kosong / server gladi tidak jalan");
  const pick = () => {
    const m = menu[Math.floor(Math.random() * menu.length)];
    return { itemId: m.id, variantId: m.variants[0].id, qty: 1 + Math.floor(Math.random() * 2) };
  };

  // Login perangkat staf (akun gladi dipakai di beberapa perangkat sekaligus).
  const acc = accountFile.accounts;
  const cashiers = Array.from({ length: CASHIERS }, (_, i) => new Device(`kasir-${i + 1}`));
  const production = [new Device("bar"), new Device("dapur")];
  const waiters = Array.from({ length: WAITERS }, (_, i) => new Device(`waiter-${i + 1}`));
  const owner = new Device("owner");
  console.log("Login perangkat staf…");
  for (const d of cashiers) await d.login(acc.kasir.email, acc.kasir.password);
  await production[0].login(acc.bar.email, acc.bar.password);
  await production[1].login(acc.dapur.email, acc.dapur.password);
  for (const [i, d] of waiters.entries()) {
    const a = i % 2 === 0 ? acc.waiter1 : acc.waiter2;
    await d.login(a.email, a.password);
  }
  await owner.login((acc.owner ?? acc.manajer).email, (acc.owner ?? acc.manajer).password);
  const shift = await cashiers[0].call("POST", "/api/finance/cash-sessions", "POST cash-sessions", { openingCash: 500_000 });
  if (shift.status !== 201 && shift.error?.code !== "CASH_SESSION_ALREADY_OPEN") {
    throw new Error(`buka shift gagal: ${shift.status} ${shift.error?.message}`);
  }
  samples.length = 0; // fase login tidak dihitung ke statistik beban

  console.log(`Beban ${DURATION_S} dtk: ${CASHIERS} kasir, 2 produksi, ${WAITERS} waiter, ${CUSTOMERS} pelanggan QR, 1 owner`);
  const end = deadline();
  const loops: Array<Promise<void>> = [];

  for (const d of cashiers) {
    loops.push((async () => {
      while (Date.now() < end) {
        const table = String(1 + Math.floor(Math.random() * 30));
        await d.call("POST", "/api/orders", "POST orders (kasir)", {
          orderType: Math.random() < 0.7 ? "dine-in" : "takeaway",
          tableNumber: table,
          guestName: `LOAD-${d.label}`,
          paymentMethod: "Cash",
          cashReceived: 2_000_000,
          items: [pick(), pick()],
        });
        await sleep(jitter(6000));
      }
    })());
  }
  for (const d of production) {
    loops.push((async () => {
      while (Date.now() < end) {
        await d.call("GET", "/api/production", "GET production");
        await sleep(jitter(4000));
      }
    })());
  }
  for (const d of waiters) {
    loops.push((async () => {
      while (Date.now() < end) {
        await d.call("GET", "/api/waiter/tables", "GET waiter/tables");
        await d.call("GET", "/api/waiter/tickets", "GET waiter/tickets");
        await sleep(jitter(6000));
      }
    })());
  }
  loops.push((async () => {
    while (Date.now() < end) {
      await owner.call("GET", "/api/dashboard", "GET dashboard");
      await sleep(jitter(30_000));
    }
  })());
  for (let i = 0; i < CUSTOMERS; i += 1) {
    const phone = new Device(`pelanggan-${i + 1}`);
    loops.push((async () => {
      await sleep(Math.random() * Math.min(60_000, DURATION_S * 500)); // datang bergelombang
      await phone.call("GET", "/api/customer/menu", "GET customer/menu");
      const created = await phone.call("POST", "/api/customer/orders", "POST customer/orders", {
        orderType: "dine-in",
        tableLabel: `Meja ${31 + (i % 20)}`,
        customerMode: "guest",
        guestName: `TAMU-${i + 1}`,
        source: "qr_table",
        items: [pick()],
      });
      const orderId = (created.data as { order?: { id: string } } | undefined)?.order?.id;
      while (Date.now() < end && orderId) {
        await sleep(jitter(8000));
        await phone.call("GET", `/api/customer/orders/${orderId}/public-status`, "GET customer order public-status");
      }
    })());
  }
  await Promise.all(loops);

  // ------------------------------------------------------------ ringkasan
  const byEndpoint = new Map<string, Sample[]>();
  for (const s of samples) byEndpoint.set(s.endpoint, [...(byEndpoint.get(s.endpoint) ?? []), s]);
  const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
  const rows = [...byEndpoint].map(([endpoint, list]) => {
    const ms = list.map((s) => s.ms).sort((a, b) => a - b);
    const statuses: Record<string, number> = {};
    for (const s of list) statuses[s.status] = (statuses[s.status] ?? 0) + 1;
    return {
      endpoint,
      count: list.length,
      statuses,
      p50: Math.round(pct(ms, 50)),
      p95: Math.round(pct(ms, 95)),
      max: Math.round(ms.at(-1) ?? 0),
      e5xx: list.filter((s) => s.status >= 500 || s.status === 0).length,
      e429: list.filter((s) => s.status === 429).length,
    };
  });
  console.table(rows.map((r) => ({ ...r, statuses: JSON.stringify(r.statuses) })));
  const total = samples.length;
  const rps = total / DURATION_S;
  const fail5xx = rows.reduce((n, r) => n + r.e5xx, 0);
  const fail429 = rows.reduce((n, r) => n + r.e429, 0);
  const slow = rows.filter((r) => r.p95 > 1000);
  console.log(`\nTotal request: ${total} (${rps.toFixed(1)} req/dtk) · 5xx/timeout: ${fail5xx} · 429: ${fail429} · p95>1dtk: ${slow.map((r) => r.endpoint).join(", ") || "-"}`);
  if (errorsSeen.size) {
    console.log("Contoh error:");
    for (const [k, v] of errorsSeen) console.log(`  ${k} → ${v}`);
  }
  fs.writeFileSync(".tmp/qa-load.json", JSON.stringify({ config: { DURATION_S, CUSTOMERS, CASHIERS, WAITERS }, rows, errors: [...errorsSeen] }, null, 2));
  process.exit(fail5xx || fail429 || slow.length ? 1 : 0);
}

main().catch((error) => {
  console.error("GAGAL:", error instanceof Error ? error.message : error);
  process.exit(2);
});
