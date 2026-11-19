// Halaman event platform GIGS dari Garage OS: sponsor & kreator disetujui, kesiapan acara, laporan akhir
// (Owner 19 Nov 2026, satu pintu). Dibaca route publik /api/public/gigs/[slug]/(participants|readiness|closeout) lewat
// Caddy. Hanya data publik: nama, kategori, logo, Instagram, angka ringkasan — tanpa kontak, nominal per sponsor, bukti.
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  eventCheckins,
  eventCrew,
  eventOpsChecks,
  eventPerformers,
  eventPublicFinance,
  eventRegistrations,
  events,
  eventSponsorInkind,
  eventSponsorObligations,
  eventSponsors,
} from "@/db/schema";
import { clockDot, OPS_CHECK_TEMPLATE } from "@/lib/event-day-rules";
import { findEventForPlatform } from "@/lib/event-master";
import { buildCloseout, buildReadiness, sponsorSupport, type PublicCreator, type PublicSponsor } from "@/lib/event-public-extras-rules";
import { publicFinanceSchema, publicFinanceTotals, type PublicFinance } from "@/lib/event-public-finance-rules";
import { officialLineupName } from "@/lib/gigs-lineup";
import { fetchPlatformLineup } from "@/lib/gigs-promo";

type EventRow = typeof events.$inferSelect;

/** Slug platform → baris master event Garage OS (null = belum tertaut; route memakai data platform). */
export async function masterEventForSlug(slug: string): Promise<EventRow | null> {
  const platform = await fetchPlatformLineup({ slug, name: "" }).catch(() => null);
  const master = await findEventForPlatform({ slug, name: platform?.name ?? "" });
  if (!master) return null;
  const [row] = await getDb().select().from(events).where(eq(events.id, master.id)).limit(1);
  return row ?? null;
}

async function publicFinanceOf(eventId: string): Promise<{ enabled: boolean; data: PublicFinance } | null> {
  const [row] = await getDb().select().from(eventPublicFinance).where(eq(eventPublicFinance.eventId, eventId)).limit(1);
  const parsed = row ? publicFinanceSchema.safeParse(row.data) : null;
  return parsed?.success ? { enabled: row!.enabled, data: parsed.data } : null;
}

const wibClock = (at: Date | null) => (at ? clockDot(Math.floor((at.getTime() + 7 * 3_600_000) / 60_000) % 1440) : null);

async function publicSponsorsOf(eventId: string) {
  const db = getDb();
  const sponsors = await db
    .select({ id: eventSponsors.id, name: eventSponsors.name, agreedAmount: eventSponsors.agreedAmount, logoUrl: eventSponsors.logoUrl })
    .from(eventSponsors)
    .where(and(eq(eventSponsors.eventId, eventId), eq(eventSponsors.showOnWebsite, true), ne(eventSponsors.status, "batal")));
  if (!sponsors.length) return { sponsors: [] as PublicSponsor[], ids: [] as string[] };
  const ids = sponsors.map((s) => s.id);
  const [inkind, regs] = await Promise.all([
    db.select({ sponsorId: eventSponsorInkind.sponsorId, item: eventSponsorInkind.item }).from(eventSponsorInkind).where(and(inArray(eventSponsorInkind.sponsorId, ids), isNull(eventSponsorInkind.archivedAt))),
    db.select({ sponsorId: eventRegistrations.linkedSponsorId, category: eventRegistrations.category }).from(eventRegistrations).where(inArray(eventRegistrations.linkedSponsorId, ids)),
  ]);
  const category = new Map(regs.map((r) => [r.sponsorId, r.category]));
  return {
    ids,
    sponsors: sponsors.map((s) => ({
      name: s.name,
      category: category.get(s.id) ?? "lainnya",
      ...sponsorSupport(s.agreedAmount, inkind.filter((k) => k.sponsorId === s.id).map((k) => k.item)),
      logo: s.logoUrl ?? "",
    })),
  };
}

/** Sponsor tampil website (Sponsor Event) + kreator dari Pendaftar yang disetujui. */
export async function garageParticipants(eventId: string) {
  const db = getDb();
  const { sponsors } = await publicSponsorsOf(eventId);
  const regs = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.type, "creator"), eq(eventRegistrations.status, "disetujui")));
  const performerIds = regs.flatMap((r) => (r.linkedPerformerId ? [r.linkedPerformerId] : []));
  const performers = performerIds.length
    ? await db.select({ id: eventPerformers.id, logoUrl: eventPerformers.logoUrl, status: eventPerformers.status }).from(eventPerformers).where(inArray(eventPerformers.id, performerIds))
    : [];
  const perf = new Map(performers.map((p) => [p.id, p]));
  const creators: PublicCreator[] = regs
    .filter((r) => !r.linkedPerformerId || perf.get(r.linkedPerformerId)?.status !== "batal")
    .map((r) => ({
      id: r.id,
      name: officialLineupName(r.name),
      category: r.category ?? "kreator",
      description: r.description ?? "",
      instagram: r.instagram ?? "",
      portfolio: r.instagram ? `https://www.instagram.com/${r.instagram}/` : (r.portfolio ?? ""),
      address: "",
      logo: (r.linkedPerformerId ? perf.get(r.linkedPerformerId)?.logoUrl : null) ?? r.logoUrl ?? "",
    }));
  return { sponsors, creators };
}

async function obligationsOf(sponsorIds: string[]) {
  if (!sponsorIds.length) return { done: 0, total: 0, sponsors: 0 };
  const rows = await getDb()
    .select({ sponsorId: eventSponsorObligations.sponsorId, doneAt: eventSponsorObligations.doneAt })
    .from(eventSponsorObligations)
    .where(and(inArray(eventSponsorObligations.sponsorId, sponsorIds), isNull(eventSponsorObligations.archivedAt)));
  return { done: rows.filter((r) => r.doneAt).length, total: rows.length, sponsors: new Set(rows.map((r) => r.sponsorId)).size };
}

/** Kesiapan acara dari data nyata Garage (checklist Hari-H, transparansi aktif, lineup, panitia, kewajiban sponsor). */
export async function garageReadiness(event: EventRow, decision: unknown = null) {
  const db = getDb();
  const [ops, performers, crew, finance, sponsorRows] = await Promise.all([
    db.select({ key: eventOpsChecks.key, doneAt: eventOpsChecks.doneAt }).from(eventOpsChecks).where(eq(eventOpsChecks.eventId, event.id)),
    db.select({ status: eventPerformers.status, setStart: eventPerformers.setStart }).from(eventPerformers).where(eq(eventPerformers.eventId, event.id)),
    db.select({ id: eventCrew.id }).from(eventCrew).where(and(eq(eventCrew.eventId, event.id), eq(eventCrew.status, "aktif"))),
    publicFinanceOf(event.id),
    db.select({ id: eventSponsors.id }).from(eventSponsors).where(and(eq(eventSponsors.eventId, event.id), ne(eventSponsors.status, "batal"))),
  ]);
  // Checklist belum dibuka sama sekali → item bawaan, semuanya belum selesai (bukan "tidak ada syarat").
  const opsList = ops.length ? ops.map((o) => ({ key: o.key, done: Boolean(o.doneAt) })) : OPS_CHECK_TEMPLATE.map((t) => ({ key: t.key, done: false }));
  const f = finance?.enabled ? finance.data : null;
  return buildReadiness(
    {
      ops: opsList,
      finance: f ? { target: f.target, income: publicFinanceTotals(f).income, committedCount: f.committedCount, budgetLines: f.budgetLines } : null,
      performers: performers.filter((p) => p.status === "konfirmasi").map((p) => ({ hasTime: Boolean(p.setStart) })),
      activeCrew: crew.length,
      obligations: await obligationsOf(sponsorRows.map((s) => s.id)),
    },
    decision,
  );
}

/** Laporan akhir (hanya setelah Owner menerbitkannya di Transparansi). */
export async function garageCloseout(event: EventRow) {
  const db = getDb();
  const finance = await publicFinanceOf(event.id);
  if (!finance?.data.closeout.published) return null;
  const [checkins, performers, publicSponsors] = await Promise.all([
    db.select({ pax: eventCheckins.pax }).from(eventCheckins).where(and(eq(eventCheckins.eventId, event.id), eq(eventCheckins.status, "aktif"))),
    db
      .select({ name: eventPerformers.name, status: eventPerformers.status, slotOrder: eventPerformers.slotOrder, actualStart: eventPerformers.actualStart, actualEnd: eventPerformers.actualEnd })
      .from(eventPerformers)
      .where(eq(eventPerformers.eventId, event.id)),
    publicSponsorsOf(event.id),
  ]);
  const totals = publicFinanceTotals(finance.data);
  return buildCloseout({
    closeout: finance.data.closeout,
    event: { name: event.title, venue: event.venueName },
    finance: { income: totals.income, expense: totals.expense, target: finance.data.target },
    attendance: checkins.reduce((s, c) => s + c.pax, 0),
    program: performers
      .filter((p) => p.status === "konfirmasi")
      .sort((a, b) => (a.slotOrder ?? 999) - (b.slotOrder ?? 999))
      .map((p) => ({ name: officialLineupName(p.name), actualStart: wibClock(p.actualStart), actualEnd: wibClock(p.actualEnd) })),
    sponsors: publicSponsors.sponsors.map((s) => ({ name: s.name, support: s.support })),
    obligations: await obligationsOf(publicSponsors.ids),
  });
}
