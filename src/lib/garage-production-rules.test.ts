import { describe, expect, it } from "vitest";

import {
  allocationCoverage,
  buildBatchSuggestions,
  canHandoverStation,
  canOperateStation,
  isDirectHandoverMenu,
  productionIdentityName,
  productionStationFor,
  type BatchCandidateItem,
} from "@/lib/garage-production-rules";

// =============================================================================
// Production Hub — aturan murni: auto routing (BR-04), hak READY per
// workstation (BR-07/08), Smart Batch (BR-05/§8.3) dan coverage (BR-06).
// =============================================================================

function item(partial: Partial<BatchCandidateItem> & { id: string; ticketNo: string }): BatchCandidateItem {
  return {
    station: "Food",
    menuItemId: "itm-indomie",
    variantId: "reg",
    itemName: "Indomie",
    variantLabel: "Regular",
    qty: 1,
    note: null,
    batchEligible: true,
    customerName: "RIZI",
    tableLabel: "M10",
    orderNo: "G101",
    createdAt: "2026-09-28T10:00:00.000Z",
    ...partial,
  };
}

describe("auto routing dari master produk", () => {
  it.each([
    [{ category: "Coffee" }, "Bar"],
    [{ category: "Non-Coffee" }, "Bar"],
    [{ category: "Makanan" }, "Food"],
    [{ category: "Cemilan" }, "Food"],
    [{ category: "Cemilan", station: "bar" }, "Bar"],
    [{ category: "Coffee", station: "dapur" }, "Food"],
  ])("%o → %s", (menu, expected) => {
    expect(productionStationFor(menu)).toBe(expected);
  });
});

describe("hak workstation (producer owns READY)", () => {
  it("Owner & Manajer selalu boleh (override)", () => {
    expect(canOperateStation("Owner", null, "Bar")).toBe(true);
    expect(canOperateStation("Manajer", null, "Food")).toBe(true);
  });

  it("Waiter tidak pernah boleh, apa pun workstation-nya", () => {
    expect(canOperateStation("Waiter", "all", "Bar")).toBe(false);
  });

  it("Kasir POS (tanpa workstation) boleh semua station; barista/koki hanya workstation-nya", () => {
    expect(canOperateStation("Kasir", null, "Bar")).toBe(true);
    expect(canOperateStation("Kasir", null, "Food")).toBe(true);
    expect(canOperateStation("Kasir", "bar", "Bar")).toBe(true);
    expect(canOperateStation("Kasir", "bar", "Food")).toBe(false);
    expect(canOperateStation("Kasir", "dapur", "Food")).toBe(true);
    expect(canOperateStation("Kasir", "all", "Food")).toBe(true);
  });
});

describe("helper serah-terima", () => {
  it("helper hanya ACC di station-nya dan tidak boleh produksi", () => {
    expect(canHandoverStation("Kasir", "helper_bar", "Bar")).toBe(true);
    expect(canHandoverStation("Kasir", "helper_bar", "Food")).toBe(false);
    expect(canHandoverStation("Kasir", "helper_all", "Food")).toBe(true);
    expect(canOperateStation("Kasir", "helper_all", "Bar")).toBe(false);
  });

  it("workstation produksi & kasir POS boleh ACC; waiter tidak", () => {
    expect(canHandoverStation("Kasir", "dapur", "Food")).toBe(true);
    expect(canHandoverStation("Kasir", null, "Food")).toBe(true);
    expect(canHandoverStation("Waiter", "helper_all", "Bar")).toBe(false);
    expect(canHandoverStation("Manajer", null, "Bar")).toBe(true);
  });
});

describe("Smart Batch", () => {
  it("menggabung produk sama lintas order tanpa menggabung identitas", () => {
    const suggestions = buildBatchSuggestions(
      [
        item({ id: "a", ticketNo: "K1", customerName: "RIZI", tableLabel: "M10" }),
        item({ id: "b", ticketNo: "K2", customerName: "JAPANIS", tableLabel: "M12", createdAt: "2026-09-28T10:00:30.000Z" }),
        item({ id: "c", ticketNo: "K3", customerName: "ANDI", tableLabel: "M15", qty: 2, createdAt: "2026-09-28T10:01:00.000Z" }),
      ],
      { windowSec: 120 },
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].totalQty).toBe(4);
    expect(suggestions[0].items.map((row) => row.customerName)).toEqual(["RIZI", "JAPANIS", "ANDI"]);
  });

  it("catatan produksi berbeda dipisah jadi sub-batch", () => {
    const suggestions = buildBatchSuggestions(
      [
        item({ id: "a", ticketNo: "K1", note: "Pedas" }),
        item({ id: "b", ticketNo: "K2", note: "pedas " }),
        item({ id: "c", ticketNo: "K3", note: "Telur 1/2 matang" }),
      ],
      { windowSec: 120 },
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].items.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("porsi di luar batch window tidak digabung", () => {
    const suggestions = buildBatchSuggestions(
      [
        item({ id: "a", ticketNo: "K1", createdAt: "2026-09-28T10:00:00.000Z" }),
        item({ id: "b", ticketNo: "K2", createdAt: "2026-09-28T10:05:00.000Z" }),
      ],
      { windowSec: 120 },
    );
    expect(suggestions).toHaveLength(0);
  });

  it("window 0 = tanpa batas", () => {
    const suggestions = buildBatchSuggestions(
      [
        item({ id: "a", ticketNo: "K1", createdAt: "2026-09-28T10:00:00.000Z" }),
        item({ id: "b", ticketNo: "K2", createdAt: "2026-09-28T10:30:00.000Z" }),
      ],
      { windowSec: 0 },
    );
    expect(suggestions).toHaveLength(1);
  });

  it("butuh ≥ 2 tiket berbeda dan produk batch-eligible", () => {
    expect(
      buildBatchSuggestions(
        [item({ id: "a", ticketNo: "K1" }), item({ id: "b", ticketNo: "K1", note: null })],
        { windowSec: 120 },
      ),
    ).toHaveLength(0);
    expect(
      buildBatchSuggestions(
        [
          item({ id: "a", ticketNo: "K1", batchEligible: false }),
          item({ id: "b", ticketNo: "K2", batchEligible: false }),
        ],
        { windowSec: 120 },
      ),
    ).toHaveLength(0);
  });

  it("varian berbeda (Hot/Cold) tidak digabung", () => {
    expect(
      buildBatchSuggestions(
        [
          item({ id: "a", ticketNo: "K1", station: "Bar", variantId: "hot" }),
          item({ id: "b", ticketNo: "K2", station: "Bar", variantId: "cold" }),
        ],
        { windowSec: 120 },
      ),
    ).toHaveLength(0);
  });
});

describe("coverage allocation (BR-06)", () => {
  it("complete hanya bila semua porsi ter-allocate", () => {
    const partial = allocationCoverage(
      [
        { qty: 1, allocated: true },
        { qty: 1, allocated: true },
        { qty: 2, allocated: false },
      ],
      4,
    );
    expect(partial).toEqual({ allocatedQty: 2, unallocatedQty: 2, complete: false });
    expect(
      allocationCoverage(
        [
          { qty: 1, allocated: true },
          { qty: 3, allocated: true },
        ],
        4,
      ).complete,
    ).toBe(true);
  });
});

describe("identitas tampil", () => {
  it("pakai nama customer, fallback nomor antrian", () => {
    expect(productionIdentityName("RIZI", 12)).toBe("RIZI");
    expect(productionIdentityName("Guest Customer", 12)).toBe("Antrian #12");
    expect(productionIdentityName(null, null)).toBe("Tamu");
  });
});

describe("produk diserahkan langsung kasir (tanpa tiket)", () => {
  it("Minuman Botol, Rokok & station none tidak masuk Bar/Dapur", () => {
    expect(isDirectHandoverMenu({ category: "Minuman Botol" })).toBe(true);
    expect(isDirectHandoverMenu({ category: "Rokok" })).toBe(true);
    expect(isDirectHandoverMenu({ category: "Makanan", station: "none" })).toBe(true);
    expect(isDirectHandoverMenu({ category: "Non-Coffee" })).toBe(false);
    expect(isDirectHandoverMenu({ category: "Cemilan", station: "dapur" })).toBe(false);
  });
});
