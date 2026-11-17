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
  await page.goto("/control/event-finance");
  await expect(page.getByRole("heading", { name: "Keuangan Event" })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("table").getByText(`Honor E2E ${tag}`)).toBeVisible();

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
  await post(`/api/event-day/slots/${performer.id}`, { action: "undo" });
  check();
});
