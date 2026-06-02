import CashClosingPage from "@/app/control/_dashboard/cash-closing/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlCashClosingPage() {
  return (
    <ControlDashboardRoute next="/control/cash-closing">
      <CashClosingPage />
    </ControlDashboardRoute>
  );
}
