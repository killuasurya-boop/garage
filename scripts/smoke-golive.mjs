#!/usr/bin/env node
// =============================================================================
// Smoke test go-live Garage OS — alur bisnis nyata lewat API terhadap server
// yang sedang jalan (DB uji, BUKAN produksi). Membuktikan:
//   - 11 akun bisa login, role & workstation benar
//   - RBAC: allow & deny lewat API langsung (bukan hanya UI)
//   - Waiter pesan 3 meja (Americano sama) → kasir terima → BAR & DAPUR
//     proses → helper serah-terima → bayar Cash/QRIS/Transfer → laporan
//   - Klik ganda / permintaan bersamaan tidak menggandakan order/pembayaran
//
// Pakai:  SMOKE_BASE=http://127.0.0.1:3002 SMOKE_PASSWORD=... node scripts/smoke-golive.mjs
// Setelah selesai WAJIB: npx tsx src/db/reset-grand-opening.ts --apply --yes
// =============================================================================
const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3002";
const PASSWORD = process.env.SMOKE_PASSWORD;
const RUN = `smoke-${Date.now()}`;
if (!PASSWORD) {
  console.error("Set SMOKE_PASSWORD (password uji semua akun).");
  process.exit(2);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

class Client {
  constructor(email) {
    this.email = email;
    this.cookie = "";
  }
  async req(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        origin: BASE,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) {
      const jar = new Map(this.cookie.split("; ").filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
      for (const raw of setCookie) {
        const [pair] = raw.split(";");
        const [k, v] = pair.split(/=(.*)/s);
        jar.set(k, v);
      }
      this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, json, data: json?.data ?? json };
  }
  login() {
    return this.req("POST", "/api/auth/sign-in/email", { email: this.email, password: PASSWORD });
  }
}

const ROSTER = {
  owner: "owner@garage.id",
  manajer: "manajer@garage.id",
  barista1: "barista1@garage.id",
  barista2: "barista2@garage.id",
  waiter1: "waiter1@garage.id",
  waiter2: "waiter2@garage.id",
  waiter3: "waiter3@garage.id",
  koki: "koki@garage.id",
  asisten: "asisten.koki@garage.id",
  helperBar: "helper.bar@garage.id",
  helperDapur: "helper.dapur@garage.id",
};

async function main() {
  // ---------- 1. Login 11 akun ----------
  const c = {};
  for (const [key, email] of Object.entries(ROSTER)) {
    c[key] = new Client(email);
    const res = await c[key].login();
    check(`Login ${email}`, res.status === 200, `HTTP ${res.status}`);
  }
  const me = {};
  for (const key of Object.keys(ROSTER)) {
    const res = await c[key].req("GET", "/api/auth/get-session");
    me[key] = res.json?.user?.id;
  }

  // ---------- 2. RBAC allow / deny lewat API ----------
  const anon = new Client("anon");
  const rbac = [
    ["Tanpa login → API privat ditolak", anon, "GET", "/api/finance/summary", 401],
    ["Waiter → laporan keuangan ditolak", c.waiter1, "GET", "/api/finance/summary", 403],
    ["Waiter → buka kas ditolak", c.waiter1, "POST", "/api/finance/cash-sessions", 403, { openingCash: 100000 }],
    ["Waiter → manajemen user ditolak", c.waiter1, "GET", "/api/admin/users", 403],
    ["Barista → laporan keuangan ditolak", c.barista1, "GET", "/api/finance/summary", 403],
    ["Barista → manajemen user ditolak", c.barista1, "GET", "/api/admin/users", 403],
    ["Koki → audit log ditolak", c.koki, "GET", "/api/audit", 403],
    ["Helper Dapur → catat pengeluaran ditolak", c.helperDapur, "POST", "/api/finance/expenses", 403, { amount: 1000, category: "x", note: "x" }],
    ["Helper Bar → payroll owner ditolak", c.helperBar, "GET", "/api/payroll/settings", 403],
    ["Manajer → laporan keuangan diizinkan", c.manajer, "GET", "/api/finance/summary", 200],
    ["Owner → manajemen user diizinkan", c.owner, "GET", "/api/admin/users", 200],
    ["Koki → papan produksi diizinkan", c.koki, "GET", "/api/production", 200],
    ["Waiter → peta meja diizinkan", c.waiter1, "GET", "/api/waiter/tables", 200],
  ];
  for (const [name, client, method, path, expected, body] of rbac) {
    const res = await client.req(method, path, body);
    check(name, res.status === expected, `HTTP ${res.status} (harap ${expected})`);
  }

  // ---------- 3. Barista buka kas ----------
  const opened = await c.barista1.req("POST", "/api/finance/cash-sessions", { openingCash: 200000 });
  check("Barista 1 buka shift kas Rp200.000", opened.status === 200 || opened.status === 201, `HTTP ${opened.status} ${opened.json?.error?.message ?? ""}`);

  // ---------- 4. Waiter pesan 3 meja, produk sama ----------
  const item = (itemId, variantId, qty = 1) => ({ itemId, variantId, qty });
  const orderFor = async (waiter, table, items, key) =>
    waiter.req("POST", "/api/waiter/orders", { tableLabel: table, items }, key ? { "x-idempotency-key": key } : {});
  const o1 = await orderFor(c.waiter1, "1", [item("bar-americano", "cold"), item("makanan-nasi-goreng", "regular")], `${RUN}-m1`);
  const o1dup = await orderFor(c.waiter1, "1", [item("bar-americano", "cold"), item("makanan-nasi-goreng", "regular")], `${RUN}-m1`);
  const o2 = await orderFor(c.waiter2, "2", [item("bar-americano", "cold")], `${RUN}-m2`);
  const o3 = await orderFor(c.waiter3, "3", [item("bar-americano", "cold")], `${RUN}-m3`);
  const ids = [o1, o2, o3].map((r) => r.data?.order?.id ?? r.data?.id);
  check("Waiter 1/2/3 kirim order Meja 1, 2, 3", [o1, o2, o3].every((r) => r.status === 200 || r.status === 201) && ids.every(Boolean), ids.join(", "));
  check("Klik ganda (kunci sama) tidak membuat order kedua", (o1dup.data?.order?.id ?? o1dup.data?.id) === ids[0], `${o1dup.status}`);

  // ---------- 5. Kasir terima (accept) — dua kali bersamaan pada Meja 3 ----------
  for (const id of ids.slice(0, 2)) {
    const res = await c.barista1.req("PATCH", `/api/customer/orders/${id}/status`, { action: "accept" });
    check(`Kasir terima order ${id.slice(0, 8)}`, res.status === 200, `HTTP ${res.status} ${res.json?.error?.message ?? ""}`);
  }
  const [acc1, acc2] = await Promise.all([
    c.barista1.req("PATCH", `/api/customer/orders/${ids[2]}/status`, { action: "accept" }),
    c.barista1.req("PATCH", `/api/customer/orders/${ids[2]}/status`, { action: "accept" }),
  ]);
  check("Terima ganda bersamaan Meja 3 tidak error", acc1.status === 200 && acc2.status === 200, `${acc1.status}/${acc2.status}`);

  // ---------- 6. BAR & DAPUR ----------
  const board = await c.barista1.req("GET", "/api/production");
  const tickets = JSON.stringify(board.data ?? {});
  const ticketList = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if (typeof node.ticketNo === "string" && node.station) ticketList.push({ ...node, tableLabel: node.tableLabel ?? node.table });
      Object.values(node).forEach(walk);
    }
  };
  walk(board.data);
  const uniq = new Map(ticketList.map((t) => [t.ticketNo, t]));
  const bar = [...uniq.values()].filter((t) => /bar/i.test(t.station));
  const food = [...uniq.values()].filter((t) => /food|dapur|kitchen/i.test(t.station));
  check("BAR menerima 3 tiket terpisah (Meja 1, 2, 3)", bar.length === 3 && new Set(bar.map((t) => t.tableLabel)).size === 3, bar.map((t) => t.tableLabel).join(", "));
  check("DAPUR menerima 1 tiket (Meja 1)", food.length === 1, food.map((t) => t.tableLabel).join(", "));
  check("Tiket Meja 3 tidak dobel walau diterima 2×", bar.filter((t) => /Meja 0?3$/.test(String(t.tableLabel))).length === 1 && tickets.length > 0);

  const act = (client, ticket, body) =>
    client.req("POST", `/api/production/tickets/${encodeURIComponent(ticket.ticketNo)}`, body);
  if (food[0]) {
    const deny = await act(c.koki, bar[0], { action: "start" });
    check("Koki (DAPUR) tidak boleh memproses tiket BAR", deny.status === 403, `HTTP ${deny.status}`);
    const denyHelper = await act(c.helperDapur, food[0], { action: "start" });
    check("Helper Dapur tidak boleh MULAI produksi", denyHelper.status === 403, `HTTP ${denyHelper.status}`);
    const s = await act(c.koki, food[0], { action: "start" });
    const r = await act(c.asisten, food[0], { action: "ready_call", qcConfirmed: true });
    check("Koki mulai + Asisten Koki siap (QC) tiket DAPUR", s.status === 200 && r.status === 200, `${s.status}/${r.status} ${r.json?.error?.message ?? ""}`);
    const p = await act(c.helperDapur, food[0], { action: "pickup", waiterUserId: me.waiter1 });
    check("Helper Dapur serah-terima ke Waiter 1", p.status === 200, `HTTP ${p.status} ${p.json?.error?.message ?? ""}`);
  }
  for (const [i, t] of bar.entries()) {
    const barista = i % 2 === 0 ? c.barista1 : c.barista2;
    const s = await act(barista, t, { action: "start" });
    const [r1, r2] = await Promise.all([
      act(barista, t, { action: "ready_call", qcConfirmed: true }),
      act(c.barista1, t, { action: "ready_call", qcConfirmed: true }),
    ]);
    check(`Barista proses ${t.tableLabel} (READY ganda aman)`, s.status === 200 && [r1.status, r2.status].includes(200), `${s.status}/${r1.status}/${r2.status}`);
    const waiterId = [me.waiter1, me.waiter2, me.waiter3][i];
    const p = await act(c.helperBar, t, { action: "pickup", waiterUserId: waiterId });
    check(`Helper Bar serah-terima ${t.tableLabel}`, p.status === 200, `HTTP ${p.status} ${p.json?.error?.message ?? ""}`);
  }
  const boardAfter = await c.barista1.req("GET", "/api/production");
  const left = [];
  ticketList.length = 0;
  walk(boardAfter.data);
  for (const t of ticketList) if (!/delivered|picked/i.test(String(t.status))) left.push(t.ticketNo);
  check("Papan produksi bersih setelah diantar", new Set(left).size === 0, [...new Set(left)].join(", "));

  // ---------- 7. Waiter melihat status meja ----------
  const tables = await c.waiter1.req("GET", "/api/waiter/tables");
  check("Waiter melihat peta meja", tables.status === 200);

  // ---------- 8. Pembayaran Cash / QRIS / Transfer, bayar ganda bersamaan ----------
  const pay = (id, method, extra = {}) =>
    c.barista1.req("PATCH", `/api/customer/orders/${id}/status`, { action: "paid", paymentMethod: method, ...extra });
  const totals = [];
  for (const id of ids) {
    const res = await c.barista1.req("GET", `/api/orders/${id}/receipt`);
    totals.push(Number(res.data?.total ?? res.data?.order?.total ?? 0));
  }
  const p1 = await pay(ids[0], "Cash", { cashReceived: 100000 });
  const [p2a, p2b] = await Promise.all([pay(ids[1], "QRIS"), pay(ids[1], "QRIS")]);
  const p3 = await pay(ids[2], "Bank Transfer", { paymentReference: "TRF-SMOKE" });
  check("Bayar Meja 1 Cash", p1.status === 200, `HTTP ${p1.status} ${p1.json?.error?.message ?? ""}`);
  check("Bayar Meja 2 QRIS (2 permintaan bersamaan)", p2a.status === 200 && p2b.status === 200, `${p2a.status}/${p2b.status}`);
  check("Bayar Meja 3 Transfer", p3.status === 200, `HTTP ${p3.status} ${p3.json?.error?.message ?? ""}`);

  // ---------- 9. Laporan berubah sesuai transaksi ----------
  const expected = totals.reduce((a, b) => a + b, 0);
  const summary = await c.manajer.req("GET", "/api/finance/summary");
  const breakdown = Object.fromEntries((summary.data?.paymentBreakdown ?? []).map((row) => [row.method, row.amount]));
  check("Laporan: Cash = total Meja 1", breakdown.Cash === totals[0], `Rp ${breakdown.Cash}`);
  check("Laporan: QRIS = Meja 2 (tidak dobel)", breakdown.QRIS === totals[1], `Rp ${breakdown.QRIS}`);
  check("Laporan: Transfer = Meja 3", breakdown["Bank Transfer"] === totals[2], `Rp ${breakdown["Bank Transfer"]}`);
  check("Kas di laci = modal + cash saja", summary.data?.cashSession?.expectedCash === 200000 + totals[0], `Rp ${summary.data?.cashSession?.expectedCash}`);
  const dash = await c.owner.req("GET", "/api/dashboard");
  const revenue = dash.data?.headlineMetrics?.find((m) => m.id === "revenue");
  check("Dashboard: revenue hari ini = 3 order lunas", /3 order paid/.test(revenue?.delta ?? ""), `${revenue?.value} · ${revenue?.delta} (harap Rp ${expected})`);

  return { ids, totals };
}

main()
  .then((out) => {
    console.log(`\nORDER_IDS=${out.ids.join(",")}`);
    console.log(`TOTALS=${out.totals.join(",")}`);
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} PASS`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((error) => {
    console.error("SMOKE ERROR:", error);
    process.exit(1);
  });
