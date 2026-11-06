// =============================================================================
// Customer Experience Engine V4 (Nov 2026) — lapisan server (DB). Tidak membuat
// database pelanggan/loyalty kedua: membaca customers, member_accounts, vouchers,
// voucher_redemptions, point_redemptions, crm_campaign_logs yang sudah ada.
// Tabel baru (migration 0182) hanya: izin promosi (append-only) + event funnel.
//
// Keamanan:
// - Token invoice ≠ bukti kepemilikan akun. Konteks member hanya dari sesi member
//   (cookie JWT); invoice tidak pernah ditautkan ke member dari halaman publik —
//   penautan tetap lewat kasir (scan QR member). Guest tidak melihat data CRM.
// - Event tanpa PII (lihat cx-events.ts).
// =============================================================================

import { and, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  crmCampaignLogs,
  customerExperienceEvents,
  customerMarketingConsents,
  customers,
  memberAccounts,
  orders,
  pointRedemptions,
  voucherRedemptions,
  vouchers,
} from "@/db/schema";
import {
  getEligibleCustomerOffers,
  tierProgressBySpend,
  tierShowcase,
  verifiedTierBenefits,
  type PointRules,
} from "@/lib/customer-offers";
import { CX_DEDUPE_MINUTES, type CxEvent } from "@/lib/cx-events";
import {
  buildCxCampaignMessage,
  campaignSendBlockReason,
  cashierWhatsappNumber,
  CX_CAMPAIGN_IS_PROMO,
  type CxCampaignKind,
} from "@/lib/cx-whatsapp";
import { getAppSettings } from "@/lib/garage-service";
import { getCustomerAnnualSpend, getMemberProfile } from "@/lib/member-service";
import { normalizeMemberLevel } from "@/lib/member-types";
import { waLink } from "@/lib/whatsapp-link";

type Db = ReturnType<typeof getDb>;

export type ConsentSource = "invoice_register" | "member_register" | "member_profile" | "invoice_member";

export async function resolveInvoiceOrder(token: string, db: Db = getDb()) {
  const safe = token.trim();
  if (safe.length < 12) return null;
  const [order] = await db
    .select({ id: orders.id, customerId: orders.customerId, outletId: orders.outletId })
    .from(orders)
    .where(eq(orders.invoiceTrackingToken, safe))
    .limit(1);
  return order ?? null;
}

/** Catat event funnel. "Lihat/klik" yang sama dalam CX_DEDUPE_MINUTES tidak digandakan. */
export async function recordCxEvent(input: {
  event: CxEvent;
  orderId: string | null;
  customerId?: string | null;
  db?: Db;
}) {
  const db = input.db ?? getDb();
  const since = new Date(Date.now() - CX_DEDUPE_MINUTES * 60_000);
  const [dupe] = await db
    .select({ id: customerExperienceEvents.id })
    .from(customerExperienceEvents)
    .where(
      and(
        eq(customerExperienceEvents.event, input.event),
        input.orderId ? eq(customerExperienceEvents.orderId, input.orderId) : isNull(customerExperienceEvents.orderId),
        input.customerId ? eq(customerExperienceEvents.customerId, input.customerId) : isNull(customerExperienceEvents.customerId),
        gte(customerExperienceEvents.createdAt, since),
      ),
    )
    .limit(1);
  if (dupe) return { recorded: false };
  await db.insert(customerExperienceEvents).values({
    event: input.event,
    orderId: input.orderId,
    customerId: input.customerId ?? null,
  });
  return { recorded: true };
}

export async function recordMarketingConsent(input: {
  customerId: string;
  granted: boolean;
  source: ConsentSource;
  db?: Db;
}) {
  const db = input.db ?? getDb();
  const [row] = await db
    .insert(customerMarketingConsents)
    .values({ customerId: input.customerId, channel: "whatsapp", granted: input.granted, source: input.source })
    .returning();
  return { granted: row.granted, source: row.source, updatedAt: row.createdAt.toISOString() };
}

export async function getMarketingConsent(customerId: string, db: Db = getDb()) {
  const [row] = await db
    .select()
    .from(customerMarketingConsents)
    .where(and(eq(customerMarketingConsents.customerId, customerId), eq(customerMarketingConsents.channel, "whatsapp")))
    .orderBy(desc(customerMarketingConsents.createdAt))
    .limit(1);
  return row
    ? { granted: row.granted, source: row.source, updatedAt: row.createdAt.toISOString() }
    : { granted: false, source: null as string | null, updatedAt: null as string | null };
}

function pointRulesFrom(settings: Awaited<ReturnType<typeof getAppSettings>>): PointRules {
  return {
    pointsPerThousand: Number(settings.pointsPerThousand ?? 0),
    pointValue: Number(settings.memberPointValue ?? 0),
    redeemMaxPct: Number(settings.memberRedeemMaxPct ?? 0),
    redeemMinPoints: Number(settings.memberRedeemMinPoints ?? 0),
  };
}

/**
 * Konteks membership untuk halaman invoice. `customerId` HANYA dari sesi member.
 * Guest: promo umum tanpa kode + tangga benefit. Member: kartu asli, poin, voucher
 * miliknya, progres level dari belanja lunas 12 bulan, status izin promosi.
 */
export async function getInvoiceMemberContext(token: string, sessionCustomerId: string | null) {
  const db = getDb();
  const order = await resolveInvoiceOrder(token, db);
  if (!order) return null;
  const settings = await getAppSettings(order.outletId ?? null);
  const rules = pointRulesFrom(settings);
  const now = new Date();

  const voucherRows = await db
    .select()
    .from(vouchers)
    .where(
      and(
        eq(vouchers.status, "active"),
        sessionCustomerId ? or(isNull(vouchers.customerId), eq(vouchers.customerId, sessionCustomerId)) : isNull(vouchers.customerId),
      ),
    )
    .orderBy(desc(vouchers.createdAt))
    .limit(60);

  const base = {
    cashierWhatsapp: cashierWhatsappNumber(settings.garageWhatsapp),
    pointRules: rules,
    tiers: tierShowcase(rules),
  };

  if (!sessionCustomerId) {
    return {
      ...base,
      viewer: "guest" as const,
      member: null,
      invoiceLinked: false,
      marketingConsent: null,
      offers: getEligibleCustomerOffers({ viewer: { kind: "guest" }, vouchers: voucherRows, now, limit: 4 }),
      benefits: verifiedTierBenefits("Silver", rules, { includeWelcome: true }),
    };
  }

  const profile = await getMemberProfile(sessionCustomerId);
  if (!profile) return { ...base, viewer: "guest" as const, member: null, invoiceLinked: false, marketingConsent: null, offers: [], benefits: verifiedTierBenefits("Silver", rules, { includeWelcome: true }) };

  const redeemed = voucherRows.length
    ? await db
        .select({ voucherId: voucherRedemptions.voucherId })
        .from(voucherRedemptions)
        .where(
          and(
            eq(voucherRedemptions.customerId, sessionCustomerId),
            inArray(
              voucherRedemptions.voucherId,
              voucherRows.map((row) => row.id),
            ),
          ),
        )
    : [];
  const annualSpend = profile.annualSpend ?? (await getCustomerAnnualSpend(sessionCustomerId, db));
  const tier = normalizeMemberLevel(profile.cardTier);
  return {
    ...base,
    viewer: "member" as const,
    member: {
      name: profile.name,
      memberCode: profile.memberCode,
      tier,
      points: profile.points,
      membershipSince: profile.membershipSince,
      expiresAt: profile.expiresAt,
      expired: profile.expired,
      progress: tierProgressBySpend(annualSpend, tier),
      pointsValue: Math.max(0, profile.points) * rules.pointValue,
    },
    // Hanya fakta: order ini sudah ditautkan kasir ke akun ini. Tidak ada penautan dari sini.
    invoiceLinked: order.customerId === sessionCustomerId,
    marketingConsent: await getMarketingConsent(sessionCustomerId, db),
    offers: getEligibleCustomerOffers({
      viewer: { kind: "member", customerId: sessionCustomerId, tier },
      vouchers: voucherRows,
      redeemedVoucherIds: redeemed.map((row) => row.voucherId).filter((id): id is string => Boolean(id)),
      now,
      limit: 6,
    }),
    benefits: verifiedTierBenefits(tier, rules),
  };
}

export type InvoiceMemberContext = NonNullable<Awaited<ReturnType<typeof getInvoiceMemberContext>>>;

// ---------------------------------------------------------------------------
// Owner analytics — funnel invoice → member (tanpa klaim ROI).
// ---------------------------------------------------------------------------

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export async function getInvoiceFunnelMetrics(days = 30) {
  const db = getDb();
  const span = Math.max(1, Math.min(365, Math.round(days)));
  const since = new Date(Date.now() - span * 86_400_000);

  const eventRows = await db
    .select({
      event: customerExperienceEvents.event,
      total: count(customerExperienceEvents.id),
      orders: sql<number>`count(distinct ${customerExperienceEvents.orderId})`.mapWith(Number),
    })
    .from(customerExperienceEvents)
    .where(gte(customerExperienceEvents.createdAt, since))
    .groupBy(customerExperienceEvents.event);
  const byEvent = new Map(eventRows.map((row) => [row.event, { total: Number(row.total), orders: Number(row.orders) }]));
  const get = (event: CxEvent) => byEvent.get(event) ?? { total: 0, orders: 0 };

  const [activeMembers] = await db
    .select({ value: count(memberAccounts.id) })
    .from(memberAccounts)
    .where(eq(memberAccounts.status, "active"));

  const [repeat] = await db
    .select({
      buyers: sql<number>`count(*)`.mapWith(Number),
      repeaters: sql<number>`count(*) filter (where t.n >= 2)`.mapWith(Number),
    })
    .from(
      sql`(select ${orders.customerId} as cid, count(*) as n from ${orders}
           where ${orders.status} = 'paid' and ${orders.customerId} is not null and ${orders.createdAt} >= ${since}
           group by ${orders.customerId}) t`,
    );

  const [voucherAgg] = await db
    .select({
      count: count(voucherRedemptions.id),
      discount: sql<number>`coalesce(sum(${voucherRedemptions.discount}), 0)`.mapWith(Number),
    })
    .from(voucherRedemptions)
    .where(and(gte(voucherRedemptions.createdAt, since), eq(voucherRedemptions.status, "redeemed")));

  const [pointsAgg] = await db
    .select({ discount: sql<number>`coalesce(sum(${pointRedemptions.discount}), 0)`.mapWith(Number) })
    .from(pointRedemptions)
    .where(and(gte(pointRedemptions.createdAt, since), eq(pointRedemptions.status, "redeemed")));

  // Member yang daftar dari invoice lalu punya transaksi lunas SESUDAHNYA (bukan atribusi omzet).
  const [returned] = await db
    .select({ value: sql<number>`count(distinct e.customer_id)`.mapWith(Number) })
    .from(
      sql`${customerExperienceEvents} e join ${orders} o on o.customer_id = e.customer_id
          and o.status = 'paid' and o.created_at > e.created_at`,
    )
    .where(sql`e.event = 'member_registered' and e.created_at >= ${since}`);

  const viewed = get("invoice_viewed").orders;
  const registered = get("member_registered").total;
  return {
    days: span,
    invoicesViewed: viewed,
    memberOfferViewed: get("member_offer_viewed").orders,
    registerClicked: get("member_register_clicked").total,
    membersRegisteredFromInvoice: registered,
    memberLoginsFromInvoice: get("member_login_completed").total,
    registrationConversionPct: pct(registered, viewed),
    memberCardOpened: get("member_card_opened").total,
    vouchersViewed: get("voucher_viewed").total,
    whatsappOrderClicks: get("whatsapp_order_clicked").total,
    whatsappPaymentHelpClicks: get("whatsapp_payment_help_clicked").total,
    invoicesShared: get("invoice_shared").total,
    pdfSaved: get("invoice_pdf_saved").total,
    activeMembers: Number(activeMembers?.value ?? 0),
    repeatPurchaseRatePct: pct(Number(repeat?.repeaters ?? 0), Number(repeat?.buyers ?? 0)),
    voucherRedeemed: Number(voucherAgg?.count ?? 0),
    voucherDiscount: Number(voucherAgg?.discount ?? 0),
    pointsDiscount: Number(pointsAgg?.discount ?? 0),
    rewardCost: Number(voucherAgg?.discount ?? 0) + Number(pointsAgg?.discount ?? 0),
    registeredThenPurchased: Number(returned?.value ?? 0),
    notes: [
      "Klik WhatsApp = tombol dibuka, BUKAN pesan terkirim (wa.me tidak memberi status kirim/baca).",
      "Biaya reward = potongan voucher + poin yang tercatat; tidak ada klaim ROI/omzet kampanye tanpa atribusi.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Kampanye WhatsApp manual (staf membuka wa.me). Promosi hanya untuk member yang
// memberi izin; batas frekuensi PROMO_MIN_GAP_DAYS dari crm_campaign_logs.
// ---------------------------------------------------------------------------

const CAMPAIGN_TEMPLATE_PREFIX = "cx_";

function publicBase() {
  return (process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL ?? "https://garagecoffee.id").replace(/\/$/, "");
}

export async function listCxCampaignCandidates(kind: CxCampaignKind, limit = 50) {
  const db = getDb();
  const now = new Date();
  const max = Math.max(1, Math.min(200, limit));

  // Izin aktif = baris terbaru per customer (append-only).
  const consentRows = await db
    .select({ customerId: customerMarketingConsents.customerId, granted: customerMarketingConsents.granted })
    .from(customerMarketingConsents)
    .where(eq(customerMarketingConsents.channel, "whatsapp"))
    .orderBy(desc(customerMarketingConsents.createdAt));
  const consent = new Map<string, boolean>();
  for (const row of consentRows) if (!consent.has(row.customerId)) consent.set(row.customerId, row.granted);

  const members = await db
    .select({
      customerId: customers.id,
      name: customers.name,
      phone: customers.phone,
      tier: customers.cardTier,
      points: customers.points,
      memberCode: customers.memberCode,
      birthday: customers.birthday,
      accountCreatedAt: memberAccounts.createdAt,
    })
    .from(memberAccounts)
    .innerJoin(customers, eq(customers.id, memberAccounts.customerId))
    .where(eq(memberAccounts.status, "active"))
    .orderBy(desc(memberAccounts.createdAt))
    .limit(1000);
  if (members.length === 0) return [];
  const ids = members.map((member) => member.customerId);

  const lastLogs = await db
    .select({
      customerId: crmCampaignLogs.customerId,
      templateKey: crmCampaignLogs.templateKey,
      at: sql<Date>`max(${crmCampaignLogs.createdAt})`,
    })
    .from(crmCampaignLogs)
    .where(inArray(crmCampaignLogs.customerId, ids))
    .groupBy(crmCampaignLogs.customerId, crmCampaignLogs.templateKey);
  const lastPromo = new Map<string, Date>();
  const sentWelcome = new Set<string>();
  for (const row of lastLogs) {
    if (!row.customerId) continue;
    const at = new Date(row.at);
    if (row.templateKey === `${CAMPAIGN_TEMPLATE_PREFIX}welcome`) sentWelcome.add(row.customerId);
    const promoKind = row.templateKey.startsWith(CAMPAIGN_TEMPLATE_PREFIX)
      ? (row.templateKey.slice(CAMPAIGN_TEMPLATE_PREFIX.length) as CxCampaignKind)
      : null;
    if (promoKind && CX_CAMPAIGN_IS_PROMO[promoKind]) {
      const prev = lastPromo.get(row.customerId);
      if (!prev || at > prev) lastPromo.set(row.customerId, at);
    }
  }

  const spendRows = await db
    .select({
      customerId: orders.customerId,
      spend: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.createdAt} >= now() - interval '12 months'), 0)`.mapWith(Number),
      lastPaid: sql<Date | null>`max(${orders.createdAt})`,
    })
    .from(orders)
    .where(and(eq(orders.status, "paid"), inArray(orders.customerId, ids)))
    .groupBy(orders.customerId);
  const spend = new Map(spendRows.map((row) => [row.customerId, row]));

  const personalVouchers = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.status, "active"), inArray(vouchers.customerId, ids)));
  const generalVouchers = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.status, "active"), isNull(vouchers.customerId)))
    .limit(30);
  const redemptionRows = personalVouchers.length
    ? await db
        .select({ voucherId: voucherRedemptions.voucherId, customerId: voucherRedemptions.customerId })
        .from(voucherRedemptions)
        .where(inArray(voucherRedemptions.customerId, ids))
    : [];
  const redeemedBy = new Map<string, Set<string>>();
  for (const row of redemptionRows) {
    if (!row.customerId || !row.voucherId) continue;
    const set = redeemedBy.get(row.customerId) ?? new Set<string>();
    set.add(row.voucherId);
    redeemedBy.set(row.customerId, set);
  }

  const base = publicBase();
  const candidates = [];
  for (const member of members) {
    const stats = spend.get(member.customerId);
    const tier = normalizeMemberLevel(member.tier);
    const progress = tierProgressBySpend(stats?.spend ?? 0, tier);
    const offers = getEligibleCustomerOffers({
      viewer: { kind: "member", customerId: member.customerId, tier },
      vouchers: [...personalVouchers.filter((v) => v.customerId === member.customerId), ...generalVouchers],
      redeemedVoucherIds: redeemedBy.get(member.customerId) ?? [],
      now,
      limit: 10,
    });
    let reason: string | null = null;
    let voucher: { title: string; code: string; endsAt: string | null; terms?: string[] } | null = null;
    let offer: { title: string; benefit: string; endsAt: string | null } | null = null;

    if (kind === "welcome") {
      const fresh = now.getTime() - new Date(member.accountCreatedAt).getTime() <= 7 * 86_400_000;
      if (!fresh || sentWelcome.has(member.customerId)) continue;
      const welcome = offers.find((item) => item.kind === "welcome");
      voucher = welcome?.code ? { title: welcome.title, code: welcome.code, endsAt: welcome.endsAt } : null;
      reason = "Baru daftar (≤ 7 hari)";
    } else if (kind === "loyalty_progress") {
      if (!progress.next || !progress.target || progress.remaining <= 0) continue;
      if (progress.remaining > (progress.target - progress.floor) * 0.2) continue;
      reason = `Kurang Rp${progress.remaining.toLocaleString("id-ID")} ke ${progress.next}`;
    } else if (kind === "voucher_reminder") {
      const expiring = offers.find((item) => item.expiringSoon && item.code && item.kind !== "member");
      if (!expiring?.code) continue;
      voucher = { title: expiring.title, code: expiring.code, endsAt: expiring.endsAt, terms: expiring.terms };
      reason = "Voucher pribadi berakhir ≤ 3 hari";
    } else if (kind === "repeat_visit") {
      const last = stats?.lastPaid ? new Date(stats.lastPaid) : null;
      if (!last || now.getTime() - last.getTime() <= 30 * 86_400_000) continue;
      const general = offers.find((item) => item.kind === "member");
      offer = general ? { title: general.title, benefit: general.benefit, endsAt: general.endsAt } : null;
      reason = `Terakhir belanja ${last.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}`;
    } else if (kind === "birthday") {
      if (!member.birthday) continue;
      const [, mm, dd] = String(member.birthday).split("-").map(Number);
      const jakarta = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
      const thisYear = new Date(jakarta.getFullYear(), (mm ?? 1) - 1, dd ?? 1);
      const diffDays = Math.round((thisYear.getTime() - new Date(jakarta.getFullYear(), jakarta.getMonth(), jakarta.getDate()).getTime()) / 86_400_000);
      if (diffDays < 0 || diffDays > 7) continue;
      const bday = offers.find((item) => item.code && /^(BDAY|BIRTHDAY)-/i.test(item.code));
      voucher = bday?.code ? { title: bday.title, code: bday.code, endsAt: bday.endsAt } : null;
      reason = diffDays === 0 ? "Ulang tahun hari ini" : `Ulang tahun ${diffDays} hari lagi`;
    }

    const blockReason = campaignSendBlockReason({
      kind,
      marketingConsent: consent.get(member.customerId) === true,
      lastPromoSentAt: lastPromo.get(member.customerId) ?? null,
      now,
    });
    const message = buildCxCampaignMessage(kind, {
      name: member.name,
      memberCode: member.memberCode,
      tier,
      points: member.points,
      cardUrl: `${base}/member`,
      menuUrl: `${base}/order`,
      nextTier: progress.next,
      remainingSpend: progress.remaining,
      voucher,
      offer,
    });
    candidates.push({
      customerId: member.customerId,
      name: member.name,
      tier,
      reason,
      consent: consent.get(member.customerId) === true,
      blockReason,
      message,
      waUrl: blockReason ? null : waLink(member.phone, message),
    });
    if (candidates.length >= max) break;
  }
  return candidates;
}

/** Staf membuka wa.me untuk satu kandidat — dicatat "opened", bukan "sent". */
export async function logCxCampaignOpened(input: { kind: CxCampaignKind; customerId: string; userId: string; message: string }) {
  const db = getDb();
  const [customer] = await db
    .select({ phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) throw new Error("Customer tidak ditemukan.");
  if (CX_CAMPAIGN_IS_PROMO[input.kind]) {
    const consent = await getMarketingConsent(input.customerId, db);
    if (!consent.granted) throw new Error("Customer belum memberi izin promosi WhatsApp.");
  }
  await db.insert(crmCampaignLogs).values({
    customerId: input.customerId,
    customerPhone: customer.phone,
    segmentKey: input.kind,
    templateKey: `${CAMPAIGN_TEMPLATE_PREFIX}${input.kind}`,
    channel: "whatsapp",
    messagePreview: input.message.slice(0, 500),
    status: "opened",
    sentBy: input.userId,
  });
  return { logged: true };
}
