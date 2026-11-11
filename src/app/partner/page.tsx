import type { Metadata } from "next";

import { PartnerPortal } from "@/components/garage/partner-hub/partner-portal";

export const metadata: Metadata = {
  title: "Portal Mitra · Garage Coffee",
  description: "Portal khusus mitra resmi Garage Coffee.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PartnerPortalPage() {
  return <PartnerPortal />;
}
