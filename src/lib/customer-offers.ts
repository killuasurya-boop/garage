// =============================================================================
// Smart offers (CX Engine V4, Nov 2026) — aturan MURNI kelayakan promo/voucher
// untuk halaman invoice & CRM. Mengikuti aturan validateVoucher (garage-service):
// voucher hanya untuk member, voucher pribadi hanya pemiliknya, cek periode,
// kuota, minimal belanja. Tidak ada promo karangan: hanya baris `vouchers` nyata.
//
// Benefit tier yang ditampilkan ke pelanggan = HANYA yang dijalankan sistem
// (`verifiedTierBenefits`). Perk di memberLevelRules yang belum punya mesin
// (birthday reward, free monthly drink, event eksklusif, prototype access) tidak
// dijanjikan di invoice sampai Owner mengonfigurasinya.
// =============================================================================

import {
  GOLD_ANNUAL_SPEND,
  memberLevelRules,
  memberRuleForLevel,
  normalizeMemberLevel,
  PLATINUM_ANNUAL_SPEND,
  type MemberLevel,
} from "@/lib/member-types";

export type VoucherLike = {
  id: string;
  code: string;
  title: string;
  type: string;
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  audience: string;
  status: string;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  usageLimit: number | null;
  usedCount: number;
  customerId: string | null;
};

export type VoucherEffectiveStatus = "active" | "scheduled" | "expired" | "quota_exhausted" | "inactive";

export const VOUCHER_EFFECTIVE_LABEL: Record<VoucherEffectiveStatus, string> = {
  active: "Aktif",
  scheduled: "Belum berlaku",
  expired: "Kedaluwarsa",
  quota_exhausted: "Kuota habis",
  inactive: "Tidak aktif",
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Status efektif voucher. Kolom `status` bisa tetap "active" setelah `ends_at`
 * lewat (tidak ada sweeper) — status efektif inilah yang dipakai untuk tampilan.
 */
export function voucherEffectiveStatus(voucher: VoucherLike, now = new Date()): VoucherEffectiveStatus {
  if (voucher.status !== "active") return voucher.status === "expired" ? "expired" : "inactive";
  const endsAt = toDate(voucher.endsAt);
  if (endsAt && endsAt.getTime() <= now.getTime()) return "expired";
  const startsAt = toDate(voucher.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return "scheduled";
  if (voucher.usageLimit != null && voucher.usedCount >= voucher.usageLimit) return "quota_exhausted";
  return "active";
}

export type OfferViewer =
  | { kind: "guest" }
  | { kind: "member"; customerId: string; tier: string };

export type CustomerOffer = {
  id: string;
  kind: "personal" | "member" | "welcome";
  title: string;
  benefit: string;
  minSpend: number;
  maxDiscount: number | null;
  endsAt: string | null;
  expiringSoon: boolean;
  /** Kode hanya untuk member yang berhak; guest melihat judul saja. */
  code: string | null;
  terms: string[];
};

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

export function offerBenefitLabel(voucher: Pick<VoucherLike, "type" | "value" | "maxDiscount">) {
  if (voucher.type === "percent") {
    return `Diskon ${voucher.value}%${voucher.maxDiscount ? ` (maks. ${rupiah(voucher.maxDiscount)})` : ""}`;
  }
  return `Potongan ${rupiah(voucher.value)}`;
}

const EXPIRING_SOON_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Penawaran yang BOLEH ditampilkan ke penonton invoice ini.
 * - guest: hanya promo umum member (tanpa kode) sebagai alasan daftar member.
 * - member: voucher pribadi miliknya + promo umum yang belum dipakai.
 * Selalu menyaring: status efektif ≠ aktif, kuota habis, sudah dipakai, milik orang lain.
 */
export function getEligibleCustomerOffers(input: {
  viewer: OfferViewer;
  vouchers: VoucherLike[];
  redeemedVoucherIds?: Iterable<string>;
  now?: Date;
  limit?: number;
}): CustomerOffer[] {
  const now = input.now ?? new Date();
  const redeemed = new Set(input.redeemedVoucherIds ?? []);
  const offers: Array<CustomerOffer & { sortKey: number }> = [];
  for (const voucher of input.vouchers) {
    if (voucherEffectiveStatus(voucher, now) !== "active") continue;
    if (voucher.audience === "guest") continue; // kebijakan: voucher hanya untuk member
    if (redeemed.has(voucher.id)) continue;
    const personal = Boolean(voucher.customerId);
    if (input.viewer.kind === "guest") {
      if (personal) continue; // voucher pribadi orang lain tidak pernah bocor
    } else if (personal && voucher.customerId !== input.viewer.customerId) {
      continue;
    }
    const endsAt = toDate(voucher.endsAt);
    const expiringSoon = Boolean(endsAt && endsAt.getTime() - now.getTime() <= EXPIRING_SOON_MS);
    const welcome = voucher.code.startsWith("WELCOME-");
    const terms = [
      voucher.minSpend > 0 ? `Minimal belanja ${rupiah(voucher.minSpend)}` : "Tanpa minimal belanja",
      endsAt ? `Berlaku s/d ${endsAt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}` : null,
      voucher.usageLimit === 1 || personal ? "Sekali pakai" : null,
      "Khusus member · tunjukkan kode ke kasir",
    ].filter((term): term is string => Boolean(term));
    offers.push({
      id: voucher.id,
      kind: welcome ? "welcome" : personal ? "personal" : "member",
      title: voucher.title,
      benefit: offerBenefitLabel(voucher),
      minSpend: voucher.minSpend,
      maxDiscount: voucher.maxDiscount,
      endsAt: endsAt?.toISOString() ?? null,
      expiringSoon,
      code: input.viewer.kind === "member" ? voucher.code : null,
      terms,
      sortKey: (personal ? 0 : 10) + (expiringSoon ? 0 : 5),
    });
  }
  return offers
    .sort((a, b) => a.sortKey - b.sortKey || (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999"))
    .slice(0, input.limit ?? 6)
    .map(({ sortKey: _sortKey, ...offer }) => offer);
}

export type TierBenefit = { key: string; title: string; detail: string };

/** Aturan poin yang AKTIF di Pengaturan (bukan konstanta lama di member-types). */
export type PointRules = {
  pointsPerThousand: number;
  pointValue: number;
  redeemMaxPct: number;
  redeemMinPoints: number;
};

function multiplierText(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")}x`;
}

function decimalText(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

/** Poin untuk belanja menu `amount` pada tier — rumus sama dengan pencatatan poin order. */
export function samplePoints(amount: number, tier: string, rules: Pick<PointRules, "pointsPerThousand">) {
  const multiplier = memberRuleForLevel(tier).multiplier;
  return Math.floor((amount / 1000) * rules.pointsPerThousand * multiplier);
}

/** Benefit yang benar-benar dijalankan sistem untuk satu tier (pakai aturan poin aktif). */
export function verifiedTierBenefits(
  tier: string,
  rules: PointRules,
  options?: { includeWelcome?: boolean },
): TierBenefit[] {
  const level = normalizeMemberLevel(tier);
  const rule = memberRuleForLevel(level);
  const benefits: TierBenefit[] = [];
  if (rules.pointsPerThousand > 0) {
    benefits.push({
      key: "points",
      title: `Poin ${multiplierText(rule.multiplier)}`,
      detail: `${decimalText(rules.pointsPerThousand)} poin tiap Rp1.000 belanja menu${rule.multiplier > 1 ? ` × ${multiplierText(rule.multiplier)}` : ""} (contoh: ${rupiah(100_000)} = ${samplePoints(100_000, level, rules)} poin).`,
    });
  }
  if (rules.redeemMaxPct > 0 && rules.pointValue > 0) {
    benefits.push({
      key: "redeem",
      title: "Bayar pakai poin",
      detail: `1 poin = ${rupiah(rules.pointValue)}. Mulai ${rules.redeemMinPoints} poin, maks. ${rules.redeemMaxPct}% harga menu per tagihan.`,
    });
  }
  benefits.push({
    key: "member-promo",
    title: "Voucher & promo member",
    detail: "Voucher Garage hanya bisa dipakai member — termasuk voucher pribadi dari kasir/CRM.",
  });
  if (options?.includeWelcome && level === "Silver") {
    benefits.push({
      key: "welcome",
      title: "Welcome reward",
      detail: `Voucher diskon ${WELCOME_VOUCHER.percent}% (maks. ${rupiah(WELCOME_VOUCHER.maxDiscount)}, sekali pakai, ${WELCOME_VOUCHER.days} hari) terbit otomatis saat daftar.`,
    });
  }
  return benefits;
}

/** Sama dengan issueWelcomeVoucher (member-service.ts) — dijaga tes. */
export const WELCOME_VOUCHER = { percent: 10, maxDiscount: 25_000, days: 30 } as const;

export type TierShowcase = { level: MemberLevel; requirement: string; benefits: TierBenefit[]; requiresApproval: boolean };

/** Tangga level untuk tab "Keuntungan Member" — syarat dari aturan level nyata. */
export function tierShowcase(rules: PointRules): TierShowcase[] {
  return memberLevelRules.map((rule) => ({
    level: rule.level,
    requiresApproval: Boolean(rule.requiresApproval),
    requirement:
      rule.level === "Silver"
        ? "Langsung saat daftar gratis"
        : rule.level === "Ultra"
          ? "Undangan Owner (min. 3 tahun member + persetujuan)"
          : `Belanja lunas ${rupiah(rule.level === "Gold" ? GOLD_ANNUAL_SPEND : PLATINUM_ANNUAL_SPEND)} dalam 12 bulan`,
    benefits: verifiedTierBenefits(rule.level, rules, { includeWelcome: true }),
  }));
}

export type CustomerSegmentKey =
  | "new_customer"
  | "returning_customer"
  | "active_member"
  | "inactive_member"
  | "voucher_expiring"
  | "near_next_tier";

export const CUSTOMER_SEGMENT_LABEL: Record<CustomerSegmentKey, string> = {
  new_customer: "Pelanggan baru",
  returning_customer: "Pelanggan kembali",
  active_member: "Member aktif",
  inactive_member: "Member tidak aktif",
  voucher_expiring: "Voucher hampir kedaluwarsa",
  near_next_tier: "Mendekati level berikutnya",
};

export const INACTIVE_AFTER_DAYS = 30;

/** Segmen deterministik dari data CRM nyata (tanpa tebakan). */
export function customerSegments(input: {
  isMember: boolean;
  paidOrders: number;
  lastPaidAt: Date | string | null;
  progressRemaining?: number | null;
  progressSpan?: number | null;
  voucherEndsAt?: Array<Date | string | null>;
  now?: Date;
}): CustomerSegmentKey[] {
  const now = input.now ?? new Date();
  const segments: CustomerSegmentKey[] = [];
  segments.push(input.paidOrders <= 1 ? "new_customer" : "returning_customer");
  if (input.isMember) {
    const last = toDate(input.lastPaidAt);
    const days = last ? (now.getTime() - last.getTime()) / 86_400_000 : Infinity;
    segments.push(days <= INACTIVE_AFTER_DAYS ? "active_member" : "inactive_member");
    if (
      input.progressRemaining != null &&
      input.progressSpan &&
      input.progressRemaining > 0 &&
      input.progressRemaining <= input.progressSpan * 0.2
    ) {
      segments.push("near_next_tier");
    }
  }
  if (
    (input.voucherEndsAt ?? []).some((value) => {
      const date = toDate(value);
      return date && date.getTime() > now.getTime() && date.getTime() - now.getTime() <= EXPIRING_SOON_MS;
    })
  ) {
    segments.push("voucher_expiring");
  }
  return segments;
}

export type TierProgress = {
  current: MemberLevel;
  next: MemberLevel | null;
  annualSpend: number;
  /** Ambang belanja level saat ini (0 untuk Silver). */
  floor: number;
  target: number | null;
  remaining: number;
  percent: number;
};

/**
 * Progres level berdasarkan belanja lunas 12 bulan — aturan naik level yang
 * dipakai getMemberProfile/earnMemberPoints (bukan ambang poin lama).
 * Ultra tidak pernah otomatis: butuh persetujuan Owner.
 */
export function tierProgressBySpend(annualSpend: number, tier: string): TierProgress {
  const current = normalizeMemberLevel(tier);
  const spend = Math.max(0, Math.round(annualSpend));
  if (current === "Platinum" || current === "Ultra") {
    return { current, next: null, annualSpend: spend, floor: PLATINUM_ANNUAL_SPEND, target: null, remaining: 0, percent: 100 };
  }
  const floor = current === "Gold" ? GOLD_ANNUAL_SPEND : 0;
  const target = current === "Gold" ? PLATINUM_ANNUAL_SPEND : GOLD_ANNUAL_SPEND;
  const percent = Math.min(100, Math.max(0, Math.round(((spend - floor) / (target - floor)) * 100)));
  return {
    current,
    next: current === "Gold" ? "Platinum" : "Gold",
    annualSpend: spend,
    floor,
    target,
    remaining: Math.max(0, target - spend),
    percent,
  };
}
