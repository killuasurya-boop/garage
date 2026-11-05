import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), menuMode: vi.fn() }));
vi.mock("@/lib/garage-service", () => ({ createCustomerOrder: mocks.create, getCustomerOrderData: vi.fn(), getDigitalMenuMode: mocks.menuMode, TableClaimError: class extends Error {} }));
vi.mock("@/lib/server-auth", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/member-auth", () => ({ requireMemberAuth: vi.fn() }));
vi.mock("@/lib/garage-courier", () => ({ sweepUnpaidOrdersLazily: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => null }));
import { POST } from "@/app/api/customer/orders/route";

const eventId = "2aa9ee27-02b7-41c1-97d4-29aeaa20fdd5";
const entryId = "9f70befd-19b3-4d73-8b8d-c40c342695ad";
const regularItem = { itemId: "coffee", variantId: "cold", qty: 1 };
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ order: { id: "order" } }); mocks.menuMode.mockResolvedValue("self_order"); });
function request(body: object, key = "mixed-checkout-12345") {
  return new Request("http://localhost/api/customer/orders", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "X-Idempotency-Key": key } : {}) }, body: JSON.stringify({ orderType: "takeaway", guestName: "Tamu Uji", ...body }) });
}
describe("mixed event checkout request boundary", () => {
  it("accepts regular items and event packages together", async () => {
    const response = await POST(request({ eventId, items: [regularItem], eventItems: [{ entryId, qty: 1 }] }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ eventId, clientRequestKey: "mixed-checkout-12345", items: [regularItem], eventItems: [{ entryId, qty: 1 }] }));
  });
  it("accepts main-menu single items without an explicit eventItems array", async () => {
    expect((await POST(request({ eventId, items: [regularItem] }))).status).toBe(201);
  });
  it("does not expose database queries or customer values when checkout fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.create.mockRejectedValueOnce(new Error("Failed query: update secret_table params: private-value", {
        cause: Object.assign(new Error("Database operation failed"), { code: "23514", constraint: "entry_check", table: "event_menu_entries" }),
      }));
      const response = await POST(request({ eventId, items: [regularItem] }));
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).toContain("Pesanan belum berhasil dibuat");
      expect(text).not.toMatch(/secret_table|private-value|Failed query/);
      expect(log).toHaveBeenCalledWith("Customer order database failure", expect.objectContaining({ code: "23514", constraint: "entry_check" }));
    } finally {
      log.mockRestore();
    }
  });
  it("keeps an uncertain post-commit response retryable with the same durable key", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // The service committed the order but its later invoice update failed.
      mocks.create.mockRejectedValueOnce(new Error("Failed query: update orders set invoice_tracking_token", {
        cause: Object.assign(new Error("Connection interrupted"), { code: "08006" }),
      }));
      const body = { eventId, items: [regularItem] };
      expect((await POST(request(body, "durable-post-commit-key"))).status).toBe(503);
      mocks.create.mockResolvedValueOnce({ order: { id: "already-committed-order" } });
      const retry = await POST(request(body, "durable-post-commit-key"));
      expect(retry.status).toBe(201);
      expect(await retry.text()).toContain("already-committed-order");
      expect(mocks.create.mock.calls.map(([input]) => input.clientRequestKey)).toEqual(["durable-post-commit-key", "durable-post-commit-key"]);
    } finally {
      log.mockRestore();
    }
  });
  it("requires a durable key and a nonempty combined cart", async () => {
    expect((await POST(request({ eventId, items: [regularItem] }, ""))).status).toBe(400);
    expect((await POST(request({ eventId, items: [], eventItems: [] }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects unscoped event packages and combined selections above the limit", async () => {
    expect((await POST(request({ items: [regularItem], eventItems: [{ entryId, qty: 1 }] }))).status).toBe(400);
    expect((await POST(request({ eventId, items: Array.from({ length: 40 }, () => regularItem), eventItems: [{ entryId, qty: 1 }] }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("mode Daftar Pilihan (waiter_list): checkout pelanggan ditolak 403 tanpa membuat pesanan", async () => {
    mocks.menuMode.mockResolvedValue("waiter_list");
    const response = await POST(request({ items: [regularItem] }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("DIGITAL_MENU_VIEW_ONLY");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
