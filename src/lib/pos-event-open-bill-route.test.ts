import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), accept: vi.fn() }));
vi.mock("@/lib/garage-service", () => ({ createCustomerOrder: mocks.create, updateCustomerOrderStatus: mocks.accept }));
vi.mock("@/lib/server-auth", () => ({
  requireCashierSession: vi.fn(async () => ({ data: { user: { id: "kasir-1" }, profile: { outlet: { id: "outlet-1" } } } })),
}));
import { POST } from "@/app/api/orders/open-bill/route";

const eventId = "2aa9ee27-02b7-41c1-97d4-29aeaa20fdd5";
const entryId = "9f70befd-19b3-4d73-8b8d-c40c342695ad";
const selections = [{ groupId: "rokok", itemId: "rokok-black-matcha", variantId: "regular" }];
let keySeq = 0;
function request(body: object, key: string | null = `pos-bundle-key-${++keySeq}`) {
  return new Request("http://localhost/api/orders/open-bill", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "X-Idempotency-Key": key } : {}) },
    body: JSON.stringify({ orderType: "takeaway", customerName: "Tamu Event", ...body }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ order: { id: "order-1", orderNo: "ORD-1", total: 50_000, tableLabel: "Take away", status: "pending_cashier" } });
});

describe("POS open bill with event bundles", () => {
  it("passes event packages and the idempotency key as the durable checkout key", async () => {
    const response = await POST(request({ eventId, eventItems: [{ entryId, qty: 2, selections }] }, "pos-bundle-fixed-key"));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      eventId, eventItems: [{ entryId, qty: 2, selections }], items: [], clientRequestKey: "pos-bundle-fixed-key", staffOrder: true, allowHiddenItems: true, skipCashierNotify: true,
    }));
    expect(mocks.accept).toHaveBeenCalledWith("order-1", { action: "accept" }, expect.anything(), { openBill: true });
  });

  it("does not re-accept a replayed order that is already accepted", async () => {
    mocks.create.mockResolvedValueOnce({ order: { id: "order-1", orderNo: "ORD-1", total: 50_000, tableLabel: null, status: "accepted" } });
    expect((await POST(request({ eventId, eventItems: [{ entryId, qty: 1, selections }] }))).status).toBe(201);
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("requires an idempotency key, an event id and a nonempty cart", async () => {
    expect((await POST(request({ eventId, eventItems: [{ entryId, qty: 1, selections }] }, null))).status).toBe(400);
    expect((await POST(request({ eventItems: [{ entryId, qty: 1, selections }] }))).status).toBe(400);
    expect((await POST(request({ items: [] }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps the regular open bill unchanged", async () => {
    const items = [{ itemId: "bar-americano", variantId: "cold", qty: 1 }];
    expect((await POST(request({ items }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.not.objectContaining({ eventId: expect.anything() }));
  });
});
