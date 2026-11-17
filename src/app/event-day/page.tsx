import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EventDayPanel } from "@/components/garage/events/event-day-panel";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hari-H Event — Garage OS", robots: { index: false, follow: false } };

// Hari-H event (GIGS EO Fase 3): layar HP panitia — Owner & Manajer saja.
export default async function EventDayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) redirect("/login?next=/event-day");
  if (session.data.profile.passwordResetRequired) redirect("/account/password?required=1");
  const params = await searchParams;
  const eventId = typeof params.event === "string" && /^[0-9a-f-]{36}$/i.test(params.event) ? params.event : null;
  return (
    <div className="min-h-dvh bg-[var(--garage-bg-1,#0b0b0c)]">
      <EventDayPanel initialEventId={eventId} />
    </div>
  );
}
