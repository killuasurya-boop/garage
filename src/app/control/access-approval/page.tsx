import { AccessApprovalCenter } from "@/components/ceo/access/AccessApprovalCenter";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlAccessApprovalPage() {
  return (
    <ControlDashboardRoute next="/control/access-approval">
      <AccessApprovalCenter />
    </ControlDashboardRoute>
  );
}
