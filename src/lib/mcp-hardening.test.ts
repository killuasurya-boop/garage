import { describe, expect, it, vi } from "vitest";

import { AgentToolError } from "@/lib/agent-tool-core";
import { toolFailure } from "@/lib/agent-mcp";
import { inFlightCount, withConcurrencySlot, withReadTimeout } from "@/lib/mcp-load-guard";

// Blueprint V3 §6.4 (error terstruktur) & AC-08 (gateway tidak membebani POS).

describe("toolFailure — error MCP terstruktur", () => {
  it("AgentToolError → kode, pesan, request id, retryable, langkah pemulihan", () => {
    const f = toolFailure(new AgentToolError("CONFIRMATION_EXPIRED", "Konfirmasi kedaluwarsa."), "req_1");
    expect(f).toEqual({
      code: "CONFIRMATION_EXPIRED",
      message: "Konfirmasi kedaluwarsa.",
      requestId: "req_1",
      retryable: false,
      recovery: expect.stringContaining("preview ulang"),
    });
    expect(toolFailure(new AgentToolError("RATE_LIMITED", "x", 429), "req_2").retryable).toBe(true);
    expect(toolFailure(new AgentToolError("CONCURRENCY_LIMIT", "x", 429), "req_3").retryable).toBe(true);
  });

  it("error tak terduga TIDAK membocorkan detail internal (SQL, stack) ke ChatGPT", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const f = toolFailure(new Error('relation "cash_ledger_entries" violates check constraint ... at Pool.query'), "req_9");
    expect(f.code).toBe("EXECUTION_FAILED");
    expect(f.message).toBe("Tool gagal dijalankan (ref req_9).");
    expect(JSON.stringify(f)).not.toMatch(/relation|constraint|Pool/);
    expect(f.recovery).toMatch(/status_operasi/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("penolakan aturan bisnis (code HURUF_BESAR + status 4xx) diteruskan; kode Postgres/jaringan tetap disembunyikan", () => {
    class DomainError extends Error {
      constructor(public code: string, message: string, public status = 400) {
        super(message);
      }
    }
    expect(toolFailure(new DomainError("PRICE_BELOW_COST", "Harga jual Regular di bawah HPP mitra."), "r1")).toMatchObject({
      code: "PRICE_BELOW_COST",
      message: "Harga jual Regular di bawah HPP mitra.",
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toolFailure(new DomainError("23505", "duplicate key value"), "r2").code).toBe("EXECUTION_FAILED");
    expect(toolFailure(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }), "r3").code).toBe("EXECUTION_FAILED");
    expect(toolFailure(new DomainError("BAD", 'insert into "x" violates constraint y'), "r4").code).toBe("EXECUTION_FAILED");
    expect(toolFailure(new DomainError("SERVER_DOWN", "Gagal", 500), "r5").code).toBe("EXECUTION_FAILED");
    spy.mockRestore();
  });
});

describe("mcp-load-guard", () => {
  it("maks N panggilan bersamaan per Owner; slot dilepas walau gagal; Owner lain tidak terpengaruh", async () => {
    let release: () => void = () => undefined;
    const blocker = new Promise<void>((resolve) => (release = resolve));
    const running = [1, 2].map(() => withConcurrencySlot("owner:a", () => blocker, 2));
    expect(inFlightCount("owner:a")).toBe(2);
    await expect(withConcurrencySlot("owner:a", async () => "x", 2)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT", status: 429 });
    await expect(withConcurrencySlot("owner:b", async () => "ok", 2)).resolves.toBe("ok");
    release();
    await Promise.all(running);
    expect(inFlightCount("owner:a")).toBe(0);
    await expect(withConcurrencySlot("owner:a", async () => { throw new Error("boom"); }, 2)).rejects.toThrow("boom");
    expect(inFlightCount("owner:a")).toBe(0);
  });

  it("timeout hanya untuk tool baca; tool tulis tidak pernah dipotong", async () => {
    vi.useFakeTimers();
    try {
      const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve("selesai"), 60_000));
      const read = withReadTimeout(false, slow, 25_000);
      const readExpect = expect(read).rejects.toMatchObject({ code: "EXECUTION_TIMEOUT" });
      const write = withReadTimeout(true, slow, 25_000);
      await vi.advanceTimersByTimeAsync(25_001);
      await readExpect;
      await vi.advanceTimersByTimeAsync(40_000);
      await expect(write).resolves.toBe("selesai");
    } finally {
      vi.useRealTimers();
    }
  });
});
