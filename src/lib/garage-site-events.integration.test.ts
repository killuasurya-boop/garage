import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Event website diatur owner (berubah-ubah); landing hanya menampilkan event mendatang.
/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

const dateKey = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t);
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Event website", () => {
  it("menyimpan, merapikan, mengurutkan; publik hanya event mendatang", async () => {
    const saved = await svc.saveSiteEvents(
      [
        { title: "Kopdar Malam Minggu", tag: "Kopdar Motor", date: dateKey(7), time: "19:30", desc: "Kumpul", capacity: 40 },
        { title: "Event Lama", tag: "", date: dateKey(-3), time: "19:00", desc: "", capacity: null },
        { title: "Nobar", tag: "Komunitas", date: dateKey(2), time: "20:00", desc: "", capacity: 0 },
        { title: "", date: dateKey(1), time: "10:00" }, // tanpa judul → dibuang
        { title: "Jam rusak", date: dateKey(1), time: "7pm" }, // jam tidak valid → dibuang
      ],
      null,
    );
    expect(saved.map((e: any) => e.title)).toEqual(["Event Lama", "Nobar", "Kopdar Malam Minggu"]);
    expect(saved[0].tag).toBe("Event");
    expect(saved[1].capacity).toBeNull();
    expect(saved.every((e: any) => typeof e.id === "string" && e.id.length > 0)).toBe(true);

    const upcoming = await svc.getSiteEvents({ upcomingOnly: true });
    expect(upcoming.map((e: any) => e.title)).toEqual(["Nobar", "Kopdar Malam Minggu"]);

    const tracking = await svc.getPublicLiveTrackingData();
    expect(tracking.events.map((e: any) => e.title)).toEqual(["Nobar", "Kopdar Malam Minggu"]);
    expect(tracking.events[1]).toMatchObject({ time: "19:30", capacity: 40, reserved: 0 });
  });
});
