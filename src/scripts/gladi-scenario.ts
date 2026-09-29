// =============================================================================
// GLADI RESIK — satu shift simulasi lewat HTTP ke server gladi (port 3002).
// Tiap aktor (kasir, bar, dapur, helper, waiter, manajer) punya sesi sendiri.
// Hasil PASS/FAIL per skenario; skenario gagal tidak menghentikan yang lain.
//
// Pakai:
//   npx tsx src/scripts/gladi-setup.ts        (salinan DB + akun uji)
//   node scripts/gladi-server.mjs             (server gladi, terminal lain)
//   npx tsx src/scripts/gladi-scenario.ts
// =============================================================================
import fs from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;
type AccountFile = {
  baseUrl: string;
  managerPin: string;
  accounts: Record<string, { email: string; password: string; name: string; userId: string }>;
};

const accountFile = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), ".tmp", "gladi-accounts.json"), "utf8"),
) as AccountFile;
const BASE = (process.env.GLADI_BASE_URL ?? "http://127.0.0.1:3002").replace(/\/+$/, "");
const ORIGIN = "http://localhost:3002";
const STAMP = Date.now().toString().slice(-5);

let actorSeq = 0;
class Actor {
  private cookies = new Map<string, string>();
  // Tiap peran = perangkat berbeda di outlet (IP berbeda) — sekaligus supaya
  // pembatas login per-IP Better Auth tidak menganggap semua aktor satu mesin.
  private readonly deviceIp = `10.20.0.${++actorSeq}`;
  constructor(
    readonly key: string,
    readonly email: string,
    private readonly password: string,
  ) {}

  private store(headers: Headers) {
    const raw = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const pair = cookie.split(";")[0];
      const i = pair.indexOf("=");
      if (i <= 0) continue;
      const name = pair.slice(0, i).trim();
      if (/max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, pair.slice(i + 1).trim());
    }
  }

  async api(method: string, route: string, body?: unknown) {
    const headers = new Headers({
      Origin: ORIGIN,
      Referer: `${ORIGIN}/os`,
      "X-Forwarded-For": this.deviceIp,
    });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (this.cookies.size) {
      headers.set("Cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const res = await fetch(`${BASE}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.store(res.headers);
    const text = await res.text();
    let json: Json = {};
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: res.status, json, data: json.data as never, error: json.error as { code?: string; message?: string } | undefined };
  }

  // Better Auth membatasi ±3 login / 10 detik per IP (proteksi brute-force) —
  // tunggu & coba ulang saat 429.
  async login() {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await this.api("POST", "/api/auth/sign-in/email", {
        email: this.email,
        password: this.password,
      });
      if (res.status === 200) return;
      if (res.status !== 429) throw new Error(`login ${this.email} gagal: ${res.status}`);
      await new Promise((resolve) => setTimeout(resolve, 12_000));
    }
    throw new Error(`login ${this.email} tetap dibatasi (429)`);
  }
}

const anon = new Actor("anon", "", "");
const actors = Object.fromEntries(
  Object.entries(accountFile.accounts).map(([key, a]) => [key, new Actor(key, a.email, a.password)]),
) as Record<string, Actor>;
const { kasir, bar, dapur, helperBar, helperDapur, waiter1, waiter2, manajer } = actors;

// ---------------------------------------------------------------------------
// Pencatatan hasil
// ---------------------------------------------------------------------------
const results: Array<{ id: string; title: string; ok: boolean; detail: string }> = [];
class Fail extends Error {}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Fail(message);
}
async function scenario(id: string, title: string, fn: () => Promise<string | void>) {
  try {
    const detail = (await fn()) ?? "";
    results.push({ id, title, ok: true, detail });
    console.log(`PASS  ${id} ${title}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ id, title, ok: false, detail });
    console.log(`FAIL  ${id} ${title} — ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Helper domain
// ---------------------------------------------------------------------------
type MenuItem = { id: string; name: string; variants: Array<{ id: string; label: string; price: number }> };
let menu: MenuItem[] = [];
function item(namePrefix: string, variantLabel?: string) {
  const found = menu.find((m) => m.name.toLowerCase().startsWith(namePrefix.toLowerCase()));
  if (!found) throw new Fail(`menu "${namePrefix}" tidak ada`);
  const variant = variantLabel
    ? found.variants.find((v) => v.label.toLowerCase() === variantLabel.toLowerCase())
    : found.variants[0];
  if (!variant) throw new Fail(`varian "${variantLabel}" untuk ${found.name} tidak ada`);
  return { itemId: found.id, variantId: variant.id, price: variant.price, name: found.name, label: variant.label };
}

type BoardTicket = {
  ticketNo: string;
  orderNo: string | null;
  orderId: string | null;
  identity: string;
  station: "Bar" | "Food";
  status: string;
  handoverAt: string | null;
  claimedByName: string | null;
  items: Array<{ id: string; label: string; qty: number; status: string; batchNo: string | null }>;
};
async function board(actor: Actor) {
  const res = await actor.api("GET", "/api/production");
  expect(res.status === 200, `GET /api/production ${res.status} (${actor.key})`);
  return res.data as {
    tickets: BoardTicket[];
    suggestions: Array<{ key: string; itemLabel: string; totalQty: number; items: Array<{ id: string; orderNo: string | null; identity: string }> }>;
    batches: Array<{ id: string; batchNo: string; allocations: Array<{ id: string; identity: string; qty: number }> }>;
  };
}
async function ticketOf(orderNo: string, station: "Bar" | "Food", actor = station === "Bar" ? bar : dapur) {
  const b = await board(actor);
  return b.tickets.find((t) => t.orderNo === orderNo && t.station === station);
}
async function ticketAction(actor: Actor, ticketNo: string, body: Json) {
  return actor.api("POST", `/api/production/tickets/${encodeURIComponent(ticketNo)}`, body);
}
async function produceReady(orderNo: string, station: "Bar" | "Food") {
  const producer = station === "Bar" ? bar : dapur;
  const t = await ticketOf(orderNo, station, producer);
  expect(t, `tiket ${station} untuk ${orderNo} tidak ada di papan`);
  if (t.status === "queue") {
    const s = await ticketAction(producer, t.ticketNo, { action: "start" });
    expect(s.status === 200, `MULAI ${t.ticketNo} gagal: ${s.status} ${s.error?.message ?? ""}`);
  }
  const r = await ticketAction(producer, t.ticketNo, { action: "ready", qcConfirmed: true });
  expect(r.status === 200, `READY ${t.ticketNo} gagal: ${r.status} ${r.error?.message ?? ""}`);
  return t.ticketNo;
}
// Produksi (bila perlu) → helper panggil siapa saja → waiter1 antar.
async function deliverStation(orderNo: string, station: "Bar" | "Food") {
  const helper = station === "Bar" ? helperBar : helperDapur;
  let t = await ticketOf(orderNo, station, helper);
  if (!t) return; // sudah diantar
  if (t.status !== "ready") {
    await produceReady(orderNo, station);
    t = await ticketOf(orderNo, station, helper);
    expect(t, `tiket ${orderNo} hilang`);
  }
  if (!t.handoverAt) {
    const h = await ticketAction(helper, t.ticketNo, { action: "handover", waiterUserId: null });
    expect(h.status === 200, `ACC ${t.ticketNo}: ${h.status} ${h.error?.message ?? ""}`);
  }
  const d = await waiter1.api("POST", `/api/waiter/tickets/${t.ticketNo}/deliver`);
  expect(d.status === 200, `antar ${t.ticketNo}: ${d.status} ${d.error?.message ?? ""}`);
}

async function posOrder(table: string, name: string, lines: Array<{ itemId: string; variantId: string; qty: number; note?: string }>) {
  const res = await kasir.api("POST", "/api/orders", {
    orderType: "dine-in",
    tableNumber: table,
    guestName: name,
    paymentMethod: "Cash",
    cashReceived: 2_000_000,
    items: lines,
  });
  expect(res.status === 200 || res.status === 201, `POS order gagal: ${res.status} ${res.error?.message ?? ""}`);
  return res.data as { orderId: string; orderNo: string; subtotal: number; total: number };
}
async function qrOrder(table: string, name: string, lines: Array<{ itemId: string; variantId: string; qty: number; note?: string }>) {
  const res = await anon.api("POST", "/api/customer/orders", {
    orderType: "dine-in",
    tableLabel: `Meja ${table}`,
    customerMode: "guest",
    guestName: name,
    source: "qr_table",
    items: lines,
  });
  expect(res.status === 201, `order QR gagal: ${res.status} ${res.error?.message ?? ""}`);
  return (res.data as { order: { id: string; orderNo: string; status: string } }).order;
}
async function accept(orderId: string) {
  const res = await kasir.api("PATCH", `/api/customer/orders/${orderId}/status`, { action: "accept" });
  expect(res.status === 200, `accept gagal: ${res.status} ${res.error?.message ?? ""}`);
}
async function pay(orderId: string) {
  const res = await kasir.api("PATCH", `/api/customer/orders/${orderId}/status`, {
    action: "paid",
    paymentMethod: "Cash",
    cashReceived: 2_000_000,
  });
  expect(res.status === 200, `bayar gagal: ${res.status} ${res.error?.message ?? ""}`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`GLADI RESIK → ${BASE} (${STAMP})`);
  const menuRes = await anon.api("GET", "/api/customer/menu");
  menu = (menuRes.data as MenuItem[]) ?? [];

  if (process.argv.includes("--stage")) {
    await stageForVisualCheck();
    return;
  }

  await scenario("S0", "Login semua peran + buka shift kasir", async () => {
    for (const actor of Object.values(actors)) await actor.login();
    const shift = await kasir.api("POST", "/api/finance/cash-sessions", { openingCash: 500_000 });
    expect(
      shift.status === 201 || shift.error?.code === "CASH_SESSION_ALREADY_OPEN",
      `buka shift: ${shift.status} ${shift.error?.message ?? ""}`,
    );
    return `${Object.keys(actors).length} akun login, menu ${menu.length} item`;
  });

  const coffeeCold = () => item("Coffee Latte", "Cold");
  const coffeeHot = () => item("Coffee Latte", "Hot");
  // Menu Sep 2026: "Nasi Goreng" satu varian (dulu "Nasi Goreng Telur" Sedang/Pedas).
  const nasiPedas = () => item("Nasi Goreng");
  const indomie = () => item("Indomie Goreng");

  let s1OrderNo = "";
  await scenario("S1", "POS dine-in: varian harga + tiket BAR & DAPUR ber-identitas", async () => {
    const lines = [coffeeCold(), coffeeHot(), nasiPedas()];
    const order = await posOrder("21", `BUDI${STAMP}`, lines.map((l) => ({ itemId: l.itemId, variantId: l.variantId, qty: 1 })));
    s1OrderNo = order.orderNo;
    const expected = lines.reduce((sum, l) => sum + l.price, 0);
    expect(order.subtotal === expected, `subtotal ${order.subtotal} ≠ harga varian ${expected}`);
    const barT = await ticketOf(order.orderNo, "Bar");
    const foodT = await ticketOf(order.orderNo, "Food");
    expect(barT && foodT, "tiket BAR/DAPUR tidak lengkap");
    expect(barT.identity === `BUDI${STAMP}`, `identitas tiket "${barT.identity}"`);
    expect(barT.items.length === 2 && foodT.items.length === 1, "pembagian item per station salah");
    return `${order.orderNo} subtotal ${expected}`;
  });

  await scenario("S2", "QR order baru masuk produksi SETELAH kasir accept", async () => {
    const order = await qrOrder("22", `CITRA${STAMP}`, [{ ...pick(nasiPedas()), qty: 1 }]);
    expect(order.status === "pending_cashier", `status awal ${order.status}`);
    expect(!(await ticketOf(order.orderNo, "Food")), "tiket muncul sebelum verifikasi kasir");
    await accept(order.id);
    expect(await ticketOf(order.orderNo, "Food"), "tiket tidak muncul setelah accept");
    return order.orderNo;
  });

  await scenario("S3", "Waiter tidak bisa memvalidasi order (hanya kasir)", async () => {
    const order = await qrOrder("23", `DODI${STAMP}`, [{ ...pick(coffeeHot()), qty: 1 }]);
    const res = await waiter1.api("PATCH", `/api/customer/orders/${order.id}/status`, { action: "accept" });
    expect(res.status === 403, `waiter accept seharusnya 403, dapat ${res.status}`);
    await accept(order.id);
  });

  const t10: Array<{ id: string; orderNo: string }> = [];
  await scenario("S4", "2 tamu di Meja 10: identitas & tiket terpisah", async () => {
    const a = await qrOrder("10", `RIZI${STAMP}`, [{ ...pick(coffeeCold()), qty: 1 }]);
    const b = await qrOrder("10", `SINTA${STAMP}`, [{ ...pick(coffeeCold()), qty: 1 }]);
    await accept(a.id);
    await accept(b.id);
    t10.push(a, b);
    const ta = await ticketOf(a.orderNo, "Bar");
    const tb = await ticketOf(b.orderNo, "Bar");
    expect(ta && tb && ta.ticketNo !== tb.ticketNo, "tiket tidak terpisah per order");
    expect(ta.identity === `RIZI${STAMP}` && tb.identity === `SINTA${STAMP}`, "identitas tertukar");
  });

  const batchOrders: Array<{ id: string; orderNo: string }> = [];
  await scenario("S5", "Smart Batch Indomie ×4 dari 3 meja + allocation 100%", async () => {
    const ind = indomie();
    const specs = [
      ["11", `EKA${STAMP}`, 1],
      ["12", `FIRA${STAMP}`, 1],
      ["15", `GALIH${STAMP}`, 2],
    ] as const;
    for (const [table, name, qty] of specs) {
      const o = await qrOrder(table, name, [{ itemId: ind.itemId, variantId: ind.variantId, qty }]);
      await accept(o.id);
      batchOrders.push(o);
    }
    const nos = batchOrders.map((o) => o.orderNo);
    const b = await board(dapur);
    const suggestion = b.suggestions.find((s) => s.items.some((i) => nos.includes(i.orderNo ?? "")));
    expect(suggestion, "tidak ada saran batch");
    const ids = suggestion.items.filter((i) => nos.includes(i.orderNo ?? "")).map((i) => i.id);
    expect(ids.length === 3, `saran batch berisi ${ids.length} porsi order gladi (harus 3)`);
    const start = await dapur.api("POST", "/api/production/batches", { ticketItemIds: ids });
    expect(start.status === 200, `mulai batch: ${start.status} ${start.error?.message ?? ""}`);
    const batchId = (start.data as { id: string }).id;
    const running = (await board(dapur)).batches.find((x) => x.id === batchId);
    expect(running, "batch tidak tampil di papan");
    const partial = running.allocations.filter((a) => a.qty === 1).map((a) => a.id);
    const bad = await dapur.api("POST", `/api/production/batches/${batchId}`, { action: "complete", allocationIds: partial });
    expect(bad.error?.code === "UNALLOCATED", `complete sebagian harus UNALLOCATED, dapat ${bad.status} ${bad.error?.code}`);
    const done = await dapur.api("POST", `/api/production/batches/${batchId}`, {
      action: "complete",
      allocationIds: running.allocations.map((a) => a.id),
    });
    expect(done.status === 200, `complete: ${done.status} ${done.error?.message ?? ""}`);
    for (const no of nos) {
      const t = await ticketOf(no, "Food");
      expect(t?.status === "ready", `tiket ${no} status ${t?.status}`);
    }
    return `batch ${(running as { batchNo: string }).batchNo}`;
  });

  await scenario("S6", "Catatan produksi beda tidak digabung dalam satu batch", async () => {
    const ind = indomie();
    const a = await qrOrder("16", `HANA${STAMP}`, [{ itemId: ind.itemId, variantId: ind.variantId, qty: 1, note: "pedas" }]);
    const b = await qrOrder("17", `IRFAN${STAMP}`, [{ itemId: ind.itemId, variantId: ind.variantId, qty: 1, note: "telur setengah matang" }]);
    await accept(a.id);
    await accept(b.id);
    const sug = (await board(dapur)).suggestions.find((s) => {
      const orders = s.items.map((i) => i.orderNo);
      return orders.includes(a.orderNo) && orders.includes(b.orderNo);
    });
    expect(!sug, "porsi dengan catatan beda digabung satu batch");
    // bersihkan antrean dapur untuk skenario berikut
    await produceReady(a.orderNo, "Food");
    await produceReady(b.orderNo, "Food");
  });

  let s7 = { id: "", orderNo: "" };
  await scenario("S7", "Bar READY duluan, Dapur masih proses → waiter lihat order belum lengkap", async () => {
    const o = await qrOrder("24", `JOKO${STAMP}`, [
      { ...pick(coffeeHot()), qty: 1 },
      { ...pick(nasiPedas()), qty: 1 },
    ]);
    await accept(o.id);
    s7 = o;
    await produceReady(o.orderNo, "Bar");
    const w = await waiter1.api("GET", "/api/waiter/tickets");
    const mine = (w.data as Array<{ orderNo: string; station: string; status: string }>).filter((t) => t.orderNo === o.orderNo);
    expect(mine.some((t) => t.station === "Bar" && t.status === "ready"), "tiket Bar ready tidak terlihat waiter");
    expect(mine.some((t) => t.station !== "Bar" && t.status !== "ready"), "tiket Dapur yang belum siap tidak terlihat waiter");
  });

  await scenario("S8", "Helper ACC & panggil waiter tertentu / siapa saja → antar", async () => {
    const barT = await ticketOf(s7.orderNo, "Bar", helperBar);
    expect(barT?.status === "ready", "tiket bar S7 tidak ready");
    const early = await waiter1.api("POST", `/api/waiter/tickets/${barT.ticketNo}/deliver`);
    expect(early.error?.code === "HANDOVER_REQUIRED", `antar sebelum ACC harus ditolak, dapat ${early.status}`);
    const call = await ticketAction(helperBar, barT.ticketNo, {
      action: "handover",
      waiterUserId: accountFile.accounts.waiter1.userId,
    });
    expect(call.status === 200, `helper panggil: ${call.status} ${call.error?.message ?? ""}`);
    const w = await waiter1.api("GET", "/api/waiter/tickets");
    const called = (w.data as Array<{ id: string; claimedBy: string | null; handoverAt: string | null }>).find((t) => t.id === barT.ticketNo);
    expect(called?.claimedBy === accountFile.accounts.waiter1.userId && called.handoverAt, "waiter1 tidak menerima panggilan");
    const del = await waiter1.api("POST", `/api/waiter/tickets/${barT.ticketNo}/deliver`);
    expect(del.status === 200, `antar: ${del.status} ${del.error?.message ?? ""}`);

    // Dapur S7 → helper dapur panggil siapa saja → waiter2 ambil & antar.
    await produceReady(s7.orderNo, "Food");
    const foodT = await ticketOf(s7.orderNo, "Food", helperDapur);
    expect(foodT, "tiket dapur S7 hilang");
    const any = await ticketAction(helperDapur, foodT.ticketNo, { action: "handover", waiterUserId: null });
    expect(any.status === 200, `panggil siapa saja: ${any.status}`);
    const claim = await waiter2.api("POST", `/api/waiter/tickets/${foodT.ticketNo}/claim`);
    expect(claim.status === 200, `waiter2 ambil: ${claim.status}`);
    const steal = await waiter1.api("POST", `/api/waiter/tickets/${foodT.ticketNo}/claim`);
    expect(steal.status === 409, `waiter1 merebut harus 409, dapat ${steal.status}`);
    const del2 = await waiter2.api("POST", `/api/waiter/tickets/${foodT.ticketNo}/deliver`);
    expect(del2.status === 200, `waiter2 antar: ${del2.status}`);
  });

  await scenario("S9", "READY dikembalikan dengan alasan → panggilan helper batal", async () => {
    const t = await ticketOf(t10[0]?.orderNo ?? "", "Bar");
    expect(t, "tiket RIZI tidak ada");
    await produceReady(t10[0].orderNo, "Bar");
    await ticketAction(helperBar, t.ticketNo, { action: "handover", waiterUserId: null });
    const noReason = await ticketAction(bar, t.ticketNo, { action: "reopen", reason: "" });
    expect(noReason.status === 422, `kembalikan tanpa alasan harus 422, dapat ${noReason.status}`);
    const reopened = await ticketAction(bar, t.ticketNo, { action: "reopen", reason: "Es kurang" });
    expect(reopened.status === 200, `kembalikan: ${reopened.status} ${reopened.error?.message ?? ""}`);
    const after = await ticketOf(t10[0].orderNo, "Bar");
    expect(after?.status === "cooking" && !after.handoverAt, "status/panggilan tidak direset");
    await produceReady(t10[0].orderNo, "Bar");
  });

  await scenario("S10", "Minta bill → bayar; split bill per tamu", async () => {
    const bill = await waiter1.api("POST", "/api/waiter/tables/10/bill");
    expect(bill.status === 200, `minta bill meja 10: ${bill.status} ${bill.error?.message ?? ""}`);
    for (const o of t10) await pay(o.id);
    // Split: GALIH (Indomie ×2) dipisah jadi 2 bill.
    const galih = batchOrders[2];
    expect(galih, "order GALIH tidak ada");
    const items = await kasir.api("GET", "/api/tables/15/items");
    const bills = (items.data as { bills: Array<{ id: string; items: Array<{ id: string; qty: number }> }> }).bills;
    const galihBill = bills.find((b) => b.id === galih.id);
    expect(galihBill?.items[0], "item bill GALIH tidak ditemukan");
    const split = await kasir.api("POST", `/api/customer/orders/${galih.id}/split`, {
      items: [{ orderItemId: galihBill.items[0].id, qty: 1 }],
      guestName: `GALIH2${STAMP}`,
    });
    expect(split.status === 200 || split.status === 201, `split: ${split.status} ${split.error?.message ?? ""}`);
    const child = (split.data as { child: { id: string } }).child;
    await pay(galih.id);
    await pay(child.id);
  });

  await scenario("S11", "Siklus meja: tolak kosongkan saat pesanan belum diantar → antar → DIRTY → CLEANING → AVAILABLE; reservasi", async () => {
    const step = async (action: string) => {
      const r = await waiter1.api("POST", "/api/waiter/tables/10/lifecycle", { action });
      expect(r.status === 200, `${action}: ${r.status} ${r.error?.message ?? ""}`);
    };
    const blocked = await waiter1.api("POST", "/api/waiter/tables/10/lifecycle", { action: "leave" });
    expect(
      blocked.error?.code === "TABLE_HAS_UNDELIVERED",
      `meja dengan pesanan belum diantar harus ditolak, dapat ${blocked.status} ${blocked.error?.code ?? ""}`,
    );
    for (const o of t10) await deliverStation(o.orderNo, "Bar");
    await step("leave");
    await step("start_cleaning");
    const clean = await waiter1.api("POST", "/api/waiter/tables/10/clean");
    expect(clean.status === 200, `clean: ${clean.status} ${clean.error?.message ?? ""}`);
    await step("reserve");
    await step("unreserve");
    const live = await waiter1.api("GET", "/api/waiter/tables");
    const row = (live.data as Array<{ tableNumber: string; status: string }>).find((r) => r.tableNumber === "10");
    expect(row?.status === "empty", `meja 10 akhir: ${row?.status}`);
  });

  await scenario("S12", "Void order yang sedang diproduksi → tiket produksi ikut batal", async () => {
    const ind = indomie();
    const o = await posOrder("25", `KIKI${STAMP}`, [{ itemId: ind.itemId, variantId: ind.variantId, qty: 1 }]);
    const t = await ticketOf(o.orderNo, "Food");
    expect(t, "tiket void tidak ada");
    await ticketAction(dapur, t.ticketNo, { action: "start" });
    const reasons = await kasir.api("POST", `/api/orders/${o.orderId}/void-request`, { reasonCode: "pelanggan_batal" });
    let approvalId = (reasons.data as { approvalId?: string; approval?: { id: string } } | undefined)?.approvalId
      ?? (reasons.data as { approval?: { id: string } } | undefined)?.approval?.id;
    if (reasons.status !== 200 && reasons.status !== 201) {
      throw new Fail(`void-request: ${reasons.status} ${reasons.error?.message ?? JSON.stringify(reasons.json).slice(0, 160)}`);
    }
    if (!approvalId) approvalId = String((reasons.data as Json)?.id ?? "");
    expect(approvalId, `approvalId tidak ditemukan: ${JSON.stringify(reasons.data).slice(0, 160)}`);
    const pin = await kasir.api("POST", `/api/approvals/${approvalId}/pin`, { pin: accountFile.managerPin, status: "approved" });
    expect(pin.status === 200, `approve PIN: ${pin.status} ${pin.error?.message ?? ""}`);
    const after = await board(dapur);
    const still = after.tickets.find((x) => x.orderNo === o.orderNo);
    expect(!still, `tiket order VOID masih aktif di Production (status ${still?.status})`);
  });

  await scenario("S13", "Finalisasi fee pool / payroll harian oleh manajer", async () => {
    const r = await manajer.api("POST", "/api/payroll/cron/finalize", {});
    expect(r.status === 200, `finalize: ${r.status} ${r.error?.message ?? ""}`);
  });

  await scenario("S14", "Hak akses negatif (MULAI/READY/ACC oleh peran yang salah)", async () => {
    const ind = indomie();
    const o = await posOrder("26", `LALA${STAMP}`, [{ itemId: ind.itemId, variantId: ind.variantId, qty: 1 }]);
    const t = await ticketOf(o.orderNo, "Food");
    expect(t, "tiket tidak ada");
    const checks: Array<[Actor, Json, number[]]> = [
      [waiter1, { action: "start" }, [403]],
      [kasir, { action: "start" }, [403]],
      [helperDapur, { action: "start" }, [403]],
      [bar, { action: "start" }, [403]],
    ];
    for (const [actor, body, codes] of checks) {
      const r = await ticketAction(actor, t.ticketNo, body);
      expect(codes.includes(r.status), `${actor.key} ${JSON.stringify(body)} → ${r.status} (harus ${codes.join("/")})`);
    }
    await produceReady(o.orderNo, "Food");
    const wrongHelper = await ticketAction(helperBar, t.ticketNo, { action: "handover", waiterUserId: null });
    expect(wrongHelper.status === 403, `helper BAR ACC tiket dapur → ${wrongHelper.status}`);
    const waiterAcc = await ticketAction(waiter1, t.ticketNo, { action: "handover", waiterUserId: null });
    expect(waiterAcc.status === 403, `waiter ACC → ${waiterAcc.status}`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`RINGKASAN: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` — GAGAL: ${failed.map((f) => f.id).join(", ")}` : ""}`);
  fs.writeFileSync(
    path.join(process.cwd(), ".tmp", "gladi-result.json"),
    JSON.stringify({ at: new Date().toISOString(), stamp: STAMP, s1OrderNo, results }, null, 2),
  );
  process.exit(failed.length ? 1 : 0);
}

// Mode --stage: tinggalkan papan dalam kondisi "shift ramai" untuk dicek
// visual per peran (tidak menyelesaikan alur).
async function stageForVisualCheck() {
  for (const actor of Object.values(actors)) await actor.login();
  const shift = await kasir.api("POST", "/api/finance/cash-sessions", { openingCash: 500_000 });
  if (shift.status !== 201 && shift.error?.code !== "CASH_SESSION_ALREADY_OPEN") {
    throw new Error(`buka shift: ${shift.status} ${shift.error?.message ?? ""}`);
  }
  const ind = item("Indomie Goreng");
  const latteCold = item("Coffee Latte", "Cold");
  const latteHot = item("Coffee Latte", "Hot");
  const nasi = item("Nasi Goreng");

  // 1. Dua meja Indomie → saran Smart Batch di DAPUR (antre).
  for (const [table, name] of [["31", "RIZI"], ["32", "JAPANIS"]] as const) {
    const o = await qrOrder(table, name, [{ itemId: ind.itemId, variantId: ind.variantId, qty: 1, note: "pedas" }]);
    await accept(o.id);
  }
  // 2. Order BAR sedang dibuat + DAPUR antre (order belum lengkap).
  const andi = await qrOrder("33", "ANDI", [
    { itemId: latteCold.itemId, variantId: latteCold.variantId, qty: 2, note: "less sugar" },
    { itemId: nasi.itemId, variantId: nasi.variantId, qty: 1 },
  ]);
  await accept(andi.id);
  const andiBar = await ticketOf(andi.orderNo, "Bar");
  if (andiBar) await ticketAction(bar, andiBar.ticketNo, { action: "start" });
  // 3. READY menunggu ACC helper.
  const budi = await qrOrder("34", "BUDI", [{ itemId: latteHot.itemId, variantId: latteHot.variantId, qty: 1 }]);
  await accept(budi.id);
  await produceReady(budi.orderNo, "Bar");
  // 4. READY sudah dipanggil helper ke waiter1.
  const sinta = await qrOrder("35", "SINTA", [{ itemId: latteCold.itemId, variantId: latteCold.variantId, qty: 1 }]);
  await accept(sinta.id);
  await produceReady(sinta.orderNo, "Bar");
  const sintaT = await ticketOf(sinta.orderNo, "Bar", helperBar);
  if (sintaT) {
    await ticketAction(helperBar, sintaT.ticketNo, {
      action: "handover",
      waiterUserId: accountFile.accounts.waiter1.userId,
    });
  }
  // 5. Order di-void saat sedang dibuat → pita "Dibatalkan" di DAPUR.
  const kiki = await posOrder("36", "KIKI", [{ itemId: nasi.itemId, variantId: nasi.variantId, qty: 1 }]);
  const kikiT = await ticketOf(kiki.orderNo, "Food");
  if (kikiT) await ticketAction(dapur, kikiT.ticketNo, { action: "start" });
  const vr = await kasir.api("POST", `/api/orders/${kiki.orderId}/void-request`, { reasonCode: "pelanggan_batal" });
  const approvalId =
    (vr.data as { approvalId?: string; approval?: { id: string }; id?: string } | undefined)?.approvalId ??
    (vr.data as { approval?: { id: string } } | undefined)?.approval?.id ??
    (vr.data as { id?: string } | undefined)?.id;
  if (approvalId) {
    await kasir.api("POST", `/api/approvals/${approvalId}/pin`, { pin: accountFile.managerPin, status: "approved" });
  }
  console.log("Papan gladi siap untuk dicek visual (batch, proses, READY, dipanggil, dibatalkan).");
}

function pick(line: { itemId: string; variantId: string }) {
  return { itemId: line.itemId, variantId: line.variantId };
}

main().catch((error) => {
  console.error("GLADI ERROR:", error);
  process.exit(2);
});
