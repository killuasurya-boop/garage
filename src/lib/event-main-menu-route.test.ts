import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/event-main-menu-service", () => ({ getMainDigitalMenuSelection: mocks.read, setMainDigitalMenuEvent: mocks.save }));
import { GET, PUT } from "@/app/api/events/main-menu/route";
const outletId="152d3ca4-bc41-40bc-82c6-e2e5ae02890f";
beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ data: { user:{id:"owner",name:"Owner"},profile:{role:"Owner",outlet:{id:outletId}} } }); mocks.read.mockResolvedValue({outletId,eventId:null}); mocks.save.mockResolvedValue({outletId,eventId:null}); });
describe("main menu event API authorization", () => {
  it("denies reads and writes without permission",async()=>{
    mocks.permission.mockResolvedValue({response:new Response(null,{status:403})});
    expect((await GET()).status).toBe(403);
    expect((await PUT(new Request("http://localhost/api/events/main-menu",{method:"PUT"}))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses session outlet and rejects malformed event IDs",async()=>{
    const request=(body:unknown)=>new Request("http://localhost/api/events/main-menu",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    expect((await PUT(request({eventId:"bad"}))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    expect((await PUT(request({eventId:null,outletId:"attacker-outlet"}))).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(null,expect.objectContaining({outletId}));
  });
  it("returns persisted selection from the session outlet",async()=>{
    expect((await GET()).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(outletId);
    expect(mocks.permission).toHaveBeenCalledWith("events:manage");
  });
});
