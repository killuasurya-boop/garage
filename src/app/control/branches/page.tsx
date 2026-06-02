import BranchesPage from "@/app/control/_dashboard/branches/page";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlBranchesPage() {
  return (
    <ControlDashboardRoute next="/control/branches">
      <BranchesPage />
    </ControlDashboardRoute>
  );
}
