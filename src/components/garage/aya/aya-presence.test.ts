import { describe, expect, it } from "vitest";

import { AYA_PRESENCES, ayaPresenceReducer, isBlinking, presenceFace, presenceTo2D, talkEnvelope } from "./aya-presence";

describe("AYA presence (10 state animasi)", () => {
  it("punya 10 state dan semuanya punya fallback 2D + wajah 3D", () => {
    expect(AYA_PRESENCES).toHaveLength(10);
    for (const presence of AYA_PRESENCES) {
      expect(presenceTo2D(presence).state).toBeTruthy();
      expect(presenceFace(presence)).toBeTruthy();
    }
  });

  it("state sibuk tidak ditimpa event pasif (tidur/sapa/settle)", () => {
    expect(ayaPresenceReducer("listening", { type: "idleTimeout" })).toBe("listening");
    expect(ayaPresenceReducer("talking", { type: "greet" })).toBe("talking");
    expect(ayaPresenceReducer("thinking", { type: "settle" })).toBe("thinking");
    expect(ayaPresenceReducer("idle", { type: "idleTimeout" })).toBe("sleep");
    expect(ayaPresenceReducer("sleep", { type: "wake" })).toBe("greeting");
  });

  it("jawaban, error, tunjuk, pandu", () => {
    expect(ayaPresenceReducer("thinking", { type: "answer", ok: true })).toBe("happy");
    expect(ayaPresenceReducer("thinking", { type: "answer", ok: false })).toBe("idle");
    expect(ayaPresenceReducer("idle", { type: "error" })).toBe("error");
    expect(ayaPresenceReducer("error", { type: "settle" })).toBe("idle");
    expect(ayaPresenceReducer("happy", { type: "point" })).toBe("pointing");
    expect(ayaPresenceReducer("guide", { type: "guideEnd" })).toBe("happy");
  });

  it("amplop bicara 0..1 dan kedip singkat (tanpa klaim lip-sync)", () => {
    for (let t = 0; t < 5000; t += 37) {
      const v = talkEnvelope(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(isBlinking(0)).toBe(true);
    expect(isBlinking(500)).toBe(false);
  });
});
