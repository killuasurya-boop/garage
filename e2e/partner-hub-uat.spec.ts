import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { failOnPageErrors, login, todayJakarta } from "./helpers";

// =============================================================================
// UAT Smart Partner Hub (docs/partner-hub/02-UAT-STAGING.md) di server nyata + DB baru:
// Owner/Manajer menyiapkan mitra → kasir jual campuran → Portal Mitra terima/proses/siap →
// 2 waiter klaim bersamaan → keuangan (refund, void setelah siap) → settlement → payout → PDF.
// Angka keuangan dihitung dari master yang diinput tes (harga jual 22.000, HPP 19.000), bukan dari gambar.
// =============================================================================

test.describe.configure({ mode: "serial" });

const PRICE = 22_000;
const COST = 19_000;
const PARTNER_PHONE = "081299990001";
const PARTNER_PIN = "246813";
// PIN buatan staf: mitra wajib menggantinya sendiri saat pertama masuk (must_change_pin).
const STAFF_PIN = "975310";
const PARTNER2_PHONE = "081299990002";

type Ctx = { page: Page; api: APIRequestContext; close: () => Promise<void> };
const roles: Record<string, Ctx> = {};
const state = { cashierEmail: "kasir@garage.id", partnerId: "", partner2Id: "", linkId: "", menuItemId: "", garageItem: { itemId: "", variantId: "" }, orders: [] as string[] };

async function as(browser: Browser, email: string): Promise<Ctx> {
  if (roles[email]) return roles[email];
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await context.newPage();
  await login(page, email);
  roles[email] = { page, api: context.request, close: () => context.close() };
  return roles[email];
}

async function call<T = unknown>(api: APIRequestContext, method: string, url: string, body?: unknown, expectStatus?: number) {
  const res = await api.fetch(url, { method, data: body === undefined ? undefined : body, headers: { "content-type": "application/json" } });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } };
  if (expectStatus !== undefined) expect(res.status(), `${method} ${url}: ${JSON.stringify(json)}`).toBe(expectStatus);
  else expect(res.ok(), `${method} ${url}: ${res.status()} ${JSON.stringify(json)}`).toBeTruthy();
  return { status: res.status(), data: json.data as T, error: json.error };
}

async function sell(api: APIRequestContext, items: Array<{ itemId: string; variantId: string; qty: number }>, extra: Record<string, unknown> = {}, expectStatus?: number) {
  const res = await call<{ orderNo?: string; order?: { orderNo?: string; id?: string }; receipt?: { orderNo?: string } }>(
    api,
    "POST",
    "/api/orders",
    { orderType: "dine-in", tableNumber: "12", paymentMethod: "Cash", cashReceived: 500_000, guestName: "Rizky UAT", items, ...extra },
    expectStatus,
  );
  return { ...res, orderNo: res.data?.orderNo ?? res.data?.order?.orderNo ?? res.data?.receipt?.orderNo ?? "" };
}

async function partnerApi(browser: Browser, phone: string) {
  const context = await browser.newContext();
  let login = await context.request.post("/api/partner/auth/login", { data: { phone, pin: PARTNER_PIN } });
  if (login.status() !== 200) {
    // Login pertama memakai PIN dari staf, lalu mitra membuat PIN sendiri (aksi lain ditolak sebelum itu).
    login = await context.request.post("/api/partner/auth/login", { data: { phone, pin: STAFF_PIN } });
    if (login.status() === 200) {
      const blocked = await context.request.get("/api/partner/tickets");
      expect(blocked.status(), "sebelum ganti PIN, aksi portal ditolak").toBe(403);
      const changed = await context.request.post("/api/partner/auth/pin", { data: { oldPin: STAFF_PIN, newPin: PARTNER_PIN } });
      expect(changed.status(), "ganti PIN pertama").toBe(200);
    }
  }
  return { api: context.request, status: login.status(), close: () => context.close() };
}

const partnerItem = (qty: number) => ({ itemId: state.menuItemId, variantId: "reg", qty });

test.afterAll(async () => {
  for (const ctx of Object.values(roles)) await ctx.close();
});

test("UAT-A: Owner & Manajer menyiapkan mitra pilot; aktivasi tidak bisa dilompati (UAT-01)", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Partner Hub diuji di desktop");
  const owner = await as(browser, "owner@garage.id");
  const manager = await as(browser, "manajer@garage.id");

  // Modul mati = halaman lama tidak berubah; nyalakan untuk outlet ini.
  await call(owner.api, "PATCH", "/api/settings", { partnerHubEnabled: true });

  const created = await call<{ id: string }>(manager.api, "POST", "/api/partners", {
    code: "PAU",
    name: "Es Krim Pokat Au",
    phone: "081234500001",
    handoverPoint: "Meja serah-terima depan bar",
  }, 201);
  state.partnerId = created.data.id;

  // Lompat ke aktif ditolak.
  await call(owner.api, "POST", `/api/partners/${state.partnerId}/status`, { to: "aktif", reason: "lompat status" }, 409);

  await call(manager.api, "PATCH", `/api/partners/${state.partnerId}`, { terms: "Harga & serah-terima sesuai kesepakatan tertulis." });
  const bank = await call<{ id: string }>(manager.api, "POST", `/api/partners/${state.partnerId}/bank-accounts`, { bankName: "Mandiri", accountName: "Henry", accountNumber: "1234560148" }, 201);
  await call(owner.api, "POST", `/api/partners/bank-accounts/${bank.data.id}/verify`);
  await call(manager.api, "POST", `/api/partners/${state.partnerId}/accounts`, { phone: PARTNER_PHONE, displayName: "Henry (mitra)", pin: STAFF_PIN }, 201);
  const product = await call<{ linkId: string; menuItemId: string }>(manager.api, "POST", `/api/partners/${state.partnerId}/products`, {
    code: "PAU-001",
    name: "Es Krim Pokat",
    category: "Dessert Mitra",
    variants: [{ variantId: "reg", label: "Regular", unitCost: COST, sellPrice: PRICE }],
  }, 201);
  state.linkId = product.data.linkId;
  state.menuItemId = product.data.menuItemId;

  // Mitra belum aktif → login portal ditolak (UAT-01).
  const early = await partnerApi(browser, PARTNER_PHONE);
  expect(early.status).toBeGreaterThanOrEqual(400);
  await early.close();

  // Produk nonaktif sampai Owner menyetujui.
  await call(owner.api, "PATCH", `/api/partners/products/${state.linkId}`, { active: true });
  await call(manager.api, "POST", `/api/partners/${state.partnerId}/status`, { to: "verifikasi", reason: "data lengkap" });
  await call(owner.api, "POST", `/api/partners/${state.partnerId}/status`, { to: "disetujui", reason: "kontrak ditandatangani" });
  await call(owner.api, "POST", `/api/partners/${state.partnerId}/status`, { to: "aktif", reason: "uji order lulus" });

  // UI Kelola Mitra tampil tanpa error.
  const assertNoErrors = failOnPageErrors(owner.page);
  await owner.page.goto("/partners?tab=manage");
  await expect(owner.page.getByText("Es Krim Pokat Au").first()).toBeVisible({ timeout: 60_000 });
  assertNoErrors();
});

test("UAT-B: kasir jual kopi + produk mitra; Habis ditolak server, Tutup/last order hanya keterangan (UAT-03/04/06/26)", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Partner Hub diuji di desktop");
  // Satu outlet = satu shift terbuka. Bila spec sebelumnya (mis. decision-center, Kasir 2) masih punya shift
  // terbuka — dan spec POS sesudahnya memakai shift itu — jual lewat kasir yang shift-nya sedang buka.
  let kasir = await as(browser, state.cashierEmail);
  const opened = await kasir.api.fetch("/api/finance/cash-sessions", {
    method: "POST",
    data: { openingCash: 100_000, openingDenominations: { "100000": 1 } },
    headers: { "content-type": "application/json" },
  });
  if (opened.status() !== 201) {
    const json = (await opened.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    expect(json.error?.code, `buka shift: ${JSON.stringify(json)}`).toBe("OUTLET_CASH_SESSION_ALREADY_OPEN");
    expect(json.error?.message ?? "").toMatch(/Kasir 2/);
    state.cashierEmail = "kasir2@garage.id";
    kasir = await as(browser, state.cashierEmail);
  }
  const owner = await as(browser, "owner@garage.id");

  const menu = await call<{ items?: Array<{ id: string; productType?: string; category?: string; stock?: string; variants: Array<{ id: string }> }> }>(kasir.api, "GET", "/api/menu");
  const items = Array.isArray(menu.data) ? (menu.data as never as Array<{ id: string; category?: string; stock?: string; variants: Array<{ id: string }> }>) : (menu.data.items ?? []);
  const coffee = items.find((item) => item.id !== state.menuItemId && /coffee/i.test(item.category ?? "") && item.stock !== "sold_out") ?? items.find((item) => item.id !== state.menuItemId)!;
  state.garageItem = { itemId: coffee.id, variantId: coffee.variants[0].id };
  expect(items.some((item) => item.id === state.menuItemId), "produk mitra tampil di menu POS saat hub aktif").toBeTruthy();

  // Mitra masih TUTUP (belum konfirmasi BUKA): produk tetap bisa dipesan selama Tersedia — kartu hanya memberi keterangan.
  const partnerCard = (list: unknown) =>
    ((Array.isArray(list) ? list : ((list as { items?: unknown[] }).items ?? [])) as Array<{ id: string; stock?: string; partner?: { label: string | null; note?: string | null } }>).find(
      (item) => item.id === state.menuItemId,
    )!;
  const closedCard = partnerCard(menu.data);
  expect(closedCard.stock).not.toBe("sold_out");
  expect(closedCard.partner?.label ?? null).toBeNull();
  expect(closedCard.partner?.note ?? "").toMatch(/tutup|belum konfirmasi|jeda|tidak terhubung/i);

  const partner = await partnerApi(browser, PARTNER_PHONE);
  expect(partner.status).toBe(200);
  await call(partner.api, "POST", "/api/partner/status", { status: "buka" });

  // UAT-06: satu invoice, tiket Bar + tiket Mitra.
  const sale = await sell(kasir.api, [{ ...state.garageItem, qty: 1 }, partnerItem(2)]);
  expect(sale.orderNo).toMatch(/\w/);
  state.orders.push(sale.orderNo);
  const mitraOrders = await call<Array<{ orderNo: string; tableLabel: string; items: Array<{ qty: number }> }>>(kasir.api, "GET", "/api/pos/partner-orders");
  const line = mitraOrders.data.find((row) => row.orderNo === sale.orderNo)!;
  expect(line).toBeTruthy();
  expect(line.tableLabel).toBe("Meja 12");
  expect(line.items[0].qty).toBe(2);

  // UAT-03: mitra tandai HABIS → server menolak; lalu tersedia lagi.
  await call(partner.api, "PATCH", `/api/partner/products/${state.linkId}/availability`, { available: false });
  const soldOut = await sell(kasir.api, [partnerItem(1)], {}, 400);
  expect(soldOut.error?.message ?? "").toMatch(/habis|sold out/i);
  await call(partner.api, "PATCH", `/api/partner/products/${state.linkId}/availability`, { available: true });

  // UAT-26: last order lewat (semua hari 00:00) → tetap bisa dipesan, kartu memberi keterangan; dikembalikan.
  const allDays = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, "00:00"]));
  await call(owner.api, "PATCH", `/api/partners/${state.partnerId}`, { lastOrderByDay: allDays });
  const lateCard = partnerCard((await call<unknown>(kasir.api, "GET", "/api/menu")).data);
  expect(lateCard.stock).not.toBe("sold_out");
  expect(lateCard.partner?.note ?? "").toMatch(/last order/i);
  await call(owner.api, "PATCH", `/api/partners/${state.partnerId}`, { lastOrderByDay: Object.fromEntries(Object.keys(allDays).map((d) => [d, null])) });
  await partner.close();
});

test("UAT-C: Portal Mitra terima → proses → siap; 2 waiter klaim bersamaan, hanya satu menang (UAT-09/10)", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Partner Hub diuji di desktop");
  // Portal Mitra lewat UI (mobile).
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await context.newPage();
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/partner");
  await page.getByLabel("Nomor HP").fill(PARTNER_PHONE);
  await page.getByLabel("PIN (6 angka)").fill(PARTNER_PIN);
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await expect(page.getByText(state.orders[0]).first()).toBeVisible({ timeout: 60_000 });
  for (const action of [/^Terima$/, /Mulai Proses/, /^Siap Antar$/]) {
    const button = page.getByRole("button", { name: action }).first();
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await button.click();
    await expect(page.getByRole("status").or(page.getByText(/diterima|diproses|waiter diberi tahu/i)).first()).toBeVisible({ timeout: 30_000 });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  assertNoErrors();

  const kasir = await as(browser, state.cashierEmail);
  const readTicket = async () => {
    const orders = await call<Array<{ ticketNo: string; orderNo: string; status: string }>>(kasir.api, "GET", "/api/pos/partner-orders");
    return orders.data.find((row) => row.orderNo === state.orders[0])!;
  };
  // Klik terakhir di portal tersimpan secara async — tunggu status server, bukan teks layar.
  await expect.poll(async () => (await readTicket()).status, { timeout: 30_000 }).toBe("ready");
  const ticket = await readTicket();
  await context.close();

  const w1 = await as(browser, "waiter@garage.id");
  const w2 = await as(browser, "waiter2@garage.id");
  const [a, b] = await Promise.all([
    w1.api.post(`/api/waiter/tickets/${ticket.ticketNo}/claim`),
    w2.api.post(`/api/waiter/tickets/${ticket.ticketNo}/claim`),
  ]);
  const wins = [a, b].filter((r) => r.ok());
  expect(wins, `klaim: ${a.status()} / ${b.status()}`).toHaveLength(1);
  const winner = a.ok() ? w1 : w2;
  await winner.page.goto("/partners?tab=pickup");
  await expect(winner.page.getByText(state.orders[0]).first()).toBeVisible({ timeout: 60_000 });
  await call(winner.api, "POST", `/api/waiter/tickets/${ticket.ticketNo}/deliver`);
});

test("UAT-D: keuangan Rp0 selisih — refund penuh item mitra & void setelah siap (UAT-13/16)", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Partner Hub diuji di desktop");
  const kasir = await as(browser, state.cashierEmail);
  const manager = await as(browser, "manajer@garage.id");
  const partner = await partnerApi(browser, PARTNER_PHONE);

  // Order 2: kopi + 1 mitra, siap, lalu refund SELURUH qty item mitra.
  const o2 = await sell(kasir.api, [{ ...state.garageItem, qty: 1 }, partnerItem(1)]);
  state.orders.push(o2.orderNo);
  const tickets = await call<Array<{ ticketNo: string; orderNo: string }>>(partner.api, "GET", "/api/partner/tickets");
  const t2 = tickets.data.find((row) => row.orderNo === o2.orderNo)!;
  for (const action of ["accept", "start", "ready"]) await call(partner.api, "POST", `/api/partner/tickets/${t2.ticketNo}/action`, { action });

  const refundable = await call<{ items: Array<{ id: string; itemName: string; qty: number }> }>(kasir.api, "GET", `/api/orders/${o2.orderNo}/refund-request`);
  const target = refundable.data.items.find((item) => /pokat/i.test(item.itemName))!;
  const req = await call<{ approvalId: string; status: string }>(kasir.api, "POST", `/api/orders/${o2.orderNo}/refund-request`, {
    reasonCode: "komplain_kualitas",
    note: "meleleh",
    items: [{ orderItemId: target.id, qty: 1 }],
  });
  if (req.data.status === "pending") await call(manager.api, "PATCH", `/api/approvals/${req.data.approvalId}`, { status: "approved" });

  // Order 3: 1 mitra, siap, lalu di-void → penjualan 0, kewajiban tetap.
  const o3 = await sell(kasir.api, [partnerItem(1)]);
  state.orders.push(o3.orderNo);
  const tickets3 = await call<Array<{ ticketNo: string; orderNo: string }>>(partner.api, "GET", "/api/partner/tickets");
  const t3 = tickets3.data.find((row) => row.orderNo === o3.orderNo)!;
  for (const action of ["accept", "start", "ready"]) await call(partner.api, "POST", `/api/partner/tickets/${t3.ticketNo}/action`, { action });
  const void3 = await manager.api.post(`/api/orders/${o3.orderNo}/void`, { data: { reason: "Salah input UAT" } });
  expect(void3.ok(), `void: ${void3.status()} ${await void3.text()}`).toBeTruthy();

  // Order 4: dibatalkan sebelum mitra memproses → tidak ada penjualan maupun kewajiban.
  const o4 = await sell(kasir.api, [partnerItem(1)]);
  state.orders.push(o4.orderNo);
  const void4 = await manager.api.post(`/api/orders/${o4.orderNo}/void`, { data: { reason: "Pelanggan batal UAT" } });
  expect(void4.ok(), `void: ${void4.status()} ${await void4.text()}`).toBeTruthy();

  // Order 5: kopi + 1 mitra, mitra MENOLAK setelah pelanggan bayar → antrean refund kasir → refund lewat approval.
  const o5 = await sell(kasir.api, [{ ...state.garageItem, qty: 1 }, partnerItem(1)]);
  const tickets5 = await call<Array<{ ticketNo: string; orderNo: string }>>(partner.api, "GET", "/api/partner/tickets");
  const t5 = tickets5.data.find((row) => row.orderNo === o5.orderNo)!;
  await call(partner.api, "POST", `/api/partner/tickets/${t5.ticketNo}/action`, { action: "reject", reason: "bahan habis" });
  const queue = await call<Array<{ ticketNo: string; needsRefund?: boolean }>>(kasir.api, "GET", "/api/pos/partner-orders");
  expect(queue.data.find((row) => row.ticketNo === t5.ticketNo)?.needsRefund).toBe(true);
  const refund5 = await call<{ kind: string; approvalId: string; status: string }>(kasir.api, "POST", `/api/pos/partner-orders/${t5.ticketNo}/refund`, undefined, 201);
  expect(refund5.data.kind).toBe("refund");
  if (refund5.data.status === "pending") await call(manager.api, "PATCH", `/api/approvals/${refund5.data.approvalId}`, { status: "approved" });
  const queueAfter = await call<Array<{ ticketNo: string }>>(kasir.api, "GET", "/api/pos/partner-orders");
  expect(queueAfter.data.find((row) => row.ticketNo === t5.ticketNo)).toBeUndefined();

  // Kasir tidak menerima HPP / profit mitra dari server.
  const kasirView = await call<{ costHidden: boolean; partners: Array<{ garageProfit: number | null; totalCost: number | null; lines: Array<{ unitCost: number | null }> }> }>(kasir.api, "GET", `/api/pos/partner-finance?partnerId=${state.partnerId}`);
  expect(kasirView.data.costHidden).toBe(true);
  expect(kasirView.data.partners[0]).toMatchObject({ garageProfit: null, totalCost: null });
  expect(kasirView.data.partners[0].lines.every((line) => line.unitCost === null)).toBe(true);

  // Hitungan manual dari master: O1 2×, O2 1× (direfund), O3 1× (void setelah siap), O4 batal, O5 ditolak (0).
  const expected = {
    grossSales: 2 * PRICE + 1 * PRICE, // O1 + O2 (O3 void = 0, O4 batal = 0)
    netSales: 2 * PRICE, // refund O2 mengurangi penjualan
    liabilityTotal: 4 * COST, // O1 2 + O2 1 + O3 1 (siap sebelum void)
  };
  const finance = await call<Record<string, number>>(partner.api, "GET", "/api/partner/finance");
  expect(finance.data).toMatchObject(expected);
  const staff = await call<{ partners: Array<Record<string, number>> }>(manager.api, "GET", `/api/pos/partner-finance?partnerId=${state.partnerId}`);
  expect(staff.data.partners[0]).toMatchObject(expected);
  await partner.close();
});

test("UAT-E: settlement → approve → payout parsial & lunas; referensi ganda ditolak; PDF FINAL; isolasi (UAT-18/19/20/22)", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Partner Hub diuji di desktop");
  const owner = await as(browser, "owner@garage.id");
  const manager = await as(browser, "manajer@garage.id");
  const today = todayJakarta();

  const settlement = await call<{ id: string }>(manager.api, "POST", "/api/finance/partner-settlements", { partnerId: state.partnerId, from: today, to: today }, 201);
  const sid = settlement.data.id;
  // Rekap dobel atas baris yang sama ditolak.
  const dup = await manager.api.post("/api/finance/partner-settlements", { data: { partnerId: state.partnerId, from: today, to: today } });
  expect(dup.status()).toBeGreaterThanOrEqual(400);

  // PDF sebelum disetujui = DRAFT.
  const draftPdf = await owner.api.get(`/api/finance/partner-settlements/${sid}/pdf`);
  expect(draftPdf.headers()["content-type"]).toContain("pdf");

  await call(manager.api, "POST", `/api/finance/partner-settlements/${sid}/action`, { action: "submit" });
  // Batal & setujui bersamaan: tepat satu menang.
  const [cancel, approve] = await Promise.all([
    manager.api.post(`/api/finance/partner-settlements/${sid}/action`, { data: { action: "cancel", reason: "uji bersamaan" } }),
    owner.api.post(`/api/finance/partner-settlements/${sid}/action`, { data: { action: "approve" } }),
  ]);
  expect([cancel.ok(), approve.ok()].filter(Boolean), `cancel ${cancel.status()} approve ${approve.status()}`).toHaveLength(1);

  let active = sid;
  if (cancel.ok()) {
    // Batal menang: slot dilepas, rekap ulang lalu setujui.
    const again = await call<{ id: string }>(manager.api, "POST", "/api/finance/partner-settlements", { partnerId: state.partnerId, from: today, to: today }, 201);
    active = again.data.id;
    await call(owner.api, "POST", `/api/finance/partner-settlements/${active}/action`, { action: "approve" });
  }
  const detail = await call<{ settlement: { liabilityTotal: number; status: string } }>(owner.api, "GET", `/api/finance/partner-settlements/${active}`);
  const liability = detail.data.settlement.liabilityTotal;
  expect(liability).toBe(4 * COST);

  // Manajer catat parsial → Owner verifikasi; referensi sama ditolak; Owner lunasi sisanya.
  const half = Math.floor(liability / 2);
  const p1 = await call<{ id: string }>(manager.api, "POST", `/api/finance/partner-settlements/${active}/payments`, {
    amount: half, fundSource: "bank_jago", reference: "TRF-UAT-0001", paidAt: today, idempotencyKey: "uat-payout-0001",
  }, 201);
  await call(owner.api, "POST", `/api/finance/partner-payouts/${p1.data.id}`, { action: "verify" });
  const dupRef = await manager.api.post(`/api/finance/partner-settlements/${active}/payments`, {
    data: { amount: 1_000, fundSource: "bank_jago", reference: "TRF-UAT-0001", paidAt: today, idempotencyKey: "uat-payout-0002" },
  });
  expect(dupRef.status()).toBeGreaterThanOrEqual(400);
  const over = await owner.api.post(`/api/finance/partner-settlements/${active}/payments`, {
    data: { amount: liability, fundSource: "bank_jago", reference: "TRF-UAT-0003", paidAt: today, idempotencyKey: "uat-payout-0003" },
  });
  expect(over.status()).toBeGreaterThanOrEqual(400);
  await call(owner.api, "POST", `/api/finance/partner-settlements/${active}/payments`, {
    amount: liability - half, fundSource: "bank_jago", reference: "TRF-UAT-0004", paidAt: today, idempotencyKey: "uat-payout-0004",
  }, 201);
  const paid = await call<{ settlement: { status: string; paidAmount: number } }>(owner.api, "GET", `/api/finance/partner-settlements/${active}`);
  expect(paid.data.settlement).toMatchObject({ status: "paid", paidAmount: liability });

  // PDF FINAL resmi untuk mitra; mitra lain tidak bisa membuka (UAT-20).
  const partner = await partnerApi(browser, PARTNER_PHONE);
  const finalPdf = await partner.api.get(`/api/partner/settlements/${active}/pdf`);
  expect(finalPdf.status()).toBe(200);
  expect(finalPdf.headers()["content-type"]).toContain("pdf");
  await partner.close();

  const p2 = await call<{ id: string }>(manager.api, "POST", "/api/partners", { code: "DSM", name: "Dimsum Mitra Uji" }, 201);
  state.partner2Id = p2.data.id;
  await call(manager.api, "PATCH", `/api/partners/${state.partner2Id}`, { phone: "081234500002", terms: "Uji isolasi." });
  const bank = await call<{ id: string }>(manager.api, "POST", `/api/partners/${state.partner2Id}/bank-accounts`, { bankName: "BNI", accountName: "Dimsum", accountNumber: "9876543210" }, 201);
  await call(owner.api, "POST", `/api/partners/bank-accounts/${bank.data.id}/verify`);
  await call(manager.api, "POST", `/api/partners/${state.partner2Id}/accounts`, { phone: PARTNER2_PHONE, displayName: "Dimsum", pin: STAFF_PIN }, 201);
  const prod = await call<{ linkId: string }>(manager.api, "POST", `/api/partners/${state.partner2Id}/products`, {
    code: "DSM-001", name: "Dimsum Ayam", category: "Dimsum", variants: [{ variantId: "reg", label: "Regular", unitCost: 22_000, sellPrice: 25_000 }],
  }, 201);
  await call(owner.api, "PATCH", `/api/partners/products/${prod.data.linkId}`, { active: true });
  for (const [to, by] of [["verifikasi", manager], ["disetujui", owner], ["aktif", owner]] as const) {
    await call(by.api, "POST", `/api/partners/${state.partner2Id}/status`, { to, reason: "uji isolasi" });
  }
  const other = await partnerApi(browser, PARTNER2_PHONE);
  expect(other.status).toBe(200);
  expect((await other.api.get(`/api/partner/settlements/${active}/pdf`)).status()).toBe(404);
  const otherTickets = await call<unknown[]>(other.api, "GET", "/api/partner/tickets?scope=history");
  expect(otherTickets.data).toHaveLength(0);
  await other.close();

  // Panel Keuangan Mitra tampil tanpa error/overflow.
  const assertNoErrors = failOnPageErrors(owner.page);
  await owner.page.goto("/partners?tab=finance");
  await expect(owner.page.getByText(/Keuangan Mitra/).first()).toBeVisible({ timeout: 60_000 });
  const overflow = await owner.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  assertNoErrors();
});

test("UAT-F: hub dimatikan → produk mitra hilang, produk Garage tetap jual (UAT-24)", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Partner Hub diuji di desktop");
  const owner = await as(browser, "owner@garage.id");
  const kasir = await as(browser, state.cashierEmail);
  await call(owner.api, "PATCH", "/api/settings", { partnerHubEnabled: false });
  const blocked = await sell(kasir.api, [partnerItem(1)], {}, 400);
  expect(blocked.error?.message ?? "").toMatch(/belum aktif|tidak tersedia/i);
  const normal = await sell(kasir.api, [{ ...state.garageItem, qty: 1 }]);
  expect(normal.orderNo).toMatch(/\w/);
});
