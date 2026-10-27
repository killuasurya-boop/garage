import { describe, expect, it } from "vitest";

import { ayaMoodFor, ayaRemindersFor } from "@/lib/aya-reminders";
import type { OpsCenterData } from "@/lib/ops-center-types";

type Alert = OpsCenterData["alerts"][number];
const alert = (id: string, source: Alert["source"], severity: Alert["severity"] = "warning"): Alert => ({
  id,
  source,
  severity,
  title: id,
  description: `${id} desc`,
  actionModule: source === "serving" ? "waiter" : source === "stok" ? "inventory" : "kitchen",
  actionLabel: "Buka",
});

const data: Pick<OpsCenterData, "alerts" | "canOperate"> = {
  alerts: [
    alert("low-stock", "stok", "info"),
    alert("sla-over-Bar", "produksi", "critical"),
    alert("sla-risk-Food", "produksi"),
    alert("ready-delay", "serving"),
    alert("batch-available", "batch", "info"),
  ],
  canOperate: { Bar: true, Food: false },
};

describe("pengingat Aya per divisi", () => {
  it("Owner/Manajer melihat semua, urut dari yang paling genting", () => {
    const ids = ayaRemindersFor({ role: "Manajer" }, data, 10).map((r) => r.id);
    expect(ids[0]).toBe("sla-over-Bar");
    expect(ids).toHaveLength(5);
  });

  it("waiter hanya serving", () => {
    expect(ayaRemindersFor({ role: "Waiter" }, data).map((r) => r.id)).toEqual(["ready-delay"]);
  });

  it("staf Bar: produksi stasiunnya + stok/batch, bukan alert Dapur atau serving", () => {
    const ids = ayaRemindersFor({ role: "Kasir", workstation: "bar" }, data, 10).map((r) => r.id);
    expect(ids).toEqual(["sla-over-Bar", "low-stock", "batch-available"]);
  });

  it("kasir depan: serving + produksi", () => {
    const ids = ayaRemindersFor({ role: "Kasir" }, data, 10).map((r) => r.id);
    expect(ids).toEqual(["sla-over-Bar", "ready-delay"]);
  });

  it("ekspresi mengikuti keadaan", () => {
    expect(ayaMoodFor(ayaRemindersFor({ role: "Owner" }, data))).toBe("alert");
    expect(ayaMoodFor(ayaRemindersFor({ role: "Waiter" }, data))).toBe("thinking");
    expect(ayaMoodFor([])).toBe("happy");
  });
});
