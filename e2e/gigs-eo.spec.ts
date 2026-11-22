import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// GIGS EO (Owner 17 Nov 2026, docs/gigs-eo/00-CHECKLIST.md item 16): alur EO ujung ke ujung di master event pertama.
// Data unik per run (nama acak) supaya aman berbagi DB dengan spec lain; panggung dikembalikan (undo) di akhir.
test("GIGS EO: lineup master → keuangan event → hari-H (check-in, panggung, checklist)", async ({ page }) => {
  test.setTimeout(600_000);
  const check = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  const api = page.request;
  const tag = Math.random().toString(36).slice(2, 7).toUpperCase();
  const post = async (url: string, data: unknown) => {
    const res = await api.post(url, { data });
    expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
    return (await res.json()).data;
  };

  const finance = (await (await api.get("/api/event-finance")).json()).data;
  expect(finance.event, "butuh minimal satu master event (seed Grand Opening)").toBeTruthy();
  const eventId: string = finance.event.id;

  // Lineup memakai master event (nama mengikuti judul master).
  const performer = await post("/api/event-lineup", { eventId, eventName: "nama apa saja", name: `Band E2E ${tag}`, kind: "band", status: "konfirmasi", setStart: "20:00", setMinutes: 30 });
  expect(performer.eventId).toBe(eventId);
  expect(performer.eventName).toBe(finance.event.title);

  // Keuangan event: pos honor + bayar dari uang pribadi Owner (tanpa baris buku kas).
  const line = await post("/api/event-finance", { eventId, category: "honor", title: `Honor E2E ${tag}`, plannedAmount: 750000, performerId: performer.id });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  await post("/api/event-finance/payments", { budgetLineId: line.id, amount: 750000, paidAt: today, source: "external", payee: `Band E2E ${tag}`, idempotencyKey: `e2e-gigs-${tag}-pay` });
  // Kontrak vendor (Owner 20 Nov 2026): kesepakatan per pos, tanpa uang.
  await post("/api/event-finance/contracts", { budgetLineId: line.id, vendor: `Vendor E2E ${tag}`, value: 750000, terms: "Tampil 30 menit" });
  await page.goto("/control/event-finance");
  await expect(page.getByRole("heading", { name: "Keuangan Event" })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("table").getByText(`Honor E2E ${tag}`)).toBeVisible();
  await expect(page.getByText(`Vendor E2E ${tag} · Honor E2E ${tag}`)).toBeVisible();

  // Hari-H: walk-in, panggung mulai lalu undo, checklist operasional.
  await post("/api/event-day/checkins", { eventId, walkInName: `Tamu E2E ${tag}`, pax: 1 });
  await post(`/api/event-day/slots/${performer.id}`, { action: "start" });
  const ops = (await (await api.get(`/api/event-day/ops?eventId=${eventId}`)).json()).data;
  expect(ops.total).toBeGreaterThanOrEqual(10);
  await page.goto(`/event-day?event=${eventId}`);
  await expect(page.getByRole("heading", { name: "Hari-H Event" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(`Tamu E2E ${tag}`)).toBeVisible();
  await page.getByRole("tab", { name: "Panggung" }).click();
  await expect(page.getByText(`Band E2E ${tag}`).first()).toBeVisible();
  await page.getByRole("tab", { name: "Kesiapan" }).click();
  await expect(page.getByText(/Checklist operasional/)).toBeVisible();
  // Log kejadian (Owner 20 Nov 2026): catat dari HP, lalu tandai selesai.
  await page.getByRole("tab", { name: "Kejadian" }).click();
  await page.getByLabel("Apa yang terjadi").fill(`Kabel mic E2E ${tag} lepas`);
  await page.getByRole("button", { name: "Catat kejadian" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kejadian tercatat." })).toBeVisible();
  await expect(page.locator("li").getByText(`Kabel mic E2E ${tag} lepas`)).toBeVisible();
  const incidents = (await (await api.get(`/api/event-day/incidents?eventId=${eventId}`)).json()).data;
  const mine = incidents.items.find((i: { note: string }) => i.note === `Kabel mic E2E ${tag} lepas`);
  await post(`/api/event-day/incidents/${mine.id}/resolve`, { resolution: "Diganti kabel cadangan" });
  await post(`/api/event-day/slots/${performer.id}`, { action: "undo" });

  // Laporan sponsor (#12): saat dicetak isinya tetap terlihat (aturan cetak struk global tidak menyembunyikannya).
  const sponsor = await post("/api/sponsors", { eventId, eventName: finance.event.title, name: `Sponsor E2E ${tag}`, agreedAmount: 1000000 });
  await page.goto(`/control/sponsors/report/${sponsor.id}`);
  await expect(page.getByRole("heading", { name: "Laporan Sponsor" })).toBeVisible({ timeout: 90_000 });
  await page.emulateMedia({ media: "print" });
  const visibility = await page.getByRole("heading", { name: "Laporan Sponsor" }).evaluate((el) => getComputedStyle(el).visibility);
  expect(visibility).toBe("visible");
  await expect(page.getByText(`Sponsor E2E ${tag}`)).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  check();
});

// Meja pintu (Owner 18 Nov 2026): Kasir hanya tab Check-in — cari tamu undangan (nama), masuk, tanpa tombol Batalkan/panggung.
test("Hari-H meja pintu: Kasir cari tamu & check-in, tanpa panggung/batal", async ({ browser }) => {
  test.setTimeout(600_000);
  const tag = Math.random().toString(36).slice(2, 7).toUpperCase();
  const ownerCtx = await browser.newContext();
  const ownerPage = await ownerCtx.newPage();
  await login(ownerPage, "owner@garage.id");
  const finance = (await (await ownerPage.request.get("/api/event-finance")).json()).data;
  const eventId: string = finance.event.id;
  const guestRes = await ownerPage.request.post(`/api/events/${eventId}/guests`, { data: { fullName: `Tamu Pintu ${tag}`, phone: "081277766655", maxPax: 2 } });
  expect(guestRes.ok(), await guestRes.text()).toBeTruthy();
  const invRes = await ownerPage.request.post(`/api/events/${eventId}/invitations`, { data: { guestIds: null } });
  expect(invRes.ok(), await invRes.text()).toBeTruthy();
  await ownerCtx.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const check = failOnPageErrors(page);
  await login(page, "kasir@garage.id");
  // Shell POS kasir masih bernavigasi setelah login → tunggu tenang, lalu buka (ulang sekali bila terputus).
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.goto(`/event-day?event=${eventId}`).catch(() => page.goto(`/event-day?event=${eventId}`));
  await expect(page.getByRole("heading", { name: "Hari-H Event" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("tab", { name: "Panggung" })).toHaveCount(0);
  await page.getByLabel("Cari tamu undangan").fill(`Pintu ${tag}`);
  await page.getByRole("button", { name: "Cari" }).click();
  const results = page.getByTestId("checkin-search-results");
  await expect(results.getByText(`Tamu Pintu ${tag}`)).toBeVisible();
  await expect(results).not.toContainText("081277766655");
  // Ketuk dua kali cepat (sinyal lambat) → tetap satu check-in.
  await results.getByRole("button", { name: /Masuk 1 org/ }).dblclick();
  await expect(page.getByText(`Tamu Pintu ${tag} masuk.`)).toBeVisible();
  await expect(results.getByText(/Sudah masuk 1\/2 org/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Batalkan" })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  check();
  await ctx.close();
});
