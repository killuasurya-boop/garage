import { describe, expect, it } from "vitest";

import {
  classifySyncResponse,
  isRetryDue,
  makeOfflineNo,
  OFFLINE_MAX_AGE_MS,
  OFFLINE_MAX_ORDERS,
  offlineSaleBlockReason,
  retryDelayMs,
} from "@/lib/pos-offline-rules";

// POS Fase 4 (owner 25 Nov 2026): batas 50 penjualan / 8 jam, sinkron tidak pernah dobel / tidak membuang data.

describe("batas penjualan offline", () => {
  const now = Date.UTC(2026, 10, 25, 10, 0, 0);
  it("boleh selama < 50 tertunda dan tertua < 8 jam", () => {
    expect(offlineSaleBlockReason([], now)).toBeNull();
    expect(offlineSaleBlockReason([{ createdAt: now - 60_000, status: "pending" }], now)).toBeNull();
  });

  it("50 penjualan tertunda → diblok", () => {
    const queue = Array.from({ length: OFFLINE_MAX_ORDERS }, () => ({ createdAt: now - 1000, status: "pending" }));
    expect(offlineSaleBlockReason(queue, now)).toMatch(/penuh/);
  });

  it("tertua ≥ 8 jam → diblok (termasuk yang perlu ditinjau)", () => {
    expect(offlineSaleBlockReason([{ createdAt: now - OFFLINE_MAX_AGE_MS, status: "failed", permanent: true }], now)).toMatch(/8 jam/);
  });
});

describe("klasifikasi sinkron", () => {
  it("2xx sukses; jaringan/5xx/409 biasa diulang; kunci beda isi & shift tutup permanen", () => {
    expect(classifySyncResponse(201)).toBe("synced");
    expect(classifySyncResponse(200)).toBe("synced");
    expect(classifySyncResponse(0)).toBe("retry");
    expect(classifySyncResponse(503)).toBe("retry");
    expect(classifySyncResponse(409, "ORDER_IN_PROGRESS")).toBe("retry");
    expect(classifySyncResponse(409, "IDEMPOTENCY_MISMATCH")).toBe("permanent");
    expect(classifySyncResponse(400, "OFFLINE_SHIFT_CLOSED")).toBe("permanent");
    expect(classifySyncResponse(400, "VALIDATION_ERROR")).toBe("permanent");
  });

  it("backoff bertahap, maks 10 menit", () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(20)).toBe(600_000);
    expect(isRetryDue({ attempts: 2, updatedAt: 0 }, 59_999)).toBe(false);
    expect(isRetryDue({ attempts: 2, updatedAt: 0 }, 60_000)).toBe(true);
  });
});

describe("nomor sementara", () => {
  it("OFF-<perangkat>-<urut 4 digit>, cocok dengan pola server", () => {
    expect(makeOfflineNo("Kasir-1", 7)).toBe("OFF-KASIR1-0007");
    expect(makeOfflineNo("", 12)).toBe("OFF-POS-0012");
    expect(/^OFF-[A-Z0-9-]{3,40}$/.test(makeOfflineNo("Kasir Depan #2", 1234))).toBe(true);
  });
});
