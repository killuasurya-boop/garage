import { LineupPanel, type LineupTab } from "@/components/ceo/lineup/LineupPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS: LineupTab[] = ["lineup", "rundown", "panitia", "tugas", "konsumsi"];

export default async function ControlLineupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Tautan notifikasi: /control/lineup?eventId=…&tab=tugas (atau ?event=nama untuk data lama)
  const event = typeof params.event === "string" && params.event.trim() ? params.event.trim().slice(0, 120) : null;
  const eventId = typeof params.eventId === "string" && /^[0-9a-f-]{36}$/i.test(params.eventId) ? params.eventId : null;
  const tab = TABS.find((t) => t === params.tab) ?? "lineup";
  return (
    <ControlDashboardRoute next="/control/lineup">
      <LineupPanel initialEvent={event} initialEventId={eventId} initialTab={tab} />
    </ControlDashboardRoute>
  );
}
