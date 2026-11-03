import { describe, expect, it } from "vitest";

import {
  busyExtraByStation,
  DEFAULT_SLA_CONFIG,
  menuTargetMinutes,
  normalizeSlaConfig,
  parsePrepMinutes,
  slaStateOf,
} from "@/lib/production-sla";

const NOW = new Date("2026-11-03T19:00:00+07:00").getTime();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const base = { targetMinutes: 10, createdAt: ago(1), acceptedAt: null, readyAt: null };

describe("S1 — target per menu dari waktu siap (prep)", () => {
  it("membaca format prep", () => {
    expect(parsePrepMinutes("4m")).toBe(4);
    expect(parsePrepMinutes("12 menit")).toBe(12);
    expect(parsePrepMinutes("8")).toBe(8);
    expect(parsePrepMinutes("")).toBeNull();
    expect(parsePrepMinutes("cepat")).toBeNull();
    expect(parsePrepMinutes("0m")).toBeNull();
  });

  it("target tiket = menu terlama; tanpa data → null (pakai target station)", () => {
    expect(menuTargetMinutes([{ prep: "3m" }, { prep: "12m" }, { prep: "5m" }])).toBe(12);
    expect(menuTargetMinutes([{ prep: null }, { prep: "x" }])).toBeNull();
  });
});

describe("S2 + S3 — tahap & peringatan dini", () => {
  it("MULAI: belum dimulai lewat batas → peringatan, sebelum target produksi habis", () => {
    expect(slaStateOf({ ...base, status: "queue", createdAt: ago(1) }, NOW)).toMatchObject({ stage: "mulai", level: "ok" });
    expect(slaStateOf({ ...base, status: "queue", createdAt: ago(4) }, NOW)).toMatchObject({
      stage: "mulai",
      level: "warn",
      message: "Belum dimulai 4 mnt",
    });
  });

  it("PRODUKSI: 'Telat dalam n mnt' sebelum lewat, 'Lewat n mnt' sesudahnya", () => {
    expect(slaStateOf({ ...base, status: "cooking", createdAt: ago(3) }, NOW).level).toBe("ok");
    expect(slaStateOf({ ...base, status: "cooking", createdAt: ago(8) }, NOW)).toMatchObject({
      stage: "produksi",
      level: "warn",
      message: "Telat dalam 2 mnt",
    });
    expect(slaStateOf({ ...base, status: "cooking", createdAt: ago(13) }, NOW)).toMatchObject({
      level: "critical",
      message: "Lewat 3 mnt",
    });
  });

  it("ANTAR: dihitung sejak SIAP; pickup memakai kata 'diambil'", () => {
    expect(slaStateOf({ ...base, status: "ready", readyAt: ago(2) }, NOW)).toMatchObject({ stage: "antar", level: "ok" });
    expect(slaStateOf({ ...base, status: "ready", readyAt: ago(4) }, NOW)).toMatchObject({ level: "warn", message: "Segera antar" });
    expect(slaStateOf({ ...base, status: "ready", readyAt: ago(7) }, NOW)).toMatchObject({
      level: "critical",
      message: "Belum diantar 7 mnt",
    });
    expect(slaStateOf({ ...base, status: "ready", readyAt: ago(7) }, NOW, DEFAULT_SLA_CONFIG, { pickup: true }).message).toBe(
      "Belum diambil 7 mnt",
    );
  });

  it("tiket selesai tidak pernah merah", () => {
    expect(slaStateOf({ ...base, status: "delivered", createdAt: ago(60) }, NOW)).toMatchObject({ stage: "selesai", level: "ok" });
  });
});

describe("S4 — mode ramai", () => {
  it("antrean station ≥ batas → target tampilan +X menit (per station)", () => {
    const tickets = [
      ...Array.from({ length: 8 }, () => ({ status: "queue", station: "Bar" as const })),
      { status: "cooking", station: "Food" as const },
    ];
    expect(busyExtraByStation(tickets)).toEqual({ Bar: 3, Food: 0 });
    expect(busyExtraByStation(tickets, { ...DEFAULT_SLA_CONFIG, busyThreshold: 0 })).toEqual({ Bar: 0, Food: 0 });
  });

  it("tambahan ramai menunda status telat", () => {
    const t = { ...base, status: "cooking", createdAt: ago(11) };
    expect(slaStateOf(t, NOW).level).toBe("critical");
    expect(slaStateOf(t, NOW, DEFAULT_SLA_CONFIG, { busyExtraMinutes: 3 })).toMatchObject({
      level: "warn",
      effectiveTargetMinutes: 13,
    });
  });

  it("pengaturan rusak kembali ke default", () => {
    expect(normalizeSlaConfig({ startTargetMinutes: -1, busyExtraMinutes: 99 } as never)).toEqual(DEFAULT_SLA_CONFIG);
  });
});
