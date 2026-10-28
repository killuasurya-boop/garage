import { DesignSystemGallery } from "@/components/ds/design-system-gallery";
import { ControlDashboardRoute } from "@/components/ceo/layout/ControlDashboardRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// U1 — registri hidup design system (Owner).
export default function ControlDesignSystemPage() {
  return (
    <ControlDashboardRoute next="/control/design-system">
      <DesignSystemGallery />
    </ControlDashboardRoute>
  );
}
