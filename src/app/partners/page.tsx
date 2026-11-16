import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PartnerHubDesk } from "@/components/garage/partner-hub/partner-hub-desk";
import { getAppSettings } from "@/lib/garage-service";
import { canHandleMoney } from "@/lib/role-access";
import { requireGarageSession } from "@/lib/server-auth";
import { staffViewport } from "@/lib/staff-viewport";

export const viewport = staffViewport;

export const metadata: Metadata = {
  title: "Partner Hub · Garage OS",
  description: "Mitra resmi, pesanan, pengantaran, setoran, dan laporan mitra.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
  if (session.response) {
    if (session.response.status === 401) redirect("/login?next=/partners");
    redirect("/os");
  }
  const settings = await getAppSettings(session.data.profile.outlet.id);
  return (
    <PartnerHubDesk
      role={session.data.profile.role}
      userId={session.data.user.id}
      userName={session.data.user.name}
      hubEnabled={settings.partnerHubEnabled}
      sla={{ accept: settings.partnerSlaAcceptWarnMinutes, ready: settings.partnerReadyWaitWarnMinutes }}
      canHandleMoney={canHandleMoney(session.data.profile)}
    />
  );
}
