import { SponsorsPanel } from "@/components/ceo/sponsors/SponsorsPanel";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ControlSponsorsPage() {
  return (
    <ControlDashboardRoute next="/control/sponsors">
      <SponsorsPanel />
    </ControlDashboardRoute>
  );
}
