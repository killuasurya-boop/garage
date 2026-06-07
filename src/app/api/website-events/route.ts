import { NextResponse } from "next/server";

// ── Default seeded events (fallback saat belum ada di DB) ──
const DEFAULT_EVENTS = [
  {
    id: "evt-001",
    day: "JUM",
    date: "13 JUN",
    time: "19:00",
    title: "Creative Supper Club",
    tag: "Komunitas",
    desc: "Desainer, builder, dan satu meja panjang. Kopi, makanan, dan kerja bareng.",
    capacity: "30 KURSI",
    rsvpCount: 0,
  },
  {
    id: "evt-002",
    day: "SAB",
    date: "20 JUN",
    time: "20:00",
    title: "Slow Bar — Live Set",
    tag: "Live Musik",
    desc: "Trio akustik. Dua kopi. Satu malam panjang. Hanya untuk yang reservasi.",
    capacity: "40 KURSI",
    rsvpCount: 0,
  },
  {
    id: "evt-003",
    day: "RAB",
    date: "25 JUN",
    time: "18:30",
    title: "Workshop Manual Brew",
    tag: "Workshop",
    desc: "V60, Aeropress, dan sains di balik ekstraksi. Dipandu Head Barista Ardi.",
    capacity: "12 KURSI",
    rsvpCount: 0,
  },
];

export async function GET() {
  try {
    // Coba ambil dari DB (jika seeded)
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/api/admin/events`,
      { cache: "no-store" }
    ).catch(() => null);

    if (res?.ok) {
      const data = await res.json();
      return NextResponse.json({
        events: data.events ?? data,
        source: "db",
      });
    }
  } catch {
    // Fallback ke default
  }

  return NextResponse.json({
    events: DEFAULT_EVENTS,
    source: "default",
  });
}
