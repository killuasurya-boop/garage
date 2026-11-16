import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EventCheckinPanel } from "@/components/garage/events/event-checkin-panel";
import { requireGarageSession } from "@/lib/server-auth";
import { staffViewport } from "@/lib/staff-viewport";

export const viewport = staffViewport;
export const metadata: Metadata = { title: "Check-in Tamu · Garage Coffee", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Layar pintu event (owner 16 Nov 2026): semua staf yang login; batal check-in = Owner/Manajer. */
export default async function CheckinPage() {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter"]);
  if (session.response) {
    if (session.response.status === 401) redirect("/login?next=%2Fcheckin");
    redirect("/os?module=dashboard");
  }
  return <EventCheckinPanel staffName={session.data.user.name ?? "Staf"} canUndo={["Owner", "Manajer"].includes(session.data.profile.role)} />;
}
