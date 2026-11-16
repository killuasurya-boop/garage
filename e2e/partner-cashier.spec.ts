import { expect, test, type APIRequestContext } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// =============================================================================
// Alur kasir pesanan mitra (Owner 16 Nov 2026) — penjaga regresi permanen di release-check:
// mitra uji sendiri (kode KSR) → pesanan take away QRIS oleh Owner tanpa shift (tidak menyentuh laci/shift spec lain)
// → mitra siap (staf a.n. mitra) → layar Pesanan Mitra: "Serahkan ke pelanggan" → tab "Selesai hari ini"
// → Keuangan Mitra: kartu "Cek silang laporan shift" menunjukkan pesanan di luar shift.
// Di akhir: mitra uji dibekukan & Partner Hub dimatikan lagi supaya spec lain tidak terpengaruh.
// =============================================================================

test.describe.configure({ mode: "serial" });

async function call<T = unknown>(api: APIRequestContext, method: string, url: string, body?: unknown, expectStatus?: number) {
  const res = await api.fetch(url, { method, data: body, headers: { "content-type": "application/json" } });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } };
  if (expectStatus !== undefined) expect(res.status(), `${method} ${url}: ${JSON.stringify(json)}`).toBe(expectStatus);
  else expect(res.ok(), `${method} ${url}: ${res.status()} ${JSON.stringify(json)}`).toBeTruthy();
  return json.data as T;
}

test("Pesanan mitra take away: siap → Serahkan ke pelanggan → Selesai hari ini; cek silang shift", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Partner Hub diuji di desktop");
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await context.newPage();
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  const api = context.request;
  let partnerId = "";
  try {
    // Jam layanan dikosongkan: alur ini tidak boleh bergantung pada jam berapa tes dijalankan.
    await call(api, "PATCH", "/api/settings", { partnerHubEnabled: true, partnerServiceOpen: "", partnerServiceClose: "" });
    const partner = await call<{ id: string }>(api, "POST", "/api/partners", { code: "KSR", name: "Mitra Uji Kasir", phone: "081277700991", handoverPoint: "Meja serah-terima kasir" }, 201);
    partnerId = partner.id;
    await call(api, "PATCH", `/api/partners/${partnerId}`, { terms: "Harga & serah-terima sesuai kesepakatan tertulis." });
    const bank = await call<{ id: string }>(api, "POST", `/api/partners/${partnerId}/bank-accounts`, { bankName: "BCA", accountName: "Mitra Uji", accountNumber: "9876500991" }, 201);
    await call(api, "POST", `/api/partners/bank-accounts/${bank.id}/verify`);
    await call(api, "POST", `/api/partners/${partnerId}/accounts`, { phone: "081277700992", displayName: "Akun Mitra Uji", pin: "975310" }, 201);
    const product = await call<{ linkId: string; menuItemId: string }>(
      api,
      "POST",
      `/api/partners/${partnerId}/products`,
      { code: "KSR-001", name: "Roti Uji Mitra", category: "Roti Mitra", variants: [{ variantId: "reg", label: "Regular", unitCost: 15_000, sellPrice: 20_000 }] },
      201,
    );
    await call(api, "PATCH", `/api/partners/products/${product.linkId}`, { active: true });
    for (const to of ["verifikasi", "disetujui", "aktif"]) await call(api, "POST", `/api/partners/${partnerId}/status`, { to, reason: "uji alur kasir" });
    await call(api, "POST", `/api/partners/${partnerId}/operational`, { status: "buka" });

    // Owner tanpa shift boleh menjual non-tunai (mode Owner): tidak membuka/menutup laci.
    const order = await call<{ orderNo: string }>(api, "POST", "/api/orders", {
      orderType: "takeaway",
      paymentMethod: "QRIS",
      paymentReference: `E2EKSR${Date.now().toString().slice(-8)}`,
      guestName: "Tamu E2E Mitra",
      items: [{ itemId: product.menuItemId, variantId: "reg", qty: 2 }],
    });
    const tickets = await call<Array<{ ticketNo: string; orderNo: string; status: string }>>(api, "GET", "/api/pos/partner-orders");
    const ticket = tickets.find((row) => row.orderNo === order.orderNo);
    expect(ticket, "tiket mitra dibuat untuk pesanan").toBeTruthy();

    // Belum siap → server menolak serah terima (mitra tidak pernah dilompati).
    await call(api, "POST", `/api/pos/partner-orders/${ticket!.ticketNo}/handover`, undefined, 409);
    await call(api, "POST", `/api/partners/tickets/${ticket!.ticketNo}/action`, { action: "accept" });
    await call(api, "POST", `/api/partners/tickets/${ticket!.ticketNo}/action`, { action: "ready" });

    await page.goto("/partners?tab=orders");
    const card = page.getByTestId("partner-order-card").filter({ hasText: order.orderNo });
    await expect(card).toBeVisible({ timeout: 90_000 });
    await expect(card.getByText("Siap", { exact: false }).first()).toBeVisible();
    await card.getByRole("button", { name: "Serahkan ke pelanggan" }).click();
    await expect(page.getByText(`${order.orderNo} (Mitra Uji Kasir) sudah diserahkan ke pelanggan.`)).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Selesai hari ini" }).click();
    const done = page.getByTestId("partner-order-card").filter({ hasText: order.orderNo });
    await expect(done).toBeVisible({ timeout: 60_000 });
    await expect(done.getByText("Diserahkan").first()).toBeVisible();

    // Keuangan Mitra: pesanan Owner tanpa shift tidak masuk laporan shift mana pun → tampil di cek silang.
    await page.goto("/partners?tab=finance");
    const coverage = page.getByTestId("partner-shift-coverage");
    await expect(coverage).toBeVisible({ timeout: 90_000 });
    await expect(coverage.getByText(order.orderNo)).toBeVisible();
    assertNoErrors();
  } finally {
    if (partnerId) await call(api, "POST", `/api/partners/${partnerId}/status`, { to: "dibekukan", reason: "selesai uji alur kasir" }).catch(() => undefined);
    await call(api, "PATCH", "/api/settings", { partnerHubEnabled: false }).catch(() => undefined);
    await context.close();
  }
});
