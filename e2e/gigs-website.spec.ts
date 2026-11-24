import { expect, test, type Locator, type Page } from "@playwright/test";

import { startFakeGigsPlatform } from "./fake-gigs-platform";
import { failOnPageErrors, login } from "./helpers";

// Lineup & Sponsor → website (Owner 17 Nov 2026): impor lineup dari platform GIGS, kustom kartu talent (tagline, logo,
// Instagram), sponsor tampil di "Didukung oleh" dengan logo & Instagram, lalu cek beranda desktop + HP.
// Platform GIGS = server palsu lokal (e2e/fake-gigs-platform.ts) dengan judul event = master event seed.

// PNG 8×8 merah — cukup untuk lolos kompresi webp di server.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC",
  "base64",
);

async function masterEvent(page: Page) {
  const res = await page.request.get("/api/event-finance");
  expect(res.ok(), await res.text()).toBeTruthy();
  const event = (await res.json()).data.event as { id: string; title: string } | null;
  expect(event, "butuh minimal satu master event (seed Grand Opening)").toBeTruthy();
  return event!;
}

/** File unggahan harus bisa diunduh (200 image/*) DAN tampil di kartu (gambar lazy → di-scroll dulu). */
async function expectImageLoads(page: Page, img: Locator, label: string) {
  const src = await img.getAttribute("src");
  expect(src, `${label}: src`).toBeTruthy();
  const res = await page.request.get(src!);
  expect(res.status(), `${label}: ${src} harus bisa diakses`).toBe(200);
  expect(res.headers()["content-type"] ?? "").toMatch(/^image\//);
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `${label} tampil` }).toBe(true);
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "halaman tidak boleh bergeser ke samping").toBeLessThanOrEqual(1);
}

test("Lineup & Sponsor: impor platform → kustom talent & sponsor → tampil di beranda", async ({ page }) => {
  test.setTimeout(600_000);
  const check = failOnPageErrors(page);
  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  const band = `Lost Side ${tag}`;
  const comic = `Komika ${tag}`;
  const ig = `lostside.e2e${tag.toLowerCase()}`;
  const sponsorName = `Desain E2E ${tag}`;
  const sponsorIg = `desain.e2e${tag.toLowerCase()}`;

  await login(page, "owner@garage.id");
  const event = await masterEvent(page);
  const platform = startFakeGigsPlatform({
    slug: `gigs-e2e-${tag.toLowerCase()}`,
    name: event.title,
    lineup: [
      { name: band, type: "band" },
      { name: comic, type: "komika" },
    ],
  });
  await platform.listen();
  try {
    // 1) Impor dari platform GIGS (UI).
    await page.goto(`/control/lineup?eventId=${event.id}`);
    await expect(page.getByRole("heading", { name: "Lineup & Panitia" })).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: /Impor dari platform GIGS/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Impor dari" })).toContainText("2 penampil baru", { timeout: 60_000 });
    const card = page.locator("li").filter({ has: page.getByText(band, { exact: true }) });
    await expect(card).toBeVisible();
    await expect(page.locator("li").filter({ has: page.getByText(comic, { exact: true }) })).toContainText("Terkonfirmasi");

    // Impor ulang tidak membuat duplikat.
    await page.getByRole("button", { name: /Impor dari platform GIGS/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Impor dari" })).toContainText("sudah ada, tidak diubah", { timeout: 60_000 });
    await expect(page.getByText(band, { exact: true })).toHaveCount(1);

    // 2) Kustom kartu talent: tagline, Instagram (tautan penuh dirapikan), unggah logo.
    await card.getByRole("button", { name: "Ubah" }).click();
    const dialog = page.getByRole("dialog", { name: `Ubah ${band}` });
    await dialog.getByLabel("Tagline (baris kecil di bawah nama)").fill("Heavy / Metallic Roster");
    await dialog.getByLabel("Instagram").fill(`https://www.instagram.com/${ig}/`);
    await dialog.getByLabel(`Pilih logo ${band}`).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByRole("button", { name: /Ganti logo/ })).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expect(card).toContainText("Heavy / Metallic Roster");
    await expect(card.getByRole("link", { name: `@${ig}` })).toHaveAttribute("href", `https://www.instagram.com/${ig}/`);

    // Instagram salah ditolak dengan pesan jelas (bukan error mentah).
    const board = (await (await page.request.get(`/api/event-lineup?eventId=${event.id}`)).json()).data;
    const imported = board.performers.find((p: { name: string }) => p.name === band);
    const badIg = await page.request.patch(`/api/event-lineup/performers/${imported.id}`, { data: { instagram: "akun salah!" } });
    expect(badIg.status()).toBe(400);
    expect((await badIg.json()).error.code).toBe("INVALID_INSTAGRAM");

    // 3) Sponsor: data dasar via API, logo via UI di detail sponsor.
    const created = await page.request.post("/api/sponsors", {
      data: { eventId: event.id, eventName: event.title, name: sponsorName, packageName: "Gold", agreedAmount: 2_500_000, instagram: `@${sponsorIg}`, showOnWebsite: true },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const badLink = await page.request.patch(`/api/sponsors/${(await created.json()).data.id}`, { data: { websiteUrl: "javascript:alert(1)" } });
    expect(badLink.status()).toBe(400);
    await page.goto("/control/sponsors");
    await page.getByRole("list", { name: "Daftar sponsor" }).getByText(sponsorName).click();
    const drawer = page.getByRole("dialog", { name: sponsorName });
    await drawer.getByLabel(`Pilih logo ${sponsorName}`).setInputFiles({ name: "brand.png", mimeType: "image/png", buffer: PNG });
    await expect(drawer.getByRole("button", { name: /Ganti logo/ })).toBeVisible({ timeout: 60_000 });
    await expect(drawer).toContainText("tampil di website");

    // 4) Beranda: kartu talent (tagline + logo + Instagram) dan "Didukung oleh" (logo + Instagram, tanpa nilai uang).
    await page.goto("/");
    const gigs = page.getByTestId("home-gigs-spotlight");
    await expect(gigs).toBeVisible({ timeout: 90_000 });
    const bandCard = gigs.locator("li").filter({ hasText: band });
    await expect(bandCard).toContainText("Heavy / Metallic Roster");
    await expect(bandCard.getByRole("link", { name: new RegExp(`Instagram ${band}`) })).toHaveAttribute("href", `https://www.instagram.com/${ig}/`);
    const bandLogo = bandCard.getByRole("img", { name: `Logo ${band}` });
    await expect(bandLogo).toHaveAttribute("src", /\/garage-uploads\/event-lineup\//);
    await expectImageLoads(page, bandLogo, "logo talent");

    const partners = page.getByTestId("home-gigs-partners");
    await expect(partners).toBeVisible();
    const sponsorLink = partners.getByRole("link").filter({ hasText: sponsorName });
    await expect(sponsorLink).toHaveAttribute("href", `https://www.instagram.com/${sponsorIg}/`);
    await expect(sponsorLink).toContainText("Gold");
    const sponsorLogo = sponsorLink.getByRole("img", { name: `Logo ${sponsorName}` });
    await expectImageLoads(page, sponsorLogo, "logo sponsor");
    await expect(partners).not.toContainText("2.500.000");
    await noHorizontalOverflow(page);
    check();
  } finally {
    await platform.close();
  }
});

test("Beranda HP: kartu lineup & sponsor tidak terpotong / tidak bergeser @mobile", async ({ page }) => {
  test.setTimeout(400_000);
  const check = failOnPageErrors(page);
  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  await login(page, "owner@garage.id");
  const event = await masterEvent(page);
  const longName = `Band Nama Panjang Sekali ${tag}`;
  // SATU pintu (Owner 18 Nov 2026): lineup Garage OS dipakai beranda DAN halaman event; slot dashboard platform tidak.
  const slotName = `Slot Baru ${tag}`;
  const platform = startFakeGigsPlatform({
    slug: `gigs-hp-${tag.toLowerCase()}`,
    name: event.title,
    lineup: [{ name: longName, type: "band" }],
    slots: [{ name: slotName, category: "band", startTime: "20:00", durationMin: 30 }],
  });
  await platform.listen();
  try {
    const imported = await page.request.post("/api/event-lineup/import-platform", { data: { eventId: event.id } });
    expect(imported.ok(), await imported.text()).toBeTruthy();
    const sponsor = await page.request.post("/api/sponsors", {
      data: { eventId: event.id, eventName: event.title, name: `Sponsor Dengan Nama Sangat Panjang ${tag}`, agreedAmount: 0, showOnWebsite: true },
    });
    expect(sponsor.ok(), await sponsor.text()).toBeTruthy();

    await page.goto("/");
    const gigs = page.getByTestId("home-gigs-spotlight");
    await expect(gigs).toBeVisible({ timeout: 90_000 });
    await expect(gigs.getByText(longName)).toBeVisible();
    await expect(gigs).not.toContainText(slotName);

    // Halaman event platform (Caddy → Garage OS): isi lineup = lineup Garage OS yang sama dengan beranda.
    const eventLineup = await page.request.get(`/api/public/gigs/gigs-hp-${tag.toLowerCase()}/lineup`);
    expect(eventLineup.ok(), await eventLineup.text()).toBeTruthy();
    const { slots } = (await eventLineup.json()) as { slots: Array<{ performer: string }> };
    expect(slots.map((slot) => slot.performer)).toContain(longName);
    expect(slots.map((slot) => slot.performer)).not.toContain(slotName);

    // app.js halaman event lewat Garage OS: kartu lineup baru langsung dimunculkan + SURAU → SURAI.
    const appJs = await page.request.get(`/api/public/gigs/gigs-hp-${tag.toLowerCase()}/app-js`);
    expect(appJs.ok(), await appJs.text()).toBeTruthy();
    expect(appJs.headers()["content-type"]).toContain("javascript");
    const js = await appJs.text();
    expect(js).toContain("setupRevealObserver();");
    expect(js).toContain("name: 'SURAI'");
    expect(js).not.toContain("SURAU");
    await expect(page.getByTestId("home-gigs-partners").getByText(`Sponsor Dengan Nama Sangat Panjang ${tag}`)).toBeVisible();
    await noHorizontalOverflow(page);
    check();
  } finally {
    await platform.close();
  }
});

test("Kontrol Event: satu bar menautkan semua menu event dengan event yang sama", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Owner diuji di desktop");
  test.setTimeout(400_000);
  const check = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  const event = await masterEvent(page);
  await page.goto(`/control/lineup?eventId=${event.id}`);
  const nav = page.getByRole("navigation", { name: "Kontrol event" });
  await expect(nav.getByRole("link", { name: /Lineup & Panitia/ })).toHaveAttribute("aria-current", "page", { timeout: 90_000 });
  // Tautan membawa event yang sama sejak awal (tidak menunggu papan lineup selesai dimuat).
  await expect(nav.getByRole("link", { name: /Keuangan Event/ })).toHaveAttribute("href", `/control/event-finance?eventId=${event.id}`);

  await nav.getByRole("link", { name: /Keuangan Event/ }).click();
  await expect(page).toHaveURL(new RegExp(`/control/event-finance\\?eventId=${event.id}`));
  await expect(page.getByRole("heading", { name: "Keuangan Event" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("heading", { name: event.title, exact: false }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Kontrol event" }).getByRole("link", { name: /Keuangan Event/ })).toHaveAttribute("aria-current", "page");

  await page.getByRole("navigation", { name: "Kontrol event" }).getByRole("link", { name: /Hari-H/ }).click();
  await expect(page).toHaveURL(new RegExp(`/event-day\\?event=${event.id}`));
  await expect(page.getByRole("heading", { name: "Hari-H Event" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("navigation", { name: "Kontrol event" }).getByRole("link", { name: /Sponsor/ })).toHaveAttribute("href", "/control/sponsors");
  check();
});

test("Keuangan Event: impor RAB dari platform GIGS jadi pos anggaran (cadangan dilewati)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Owner diuji di desktop");
  test.setTimeout(400_000);
  const check = failOnPageErrors(page);
  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  await login(page, "owner@garage.id");
  const event = await masterEvent(page);
  const platform = startFakeGigsPlatform({
    slug: `gigs-rab-${tag.toLowerCase()}`,
    name: event.title,
    lineup: [],
    budget: [
      { code: "01", name: `Sound E2E ${tag}`, budget: 10_000_000, purpose: "Sewa sound system", pic: "Rafly" },
      { code: "02", name: `MC E2E ${tag}`, budget: 1_200_000, purpose: "Honor 2 MC" },
      { code: "03", name: "Save Money", budget: 1_500_000, purpose: "Simpanan cadangan, bukan biaya." },
    ],
  });
  await platform.listen();
  try {
    await page.goto(`/control/event-finance?eventId=${event.id}`);
    await expect(page.getByRole("heading", { name: "Keuangan Event" })).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: /Impor RAB dari platform GIGS/ }).click();
    const notice = page.getByRole("status").filter({ hasText: "RAB dari" });
    await expect(notice).toContainText("2 pos baru", { timeout: 60_000 });
    await expect(notice).toContainText("Save Money");
    const table = page.locator("table");
    await expect(table.getByText(`Sound E2E ${tag}`)).toBeVisible();
    await expect(table.getByText(`MC E2E ${tag}`)).toBeVisible();
    await expect(table.getByText("Save Money")).toHaveCount(0);
  } finally {
    await platform.close();
  }
  check();
});

test("Tempel daftar talent (UI) + Ruang Panitia: akun waiter ditautkan sebagai ketua", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Owner diuji di desktop");
  test.setTimeout(500_000);
  const check = failOnPageErrors(page);
  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  await login(page, "owner@garage.id");
  const event = await masterEvent(page);

  // 1) Tempel daftar talent lewat layar Lineup.
  await page.goto(`/control/lineup?eventId=${event.id}`);
  await expect(page.getByRole("heading", { name: "Lineup & Panitia" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Tempel daftar" }).click();
  const dialog = page.getByRole("dialog", { name: /Tempel daftar talent/ });
  await dialog.getByLabel("Tempel di sini").fill(`Nama\tJenis\tTagline\tInstagram\tJam\tDurasi\nTempel Band ${tag}\tband\tPop Punk\t@tempel${tag.toLowerCase()}\t23.00\t30\nKomika ${tag}\tkomika\t\t\t23:30\t20`);
  await expect(dialog.getByRole("status")).toContainText("2 baris siap disimpan");
  await dialog.getByRole("button", { name: /Simpan 2 baris/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tempel daftar" })).toContainText("2 tersimpan", { timeout: 60_000 });
  await expect(page.getByText(`Tempel Band ${tag}`, { exact: true })).toBeVisible();

  // 2) Owner menautkan akun waiter sebagai Ketua Panitia + satu tugas untuknya (API).
  const board = (await (await page.request.get(`/api/event-lineup?eventId=${event.id}`)).json()).data;
  const waiter = board.accounts.find((a: { email: string }) => a.email === "waiter@garage.id");
  expect(waiter, "akun seed waiter@garage.id").toBeTruthy();
  const crew = await page.request.post("/api/event-lineup/crew", { data: { eventId: event.id, eventName: event.title, name: `Ketua ${tag}`, role: "ketua", userId: waiter.userId } });
  expect(crew.ok(), await crew.text()).toBeTruthy();
  const crewId = (await crew.json()).data.id;
  const task = await page.request.post("/api/event-lineup/tasks", { data: { eventId: event.id, eventName: event.title, title: `Konfirmasi sound ${tag}`, crewId } });
  expect(task.ok(), await task.text()).toBeTruthy();

  // 3) Login sebagai waiter → Ruang Panitia: event terlihat, tugas bisa diselesaikan, tanpa ringkasan uang? (ketua: ada).
  const ctx = await browser.newContext();
  const wp = await ctx.newPage();
  const wcheck = failOnPageErrors(wp);
  await login(wp, "waiter@garage.id");
  // Shell /os waiter masih memuat & bisa berpindah sendiri; tunggu tenang dulu agar navigasi ke /panitia tidak terpotong.
  await wp.waitForLoadState("networkidle").catch(() => null);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await wp.goto("/panitia");
      break;
    } catch (error) {
      if (attempt >= 2 || !String(error).includes("ERR_ABORTED")) throw error;
      await wp.waitForTimeout(2_000);
    }
  }
  const ws = wp.getByTestId("panitia-workspace");
  await expect(ws.getByRole("heading", { name: "Ruang Panitia" })).toBeVisible({ timeout: 90_000 });
  const section = ws.getByRole("region", { name: event.title });
  // Jabatan akun ini (daftar "Jabatan Anda"); teks yang sama juga muncul di tabel rekap konsumsi.
  await expect(section.getByRole("list", { name: "Jabatan Anda" }).getByText("Ketua Panitia", { exact: true })).toBeVisible();
  // Talent muncul di rundown (nama yang sama juga ada di tabel rekap konsumsi).
  await expect(section.getByRole("list", { name: "Rundown" }).getByText(`Tempel Band ${tag}`, { exact: true })).toBeVisible();
  const taskCard = section.locator("li").filter({ hasText: `Konfirmasi sound ${tag}` });
  await taskCard.getByRole("button", { name: "Selesai" }).click();
  await expect(taskCard.getByRole("button", { name: "Selesai" })).toBeDisabled({ timeout: 30_000 });
  await expect(section.getByText("Ringkasan anggaran")).toBeVisible();
  // Waiter tidak bisa membuka papan Owner.
  const forbidden = await wp.request.get(`/api/event-lineup?eventId=${event.id}`);
  expect(forbidden.status()).toBe(403);
  wcheck();
  await ctx.close();
  check();
});

test("Peran Panitia: akun hanya bisa membuka Ruang Panitia (kasir, menu, data kafe ditolak)", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Owner diuji di desktop");
  test.setTimeout(500_000);
  const check = failOnPageErrors(page);
  const tag = Math.random().toString(36).slice(2, 7).toLowerCase();
  const email = `panitia.${tag}@garage.id`;
  const password = `Panitia-${tag}-E2E!`;
  await login(page, "owner@garage.id");
  const event = await masterEvent(page);

  // Owner membuat akun peran Panitia lewat Kelola Staff (API yang sama dengan layar).
  const list = (await (await page.request.get("/api/admin/users?limit=5")).json()).data;
  const rows = (list.users ?? list.items ?? list.rows ?? list) as Array<{ outletId: string }>;
  const created = await page.request.post("/api/admin/users", {
    data: { email, name: `Panitia ${tag}`, password, role: "Panitia", outletId: rows[0].outletId, requirePasswordChange: false },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const board = (await (await page.request.get(`/api/event-lineup?eventId=${event.id}`)).json()).data;
  const account = board.accounts.find((a: { email: string }) => a.email === email);
  expect(account?.role).toBe("Panitia");
  const crew = await page.request.post("/api/event-lineup/crew", { data: { eventId: event.id, eventName: event.title, name: `Sekretaris ${tag}`, role: "sekretaris", userId: account.userId } });
  expect(crew.ok(), await crew.text()).toBeTruthy();

  // Login sebagai Panitia: mendarat di Ruang Panitia, bukan aplikasi kasir.
  const ctx = await browser.newContext();
  const pp = await ctx.newPage();
  const pcheck = failOnPageErrors(pp);
  await pp.goto("/login?next=/panitia");
  await pp.getByPlaceholder("nama@garage.id").fill(email);
  await pp.getByPlaceholder("Masukkan password").fill(password);
  await pp.getByRole("button", { name: /^Masuk$/ }).click();
  await expect(pp).toHaveURL(/\/panitia$/, { timeout: 90_000 });
  const ws = pp.getByTestId("panitia-workspace");
  await expect(ws.getByRole("region", { name: event.title }).getByRole("list", { name: "Jabatan Anda" }).getByText("Sekretaris", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(ws.getByRole("button", { name: "Tambah tugas" })).toBeVisible();

  // Aplikasi kafe dialihkan ke Ruang Panitia; API kafe ditolak terpusat.
  await pp.goto("/os?module=pos");
  await expect(pp).toHaveURL(/\/panitia$/, { timeout: 60_000 });
  for (const url of ["/api/event-lineup?eventId=" + event.id, "/api/sponsors", "/api/admin/users", "/api/event-finance"]) {
    const res = await pp.request.get(url);
    expect(res.status(), url).toBe(403);
  }
  pcheck();
  await ctx.close();
  check();
});

test("Pendaftaran & transparansi lewat Garage OS (satu pintu, Owner 18 Nov 2026)", async ({ page }) => {
  test.setTimeout(300_000);
  const check = failOnPageErrors(page);
  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  await login(page, "owner@garage.id");
  const event = await masterEvent(page);
  const slug = `gigs-satu-${tag.toLowerCase()}`;
  const platform = startFakeGigsPlatform({ slug, name: event.title, lineup: [], budget: [{ code: "01", name: "Sound", budget: 2_000_000 }] });
  await platform.listen();
  try {
    // Form halaman event (daftar.js) → /event/<slug>/api/public/register → Caddy → Garage.
    const band = `Band Website ${tag}`;
    const reg = await page.request.post(`/api/public/gigs/${slug}/register`, {
      data: { type: "creator", name: band, pic: "Rudi", whatsapp: "081234567890", instagram: "@bandweb", description: "", consent: true, category: "band", members: 4, portfolio: "", tech: "", diet: "" },
    });
    expect(reg.ok(), await reg.text()).toBeTruthy();
    const { id, code } = (await reg.json()) as { id: string; code: string };
    const look = await page.request.post(`/api/public/gigs/${slug}/registration/lookup`, { data: { id, code } });
    expect((await look.json()) as { status: string }).toMatchObject({ status: "diajukan", published: false });
    const wrong = await page.request.post(`/api/public/gigs/${slug}/registration/lookup`, { data: { id, code: "000000000000" } });
    expect(wrong.status()).toBe(403);

    // Owner menyetujui di layar Pendaftar → langsung jadi penampil & tampil di website.
    await page.goto(`/control/registrations?eventId=${event.id}`);
    const card = page.getByRole("listitem", { name: band });
    await expect(card).toBeVisible({ timeout: 60_000 });
    await card.getByRole("button", { name: /Setujui/ }).click();
    await expect(card).toBeHidden({ timeout: 30_000 });
    const after = await page.request.post(`/api/public/gigs/${slug}/registration/lookup`, { data: { id, code } });
    expect(await after.json()).toMatchObject({ status: "disetujui", published: true });

    // Transparansi: isi dari platform, tambah dana masuk, tampilkan, simpan → config & ringkasan halaman event berubah.
    await page.goto(`/control/event-transparency?eventId=${event.id}`);
    await page.getByRole("button", { name: /Isi dari angka platform/ }).click();
    await expect(page.getByRole("status")).toContainText("Angka platform dimuat");
    await page.getByLabel("Target dana").fill("5.000.000");
    await page.getByRole("button", { name: /Tambah dana masuk/ }).click();
    await page.getByLabel("Dari (nama sponsor/donatur, boleh kosong)").fill("Kopi Sponsor");
    await page.getByRole("region", { name: /Dana masuk/ }).getByLabel("Jumlah").fill("750000");
    await page.getByRole("checkbox", { name: /Tampilkan angka ini/ }).check();
    await page.getByRole("button", { name: /^Simpan$/ }).first().click();
    await expect(page.getByRole("status")).toContainText("sekarang tampil");
    const config = await (await page.request.get(`/api/public/gigs/${slug}/config`)).json();
    expect(config).toMatchObject({ open: true, finance: { target: 5_000_000, budgetLines: [{ code: "01", name: "Sound", budget: 2_000_000 }] } });
    const summary = await (await page.request.get(`/api/public/gigs/${slug}/sponsor-summary`)).json();
    expect(summary).toMatchObject({ verified_amount: 750_000, income_history: [{ sponsor: "Kopi Sponsor", amount: 750_000 }] });

    // Peserta (kreator disetujui), kesiapan (data Garage) & laporan akhir (belum terbit → null) untuk halaman event.
    const participants = await (await page.request.get(`/api/public/gigs/${slug}/participants`)).json();
    expect(participants.creators.map((c: { name: string }) => c.name)).toContain(band);
    const readiness = await (await page.request.get(`/api/public/gigs/${slug}/readiness`)).json();
    expect(readiness).toMatchObject({ gates: [{ gate: "A" }, { gate: "B", done: 3, total: 3 }, { gate: "C" }] });
    expect(typeof readiness.total).toBe("number");
    expect(await (await page.request.get(`/api/public/gigs/${slug}/closeout`)).json()).toEqual({ closeout: null });
    await noHorizontalOverflow(page);
    check();
  } finally {
    await platform.close();
  }
});
