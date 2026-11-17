import { EventFinancePanel } from "@/components/ceo/event-finance/EventFinancePanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlEventFinancePage() {
  return (
    <ControlDashboardRoute next="/control/event-finance">
      <EventFinancePanel />
    </ControlDashboardRoute>
  );
}
