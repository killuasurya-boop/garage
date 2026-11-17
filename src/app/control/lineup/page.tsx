import { LineupPanel, type LineupTab } from "@/components/ceo/lineup/LineupPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS: LineupTab[] = ["lineup", "rundown", "panitia", "tugas"];

export default async function ControlLineupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Tautan dari notifikasi pengingat tugas: /control/lineup?event=…&tab=tugas
  const event = typeof params.event === "string" && params.event.trim() ? params.event.trim().slice(0, 120) : null;
  const tab = TABS.find((t) => t === params.tab) ?? "lineup";
  return (
    <ControlDashboardRoute next="/control/lineup">
      <LineupPanel initialEvent={event} initialTab={tab} />
    </ControlDashboardRoute>
  );
}
