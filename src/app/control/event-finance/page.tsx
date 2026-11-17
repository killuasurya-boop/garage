import { EventFinancePanel } from "@/components/ceo/event-finance/EventFinancePanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ControlEventFinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Dari bar "Kontrol Event": /control/event-finance?eventId=… membuka event yang sama.
  const eventId = typeof params.eventId === "string" && /^[0-9a-f-]{36}$/i.test(params.eventId) ? params.eventId : null;
  return (
    <ControlDashboardRoute next="/control/event-finance">
      <EventFinancePanel initialEventId={eventId} />
    </ControlDashboardRoute>
  );
}
