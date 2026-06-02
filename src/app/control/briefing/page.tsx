import BriefingPage from "@/app/control/_dashboard/briefing/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlBriefingPage() {
  return (
    <ControlDashboardRoute next="/control/briefing">
      <BriefingPage />
    </ControlDashboardRoute>
  );
}
