import { expect, test, type Page } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// Topbar POS saat paling sibuk (Nov 2026): pesanan QR menunggu, tagihan belum bayar, chat belum dibaca, tiket
// Bar/Dapur aktif, nama kasir sangat panjang. Tidak boleh overflow horizontal / terpotong di 390–1366 px.
// Hitungan di-stub lewat page.route (tanpa menulis data); tidak ada logika uang yang disentuh.
test.describe.configure({ mode: "serial" });

const LONG_NAME = "Maria Fransiska Anggraeni Kusumawardhani Pratiwi";
const SHOT_DIR = process.env.POS_TOPBAR_SHOT_DIR;

function stubOrder(index: number) {
  return {
    id: `stub-order-${index}`,
    orderNo: `QR-STUB-${String(index).padStart(3, "0")}`,
    queueNo: index,
    tableLabel: `Meja ${index}`,
    channel: "QR Table",
    status: "pending_cashier",
    orderSource: "qr_table",
    customerMode: "guest",
    customerName: `Tamu ${index}`,
    customerPhone: null,
    customerNote: null,
    campaign: null,
    fulfillment: "dine-in",
    whatsappInvoiceStatus: "not_sent",
    whatsappInvoiceUrl: null,
    invoicePdfUrl: null,
    invoiceWebUrl: null,
    invoicePdfGeneratedAt: null,
    subtotal: 25_000,
    service: 0,
    tax: 0,
    discount: 0,
    total: 25_000,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    paymentMethod: "QRIS",
    paymentProvider: null,
    paymentReference: null,
    paymentStatus: "pending",
    invoiceNo: null,
    items: [],
  };
}

async function stubBusyState(page: Page) {
  const orders = Array.from({ length: 12 }, (_, i) => stubOrder(i + 1));
  await page.route((url) => url.pathname === "/api/customer/orders", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { data: orders } }) : route.continue(),
  );
  await page.route((url) => url.pathname === "/api/pos/chat", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: {
            data: {
              threads: [
                {
                  id: "stub-thread",
                  tableLabel: "Meja 1",
                  orderId: null,
                  orderNo: null,
                  orderStatus: null,
                  fulfillment: null,
                  deliveryStatus: null,
                  total: null,
                  status: "open",
                  unread: true,
                  unreadCount: 7,
                  lastMessageAt: new Date().toISOString(),
                  preview: "Halo",
                  lastSender: "customer",
                },
              ],
            },
          },
        })
      : route.continue(),
  );
}

/** Nama panjang lewat endpoint profil Better Auth (sesi aktif); dipulihkan di akhir tes agar spec lain tidak terpengaruh. */
async function setDisplayName(page: Page, name: string) {
  const res = await page.request.post("/api/auth/update-user", { data: { name }, headers: { origin: new URL(page.url()).origin } });
  expect(res.ok(), `update-user ${res.status()}`).toBe(true);
}

async function openPos(page: Page, email: string, owner: boolean, loggedIn = false) {
  if (loggedIn) await page.goto("/pos");
  else await login(page, email);
  await expect(page).toHaveURL(/\/pos/);
  const start = page.getByRole("button", { name: "Mulai Shift Kasir" });
  const surface = page.locator("section.cashier-pos-surface[data-pos-v6]");
  await expect(start.or(surface).or(page.getByTestId("pos-owner-view")).first()).toBeVisible({ timeout: 90_000 });
  if (owner) {
    await page.getByTestId("pos-owner-view").first().click();
  } else if (await start.isVisible().catch(() => false)) {
    await start.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Rp 100.000" }).click();
    await dialog.getByRole("button", { name: "Mulai Shift & Buka POS" }).click();
  }
  await expect(surface).toBeVisible({ timeout: 90_000 });
}

async function expectTopbarFits(page: Page, width: number, label: string, longName = true) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 768 });
  const topbar = page.locator(".pos-v6-topbar").first();
  await expect(topbar).toBeVisible();
  // Chip busy-state benar-benar tampil (stub efektif), bukan lolos karena kosong.
  await expect(page.getByTestId("pos-topbar-qr")).toBeVisible();
  await expect(page.getByTestId("pos-topbar-tagih")).toBeVisible();
  await expect(page.getByTestId("pos-qc-open")).toBeVisible();
  // Status shift: chip di topbar ≥ 640 px; di HP titik di avatar profil.
  await expect(width >= 640 ? page.getByTestId("pos-topbar-shift") : page.locator(".pos-v6-profile-shift")).toBeVisible();
  await expect(page.locator(".pos-v6-profile").first()).toBeVisible();
  if (longName) await expect(page.locator(".pos-v6-profile").first()).toHaveAttribute("aria-label", new RegExp(LONG_NAME));
  await page.waitForTimeout(400);

  const result = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bar = document.querySelector(".pos-v6-topbar") as HTMLElement;
    const rects = (sel: string) => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.getClientRects().length > 0);
      return el ? el.getBoundingClientRect() : null;
    };
    const must = [vw >= 640 ? "[data-testid=pos-topbar-shift]" : ".pos-v6-profile-shift", "[data-testid=pos-qc-open]", "[data-testid=pos-topbar-qr]", "[data-testid=pos-topbar-tagih]", ".pos-v6-profile", "[data-testid=pos-menu-open]"];
    const outside: string[] = [];
    for (const sel of must) {
      const r = rects(sel);
      if (sel.includes("pos-menu-open") && !r) continue; // kiosk ≥1280: Menu ada di sidebar
      if (!r) outside.push(`${sel}: tidak terlihat`);
      else if (r.left < -0.5 || r.right > vw + 0.5) outside.push(`${sel}: ${Math.round(r.left)}..${Math.round(r.right)} dari ${vw}`);
    }
    // Tidak ada anak langsung topbar yang saling menimpa.
    const kids = Array.from(bar.children).filter((c) => (c as HTMLElement).getClientRects().length > 0).map((c) => (c as HTMLElement).getBoundingClientRect());
    let overlap = false;
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i], b = kids[j];
      if (a.width > 0 && b.width > 0 && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap = true;
    }
    // Tombol/chip di grup aksi tidak boleh saling menimpa (mis. badge Suara di atas tombol Layar penuh).
    const btns = Array.from(bar.querySelectorAll<HTMLElement>(".pos-v6-actions button, .pos-v6-status button")).filter((b) => b.getClientRects().length > 0);
    const boxes = btns.map((b) => ({ n: b.getAttribute("data-testid") || b.getAttribute("aria-label") || b.className, r: b.getBoundingClientRect() }));
    const buttonOverlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) buttonOverlaps.push(`${boxes[i].n} x ${boxes[j].n}`);
    }
    return {
      buttonOverlaps,
      pageOverflow: document.documentElement.scrollWidth - vw,
      barOverflow: bar.scrollWidth - bar.clientWidth,
      height: bar.getBoundingClientRect().height,
      outside,
      overlap,
    };
  });
  const tag = `${label} @${width}`;
  expect(result.pageOverflow, `${tag}: overflow halaman`).toBeLessThanOrEqual(0);
  expect(result.barOverflow, `${tag}: overflow topbar`).toBeLessThanOrEqual(0);
  expect(result.outside, `${tag}: tombol wajib di luar layar`).toEqual([]);
  expect(result.buttonOverlaps, `${tag}: tombol saling menimpa`).toEqual([]);
  expect(result.overlap, `${tag}: elemen topbar saling menimpa`).toBe(false);
  // Busy: satu baris ≤ 64 px mulai 1024; di bawahnya boleh membungkus (jaring pengaman), tetapi tidak overflow.
  if (width >= 1024) expect(result.height, `${tag}: topbar satu baris ≤ 64px`).toBeLessThanOrEqual(64);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${label}-${width}.png`, clip: { x: 0, y: 0, width, height: 150 } });
}

for (const [label, email, owner] of [
  ["kasir", "kasir2@garage.id", false],
  ["owner", "owner@garage.id", true],
] as const) {
  test(`POS topbar sibuk (${label}): tanpa overflow di 390/768/1024/1279/1366`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1366", "viewport diatur manual di proyek desktop");
    const assertNoErrors = failOnPageErrors(page);
    await stubBusyState(page);
    await login(page, email);
    const original = (await (await page.request.get("/api/me")).json()).data.user.name as string;
    await setDisplayName(page, LONG_NAME);
    try {
      await openPos(page, email, owner, true);
      for (const width of [1366, 1279, 1024, 768, 390]) await expectTopbarFits(page, width, label);
      assertNoErrors();
    } finally {
      await setDisplayName(page, original);
    }
  });
}

test("POS topbar sibuk @mobile: Menu tampil di HP dan membuka lembar Menu (2 klik)", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-390", "hanya proyek mobile");
  await stubBusyState(page);
  await openPos(page, "kasir2@garage.id", false);
  await expectTopbarFits(page, 390, "kasir-mobile", false);
  await page.getByTestId("pos-menu-open").click();
  await expect(page.getByTestId("pos-menu-sheet").or(page.getByRole("dialog").filter({ hasText: "Laporan & riwayat" })).first()).toBeVisible();
});

test("POS topbar normal (tanpa antrean): satu baris di 390/768/1024 dan Menu selalu ada di bawah 1280", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "viewport diatur manual di proyek desktop");
  await openPos(page, "kasir2@garage.id", false);
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 768 });
    await page.waitForTimeout(400);
    const bar = await page.locator(".pos-v6-topbar").first().boundingBox();
    expect(bar && bar.height, `topbar normal @${width} satu baris`).toBeLessThanOrEqual(64);
    await expect(page.getByTestId("pos-menu-open"), `Menu @${width}`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/normal-${width}.png`, clip: { x: 0, y: 0, width, height: 150 } });
  }
});
