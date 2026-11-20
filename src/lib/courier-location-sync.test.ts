import { describe, expect, it } from "vitest";
import { isCourierLocationStale, syncCourierLocations } from "./courier-location-sync";

describe("courier GPS acknowledgements", () => {
  it("never treats rejected updates as sent", async () => {
    expect(await syncCourierLocations(["order"], async () => { throw new Error("offline"); })).toEqual({ failed: 1, acceptedAt: null });
  });
  it("distinguishes partial acknowledgements from complete success", async () => {
    expect(await syncCourierLocations(["a", "b"], async (id) => {
      if (id === "b") throw new Error("order already delivered");
      return { ok: true, at: "2026-11-20T10:00:00Z" };
    })).toEqual({ failed: 1, acceptedAt: Date.parse("2026-11-20T10:00:00Z") });
  });
  it("uses server timestamps and rejects malformed acknowledgements", async () => {
    const result = await syncCourierLocations(["a", "b"], async (id) => ({ ok: true, at: id === "a" ? "2026-11-20T10:00:00Z" : "invalid" }));
    expect(result.failed).toBe(1);
    expect(result.acceptedAt).toBe(Date.parse("2026-11-20T10:00:00Z"));
  });
});

describe("GPS freshness", () => {
  it("marks missing, malformed, and old telemetry as stale", () => {
    const now = Date.parse("2026-11-20T10:00:00Z");
    expect(isCourierLocationStale(null, now)).toBe(true);
    expect(isCourierLocationStale("invalid", now)).toBe(true);
    expect(isCourierLocationStale(now - 90_001, now)).toBe(true);
    expect(isCourierLocationStale(now - 15_000, now)).toBe(false);
  });
});
