import { describe, expect, it } from "vitest";

import {
  cleanSponsorPhone,
  dayDiff,
  installmentSchedule,
  isOverdueReminderDay,
  obligationState,
  scheduleProblem,
  sponsorHealth,
  sponsorMoney,
  sponsorReminders,
  unscheduledAmount,
} from "@/lib/event-sponsor-rules";

const plan = [
  { seq: 1, label: "DP", amount: 2_000_000, dueDate: "2026-11-10" },
  { seq: 2, label: "Pelunasan", amount: 3_000_000, dueDate: "2026-12-01" },
];

describe("uang sponsor", () => {
  it("sisa dan kelebihan dihitung dari pembayaran yang tidak dibatalkan", () => {
    expect(sponsorMoney(5_000_000, [2_000_000, 500_000])).toEqual({ agreed: 5_000_000, paid: 2_500_000, remaining: 2_500_000, overpaid: 0 });
    expect(sponsorMoney(1_000_000, [1_200_000])).toMatchObject({ remaining: 0, overpaid: 200_000 });
    expect(sponsorMoney(0, [])).toMatchObject({ paid: 0, remaining: 0 });
  });
});

describe("cicilan", () => {
  it("uang masuk dialokasikan ke cicilan paling awal; status lunas/sebagian/terlambat", () => {
    const view = installmentSchedule(plan, 2_500_000, "2026-11-20");
    expect(view.map((v) => [v.label, v.paidPart, v.remainingPart, v.state])).toEqual([
      ["DP", 2_000_000, 0, "lunas"],
      ["Pelunasan", 500_000, 2_500_000, "sebagian"],
    ]);
  });

  it("belum dibayar lewat jatuh tempo = terlambat dengan jumlah hari; hari H = hari_ini", () => {
    const late = installmentSchedule(plan, 0, "2026-11-13");
    expect(late[0]).toMatchObject({ state: "terlambat", daysLate: 3, remainingPart: 2_000_000 });
    expect(late[1]).toMatchObject({ state: "belum", daysLate: 0 });
    expect(installmentSchedule(plan, 0, "2026-11-10")[0].state).toBe("hari_ini");
  });

  it("urutan input tidak berpengaruh (diurutkan per jatuh tempo)", () => {
    const view = installmentSchedule([...plan].reverse(), 2_000_000, "2026-11-20");
    expect(view[0].label).toBe("DP");
    expect(view[0].state).toBe("lunas");
  });

  it("jadwal tidak boleh melebihi nilai kesepakatan; kurang = sisa belum dijadwalkan", () => {
    expect(scheduleProblem(plan, 5_000_000)).toBeNull();
    expect(scheduleProblem(plan, 4_000_000)).toMatch(/melebihi/);
    expect(scheduleProblem([{ label: "DP", amount: 0, dueDate: "2026-11-10" }], 5_000_000)).toMatch(/lebih dari 0/);
    expect(scheduleProblem([{ label: " ", amount: 10, dueDate: "2026-11-10" }], 5_000_000)).toMatch(/Nama cicilan/);
    expect(scheduleProblem([{ label: "DP", amount: 10, dueDate: "11-10-2026" }], 5_000_000)).toMatch(/Tanggal/);
    expect(unscheduledAmount(plan, 6_000_000)).toBe(1_000_000);
  });
});

describe("kewajiban", () => {
  it("selesai / hari ini / lewat tenggat / tanpa tenggat", () => {
    expect(obligationState({ title: "Logo", dueDate: "2026-11-10", doneAt: "2026-11-09T10:00:00Z" }, "2026-11-20")).toBe("selesai");
    expect(obligationState({ title: "Logo", dueDate: "2026-11-10", doneAt: null }, "2026-11-20")).toBe("terlambat");
    expect(obligationState({ title: "Logo", dueDate: "2026-11-20", doneAt: null }, "2026-11-20")).toBe("hari_ini");
    expect(obligationState({ title: "MC", dueDate: null, doneAt: null }, "2026-11-20")).toBe("belum");
  });
});

describe("pengingat Owner", () => {
  const base = { id: "s1", sponsorNo: "SPN-2611-001", name: "Kopi Nusantara", eventName: "GIGS 2026", status: "aktif" };

  it("H-3, hari H, dan terlambat hari ke-1/3/7 lalu tiap 7 hari (tidak tiap hari)", () => {
    const at = (today: string) => sponsorReminders({ ...base, installments: installmentSchedule(plan, 0, today), obligations: [] }, today).map((r) => r.key);
    expect(at("2026-11-07")).toEqual(["sponsor:s1:inst:seq1:h3"]);
    expect(at("2026-11-10")).toEqual(["sponsor:s1:inst:seq1:h0"]);
    expect(at("2026-11-11")).toEqual(["sponsor:s1:inst:seq1:late1"]);
    expect(at("2026-11-12")).toEqual([]);
    expect([1, 3, 7, 14, 21].every(isOverdueReminderDay)).toBe(true);
    expect([2, 4, 8, 13].some(isOverdueReminderDay)).toBe(false);
  });

  it("cicilan lunas, sponsor selesai/batal → tidak ada pengingat", () => {
    expect(sponsorReminders({ ...base, installments: installmentSchedule(plan, 2_000_000, "2026-11-11"), obligations: [] }, "2026-11-11")).toEqual([]);
    expect(sponsorReminders({ ...base, status: "batal", installments: installmentSchedule(plan, 0, "2026-11-11"), obligations: [] }, "2026-11-11")).toEqual([]);
  });

  it("kewajiban: besok & lewat tenggat; bahasa netral", () => {
    const list = sponsorReminders(
      { ...base, installments: [], obligations: [{ id: "o1", title: "Logo di poster", dueDate: "2026-11-21", doneAt: null }, { id: "o2", title: "Disebut MC", dueDate: "2026-11-17", doneAt: null }] },
      "2026-11-20",
    );
    expect(list.map((r) => r.key)).toEqual(["sponsor:s1:obl:o1:h1", "sponsor:s1:obl:o2:late3"]);
    for (const r of list) expect(`${r.title} ${r.body}`).not.toMatch(/nakal|curang|bohong|menipu|lalai/i);
  });
});

describe("ringkasan", () => {
  it("total dukungan = uang disepakati + nilai barang; jatuh tempo berikutnya", () => {
    const installments = installmentSchedule(plan, 2_000_000, "2026-11-20");
    const health = sponsorHealth({ agreed: 5_000_000, paid: 2_000_000, installments, obligations: [{ title: "Logo", dueDate: "2026-11-15", doneAt: null }], inkindValue: 750_000 }, "2026-11-20");
    expect(health).toMatchObject({ overdueAmount: 0, nextDue: { label: "Pelunasan", amount: 3_000_000 }, obligationsLate: 1, totalSupport: 5_750_000 });
  });

  it("nomor WhatsApp kontak dibersihkan; huruf ditolak", () => {
    expect(cleanSponsorPhone("+62 812-3456-7890")).toBe("081234567890");
    expect(cleanSponsorPhone("")).toBeNull();
    expect(() => cleanSponsorPhone("12")).toThrow(/WhatsApp/);
    expect(dayDiff("2026-12-01", "2026-11-30")).toBe(1);
  });
});
