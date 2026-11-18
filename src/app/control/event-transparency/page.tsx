import { TransparencyPanel } from "@/components/ceo/transparency/TransparencyPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ControlEventTransparencyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const eventId = typeof params.eventId === "string" && /^[0-9a-f-]{36}$/i.test(params.eventId) ? params.eventId : null;
  return (
    <ControlDashboardRoute next="/control/event-transparency">
      <TransparencyPanel initialEventId={eventId} />
    </ControlDashboardRoute>
  );
}
