// Transparansi dana publik GIGS (Owner 18 Nov 2026): Owner mengisi bebas; halaman event platform membacanya lewat Caddy.
// Hanya tampilan publik — tidak menulis buku kas. Setiap simpan diaudit (sebelum/sesudah).
import { eq } from "drizzle-orm";

import { platformJsonSnapshot } from "@/lib/event-platform-snapshot";
import { getDb } from "@/db";
import { eventPublicFinance, events } from "@/db/schema";
import { findEventForPlatform, listMasterEvents } from "@/lib/event-master";
import {
  EMPTY_PUBLIC_FINANCE,
  financeChangeSummary,
  platformTimestamp,
  prefillFromPlatform,
  publicFinanceSchema,
  publicFinanceTotals,
  type PublicFinance,
} from "@/lib/event-public-finance-rules";
import { createAuditLog } from "@/lib/garage-service";
import { fetchPlatformLineup } from "@/lib/gigs-promo";
import type { GarageSession } from "@/lib/server-auth";

export class PublicFinanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "PublicFinanceError";
  }
}

const DEFAULT_API = "http://garage-event-platform:4400/event/api/events";

function assertOwnerHuman(garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new PublicFinanceError("FORBIDDEN", "Transparansi publik hanya untuk Owner.", 403);
  if (garage.profile.agentKey) throw new PublicFinanceError("HUMAN_SESSION_REQUIRED", "Transparansi publik hanya untuk Owner yang login langsung.", 403);
}

/**
 * GET JSON publik platform (`/event/<slug>/api/<path>`) lewat jaringan internal. Platform mati / 5xx → salinan publik
 * Garage OS (`event-platform-snapshot`) bila ada, selain itu null.
 */
export async function fetchPlatformJson(slug: string, path: string, timeoutMs = 3000): Promise<{ status: number; body: unknown } | null> {
  const api = process.env.GARAGE_EVENT_API || DEFAULT_API;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) || !/\/api\/events\/?$/.test(api)) return null;
  const fallback = () => {
    const body = platformJsonSnapshot(slug, path);
    return body === undefined ? null : { status: 200, body };
  };
  try {
    const res = await fetch(api.replace(/\/api\/events\/?$/, `/${slug}/api/${path}`), { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 500) return fallback() ?? { status: res.status, body: await res.json().catch(() => null) };
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return fallback();
  }
}

/** Data transparansi yang aktif untuk slug platform (event harus tertaut ke master Garage). */
export async function publicFinanceForSlug(slug: string): Promise<PublicFinance | null> {
  const platform = await fetchPlatformLineup({ slug, name: "" }).catch(() => null);
  const master = await findEventForPlatform({ slug, name: platform?.name ?? "" });
  if (!master) return null;
  const [row] = await getDb().select().from(eventPublicFinance).where(eq(eventPublicFinance.eventId, master.id)).limit(1);
  if (!row?.enabled) return null;
  const parsed = publicFinanceSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}

export async function getPublicFinance(eventId: string | null, garage: GarageSession) {
  assertOwnerHuman(garage);
  const masterEvents = await listMasterEvents();
  const id = eventId ?? masterEvents[0]?.id ?? null;
  if (!id) return { masterEvents, event: null };
  const [event] = await getDb().select({ id: events.id, title: events.title, platformSlug: events.platformSlug }).from(events).where(eq(events.id, id)).limit(1);
  if (!event) throw new PublicFinanceError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  const platform = await fetchPlatformLineup({ slug: event.platformSlug, name: event.title }).catch(() => null);
  const [row] = await getDb().select().from(eventPublicFinance).where(eq(eventPublicFinance.eventId, id)).limit(1);
  const saved = row ? publicFinanceSchema.safeParse(row.data) : null;
  return {
    masterEvents,
    event: { id: event.id, title: event.title, platformSlug: platform?.slug ?? event.platformSlug ?? null, eventUrl: platform?.slug ? `/event/${platform.slug}/` : null },
    enabled: row?.enabled ?? false,
    data: saved?.success ? saved.data : EMPTY_PUBLIC_FINANCE,
    saved: Boolean(row),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/** Angka platform saat ini (config + sponsor/summary) sebagai isian awal. Platform tidak terjangkau → Error. */
export async function prefillPublicFinance(eventId: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  const [event] = await getDb().select({ title: events.title, platformSlug: events.platformSlug }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new PublicFinanceError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  const platform = await fetchPlatformLineup({ slug: event.platformSlug, name: event.title }).catch(() => null);
  if (!platform?.slug) throw new PublicFinanceError("PLATFORM_EVENT_NOT_FOUND", "Event ini tidak ditemukan di platform GIGS. Isi slug platform di menu Event.", 404);
  const [config, summary] = await Promise.all([fetchPlatformJson(platform.slug, "public/config"), fetchPlatformJson(platform.slug, "sponsor/summary")]);
  if (!config || config.status !== 200) throw new PublicFinanceError("PLATFORM_UNREACHABLE", "Platform GIGS tidak bisa dihubungi. Coba lagi.", 502);
  return { data: prefillFromPlatform(config.body, summary?.status === 200 ? summary.body : null) };
}

export async function savePublicFinance(eventId: string, raw: unknown, garage: GarageSession) {
  assertOwnerHuman(garage);
  const body = (raw ?? {}) as { enabled?: unknown; data?: unknown; changeReason?: unknown };
  const parsed = publicFinanceSchema.safeParse(body.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PublicFinanceError("INVALID", issue?.message ?? "Isian transparansi belum benar.");
  }
  const enabled = body.enabled === true;
  const db = getDb();
  // Laporan akhir: waktu terbit diisi server saat pertama diterbitkan; ditarik → kosong.
  const previousCloseout = await db.select({ data: eventPublicFinance.data }).from(eventPublicFinance).where(eq(eventPublicFinance.eventId, eventId)).limit(1);
  const previous = publicFinanceSchema.safeParse(previousCloseout[0]?.data).data ?? null;
  const prevPublishedAt = previous?.closeout.publishedAt ?? null;
  parsed.data.closeout.publishedAt = parsed.data.closeout.published ? (prevPublishedAt ?? new Date().toISOString()) : null;
  // Keputusan GO/NO GO: waktu diisi server saat keputusan berubah; dikosongkan → waktu ikut kosong.
  const prevDecision = previous?.decision ?? null;
  parsed.data.decision.decidedAt = !parsed.data.decision.value
    ? null
    : prevDecision && prevDecision.value === parsed.data.decision.value
      ? (prevDecision.decidedAt ?? new Date().toISOString())
      : new Date().toISOString();
  // Riwayat perubahan dikelola server: isian dari layar diabaikan, perubahan target/RAB baru ditambahkan.
  const history = previous?.changes ?? [];
  const summary = financeChangeSummary(previous, parsed.data);
  const reason = typeof body.changeReason === "string" ? body.changeReason.trim().slice(0, 300) : "";
  parsed.data.changes = summary
    ? [...history, { id: (history.at(-1)?.id ?? 0) + 1, area: "finance", summary, reason, at: platformTimestamp(new Date()) }].slice(-200)
    : history;
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new PublicFinanceError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  const [before] = await db.select().from(eventPublicFinance).where(eq(eventPublicFinance.eventId, eventId)).limit(1);
  const now = new Date();
  await db
    .insert(eventPublicFinance)
    .values({ eventId, enabled, data: parsed.data, updatedBy: garage.user.id, updatedAt: now })
    .onConflictDoUpdate({ target: eventPublicFinance.eventId, set: { enabled, data: parsed.data, updatedBy: garage.user.id, updatedAt: now } });
  const totals = publicFinanceTotals(parsed.data);
  await createAuditLog({
    actor: garage.user.name ?? "Owner",
    action: "Ubah transparansi dana publik",
    object: event.title,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: {
      module: "event-public-finance",
      eventId,
      before: before ? { enabled: before.enabled, data: before.data } : null,
      after: { enabled, target: parsed.data.target, income: totals.income, expense: totals.expense, lines: parsed.data.budgetLines.length },
    },
  });
  return getPublicFinance(eventId, garage);
}

/** Keputusan GO/NO GO dari Garage OS (tanpa syarat transparansi aktif) dalam format halaman event, atau null. Catatan = internal. */
export async function publicDecisionForEvent(eventId: string): Promise<{ decision: string; decidedAt: string | null } | null> {
  const [row] = await getDb().select({ data: eventPublicFinance.data }).from(eventPublicFinance).where(eq(eventPublicFinance.eventId, eventId)).limit(1);
  const decision = publicFinanceSchema.safeParse(row?.data).data?.decision;
  return decision?.value ? { decision: decision.value, decidedAt: decision.decidedAt } : null;
}
