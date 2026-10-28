import { describe, expect, it } from "vitest";

import { CHUNK_RELOAD_COOLDOWN_MS, isChunkLoadError, shouldReloadForChunk } from "@/lib/chunk-reload";

describe("chunk-reload (file JS lama hilang setelah deploy)", () => {
  it("mengenali ChunkLoadError dari produksi (Turbopack) & browser lain", () => {
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "Failed to load chunk /_next/static/chunks/37zb90ye2e675.js from module 886404" })).toBe(true);
    expect(isChunkLoadError({ message: "Uncaught ChunkLoadError: Failed to load chunk /_next/static/chunks/3cr_bwg-8wfbm.js" })).toBe(true);
    expect(isChunkLoadError({ name: "TypeError", message: "Failed to fetch dynamically imported module: https://x/_next/a.js" })).toBe(true);
    expect(isChunkLoadError({ message: "Loading chunk app/pos failed." })).toBe(true);
  });

  it("error biasa tidak memicu reload", () => {
    expect(isChunkLoadError({ name: "TypeError", message: "Cannot read properties of undefined (reading 'toLowerCase')" })).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("reload sekali; tidak berulang dalam jeda", () => {
    const now = 1_000_000;
    expect(shouldReloadForChunk(null, now)).toBe(true);
    expect(shouldReloadForChunk(now - 5_000, now)).toBe(false);
    expect(shouldReloadForChunk(now - CHUNK_RELOAD_COOLDOWN_MS - 1, now)).toBe(true);
  });
});
