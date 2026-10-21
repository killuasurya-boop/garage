import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), menu: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/event-menu-service", async (original) => ({ ...await original<typeof import("@/lib/event-menu-service")>(), getEventMenuData: mocks.menu }));
import { GET } from "@/app/api/events/[id]/menu/route";

const id = "152d3ca4-bc41-40bc-82c6-e2e5ae02890f";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ data: { profile: { outlet: { id } } } });
  mocks.menu.mockResolvedValue({ event: { id }, products: [{ id: "coffee", name: "Kopi Reguler", category: "Coffee" }, { id: "rice", name: "Nasi Reguler", category: "Makanan" }], entries: [
    { id: "one", kind: "item", menuItemId: "coffee", name: "Minuman Event", status: "active", sortOrder: 0, price: 15000 },
    { id: "two", kind: "bundle", name: "Paket Hemat", status: "active", sortOrder: 1, price: 40000, groups: [{ options: [{ itemId: "coffee" }, { itemId: "rice" }] }] },
  ] });
});
async function read(query: string) { return GET(new Request(`http://localhost/api/events/${id}/menu?${query}`), { params: Promise.resolve({ id }) }); }

describe("event menu list filters", () => {
  it("searches referenced product names and paginates the filtered result", async () => {
    const response = await read("q=Kopi%20Reguler&pageSize=1&page=2");
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.entries.map((entry: { id: string }) => entry.id)).toEqual(["two"]);
    expect(json.data.pagination).toMatchObject({ total: 2, page: 2, totalPages: 2 });
  });
  it("filters bundle component category and product on the server", async () => {
    const json = await (await read("category=Makanan&productId=rice")).json();
    expect(json.data.entries.map((entry: { id: string }) => entry.id)).toEqual(["two"]);
  });
  it("returns permission denial without reading the catalog", async () => {
    mocks.permission.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await read("")).status).toBe(403);
    expect(mocks.menu).not.toHaveBeenCalled();
  });
});
