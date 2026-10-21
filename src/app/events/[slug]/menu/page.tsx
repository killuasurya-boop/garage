import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MemberOrderPage } from "@/components/garage/member-order-page";
import { eventDisplayMenu } from "@/lib/event-menu-display";
import { getEventMenuData, getPublicEventMenu } from "@/lib/event-menu-service";
import { listEventsForAdmin } from "@/lib/event-service";
import { getCustomerOrderBillingSettings, getCustomerOrderingStatus } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu Event | Garage Coffee", description: "Menu dan paket khusus acara Garage Coffee." };

export default async function EventMenuPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const preview = query.preview === "1";
  const data = await (async () => {
    if (preview) {
      const session = await requirePermission("events:manage");
      if (!session.data) notFound();
      const event = (await listEventsForAdmin(session.data.profile.outlet.id)).find((row) => row.slug === slug);
      if (!event) notFound();
      return getEventMenuData(event.id, { outletId: session.data.profile.outlet.id });
    }
    try { return await getPublicEventMenu(slug); }
    catch (error) { if (error && typeof error === "object" && "status" in error && error.status === 404) notFound(); throw error; }
  })();
  const event = data.event;
  const outletId = event.outletId ?? undefined;
  const [billing, ordering] = await Promise.all([
    getCustomerOrderBillingSettings(outletId).catch(() => undefined),
    getCustomerOrderingStatus(outletId).catch(() => undefined),
  ]);
  const when = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.startsAt));
  return <>
    <section className="border-b border-garage-line bg-garage-bg px-4 py-6 text-garage-fg sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div><p className="text-sm font-bold uppercase tracking-widest text-garage-amber">Garage Coffee · Event</p><h1 className="mt-2 break-words text-2xl font-black uppercase sm:text-3xl">{event.title}</h1>{event.tagline && <p className="mt-2 text-base text-garage-dim">{event.tagline}</p>}<p className="mt-3 text-sm text-garage-dim">{when} · {event.timezone}</p><p className="mt-2 text-sm font-semibold">{preview ? "Preview internal" : event.phase === "active" ? "Menu event dibuka" : event.phase === "upcoming" ? "Segera dibuka" : event.phase === "ended" ? "Event telah berakhir" : "Menu tidak tersedia"}</p></div>
        {event.bannerUrl && <Image src={event.bannerUrl} alt={`Banner ${event.title}`} width={480} height={240} unoptimized className="max-h-48 w-full rounded-lg object-cover sm:w-72" />}
      </div>
    </section>
    <MemberOrderPage
      initialQrContext={{ tableLabel: "Take away", orderType: "takeaway", source: "campaign", outletId, chooseType: !preview }}
      initialReturnPath={`/events/${encodeURIComponent(slug)}/menu`}
      initialMenuItems={eventDisplayMenu(data.entries.filter((entry) => entry.status !== "archived"), data.products)}
      billing={billing}
      initialOrderingOpen={ordering?.open}
      eventContext={{ eventId: event.id, slug: event.slug, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, entries: data.entries, products: data.products, preview }}
    />
  </>;
}
