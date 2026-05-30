import type { Customer } from "@/lib/garage-api-types";
import { ZodError, type ZodSchema } from "zod";

export type MemberLevel = "Silver" | "Gold" | "Platinum" | "Ultra";
export type MemberTransactionSource = "WEBSITE" | "POS" | "WELCOME" | "REFERRAL";

export const POINT_EARN_AMOUNT = 1000;
export const POINTS_PER_REDEEM_UNIT = 100;
export const DISCOUNT_PER_REDEEM_UNIT = 10_000;
export const GOLD_ANNUAL_SPEND = 2_000_000;
export const PLATINUM_ANNUAL_SPEND = 5_000_000;
export const ULTRA_MEMBERSHIP_YEARS = 3;
export const GOLD_MIN_POINTS = GOLD_ANNUAL_SPEND / POINT_EARN_AMOUNT;
export const PLATINUM_MIN_POINTS = PLATINUM_ANNUAL_SPEND / POINT_EARN_AMOUNT;
export const MIN_PERCENT_VOUCHER = 5;
export const MAX_PERCENT_VOUCHER = 50;
export const REFERRAL_BONUS_POINTS = 30;

export type MemberLevelRule = {
  level: MemberLevel;
  minPoints: number;
  maxPoints: number | null;
  multiplier: number;
  perks: string[];
  requiresApproval?: boolean;
};

export const memberLevelRules: MemberLevelRule[] = [
  {
    level: "Silver",
    minPoints: 0,
    maxPoints: GOLD_MIN_POINTS - 1,
    multiplier: 1,
    perks: ["Earn normal point", "Akses promo umum", "Welcome reward"],
  },
  {
    level: "Gold",
    minPoints: GOLD_MIN_POINTS,
    maxPoints: PLATINUM_MIN_POINTS - 1,
    multiplier: 1.2,
    perks: ["Point 1.2x", "Birthday reward", "Priority promo", "Early access seasonal drink"],
  },
  {
    level: "Platinum",
    minPoints: PLATINUM_MIN_POINTS,
    maxPoints: null,
    multiplier: 1.5,
    perks: ["Point 1.5x", "Free monthly drink", "Exclusive event", "Faster redeem"],
  },
  {
    level: "Ultra",
    minPoints: Number.POSITIVE_INFINITY,
    maxPoints: null,
    multiplier: 5,
    requiresApproval: true,
    perks: [
      "Point 5x",
      `Eligible setelah ${ULTRA_MEMBERSHIP_YEARS} tahun langganan + owner approval`,
      "Prototype access",
      "Owner-only privilege",
      "Lifetime card priority",
    ],
  },
];

export function canAutoPromoteTo(level: MemberLevel) {
  const rule = memberLevelRules.find((entry) => entry.level === level);
  return !rule?.requiresApproval;
}

export function hasUltraApproval(member: {
  ultraApprovedAt?: Date | string | null;
  ultraApprovedBy?: string | null;
}) {
  return Boolean(member.ultraApprovedAt && member.ultraApprovedBy);
}

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").replace(/^(\+62|62)/, "0");
}

export function normalizeMemberLevel(level?: string | null): MemberLevel {
  if (level === "Ultra") return "Ultra";
  if (level === "Platinum") return "Platinum";
  if (level === "Gold") return "Gold";
  return "Silver";
}

export function memberLevelForPoints(points: number): MemberLevel {
  if (points >= PLATINUM_MIN_POINTS) return "Platinum";
  if (points >= GOLD_MIN_POINTS) return "Gold";
  return "Silver";
}

export function memberRuleForLevel(level: string) {
  const normalized = normalizeMemberLevel(level);
  return memberLevelRules.find((rule) => rule.level === normalized) ?? memberLevelRules[0];
}

export function memberLevelRank(level: string) {
  const normalized = normalizeMemberLevel(level);
  if (normalized === "Ultra") return 4;
  return normalized === "Platinum" ? 3 : normalized === "Gold" ? 2 : 1;
}

export function memberProgress(points: number) {
  const level = memberLevelForPoints(points);
  if (level === "Platinum" || level === "Ultra") {
    return {
      currentLevel: level,
      nextLevel: null as MemberLevel | null,
      min: PLATINUM_MIN_POINTS,
      next: null as number | null,
      percent: 100,
      remaining: 0,
    };
  }

  const next = level === "Silver" ? GOLD_MIN_POINTS : PLATINUM_MIN_POINTS;
  const min = level === "Silver" ? 0 : GOLD_MIN_POINTS;
  const percent = Math.min(100, Math.max(0, Math.round(((points - min) / (next - min)) * 100)));
  return {
    currentLevel: level,
    nextLevel: level === "Silver" ? "Gold" : "Platinum",
    min,
    next,
    percent,
    remaining: Math.max(0, next - points),
  };
}

export function memberProgressForLevel(points: number, level: MemberLevel) {
  if (level === "Platinum" || level === "Ultra") {
    return {
      currentLevel: level,
      nextLevel: null as MemberLevel | null,
      min: PLATINUM_MIN_POINTS,
      next: null as number | null,
      percent: 100,
      remaining: 0,
    };
  }

  if (level === "Gold") {
    const percent = Math.min(
      100,
      Math.max(0, Math.round(((points - GOLD_MIN_POINTS) / (PLATINUM_MIN_POINTS - GOLD_MIN_POINTS)) * 100)),
    );
    return {
      currentLevel: level,
      nextLevel: "Platinum" as MemberLevel,
      min: GOLD_MIN_POINTS,
      next: PLATINUM_MIN_POINTS,
      percent,
      remaining: Math.max(0, PLATINUM_MIN_POINTS - points),
    };
  }

  return memberProgress(points);
}

export function calculateEarnedPoints(amount: number, level: string) {
  const basePoints = Math.floor(amount / POINT_EARN_AMOUNT);
  const multiplier = memberRuleForLevel(level).multiplier;
  return {
    basePoints,
    multiplier,
    pointsEarned: Math.floor(basePoints * multiplier),
  };
}

export function calculateRedeemDiscount(pointsToRedeem: number) {
  return Math.floor(pointsToRedeem / POINTS_PER_REDEEM_UNIT) * DISCOUNT_PER_REDEEM_UNIT;
}

export function annualSpendForPoints(points: number) {
  return points * POINT_EARN_AMOUNT;
}

export function memberCardTier(level?: string | null): MemberLevel {
  return normalizeMemberLevel(level);
}

export function isUltraCandidate(membershipSince?: Date | string | null, now = new Date()) {
  if (!membershipSince) return false;
  const since = membershipSince instanceof Date ? membershipSince : new Date(membershipSince);
  if (Number.isNaN(since.getTime())) return false;
  const eligibleAt = new Date(since);
  eligibleAt.setFullYear(eligibleAt.getFullYear() + ULTRA_MEMBERSHIP_YEARS);
  return now >= eligibleAt;
}

export function memberResponseData(customer: Customer & { id?: string }) {
  const customerMeta = customer as Customer & {
    annualSpend?: number;
    birthday?: string | null;
    referralCode?: string | null;
    referredByCode?: string | null;
    memberCode?: string | null;
    cardTier?: string | null;
    membershipSince?: Date | string | null;
    ultraCandidate?: boolean | null;
    ultraApprovedAt?: Date | string | null;
    ultraApprovedBy?: string | null;
    address?: string | null;
    photoUrl?: string | null;
    expiresAt?: Date | string | null;
  };
  const cardTier = memberCardTier(customerMeta.cardTier ?? customer.tier);
  const progress = memberProgressForLevel(customer.points, cardTier);
  const expiresAtIso = customerMeta.expiresAt
    ? new Date(customerMeta.expiresAt).toISOString()
    : null;
  const expiresAtDate = expiresAtIso ? new Date(expiresAtIso) : null;
  const now = new Date();
  const expired = Boolean(expiresAtDate && expiresAtDate.getTime() < now.getTime());
  const expiringSoon = Boolean(
    expiresAtDate &&
      !expired &&
      expiresAtDate.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000,
  );

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    level: cardTier,
    tier: cardTier,
    cardTier,
    memberCode: customerMeta.memberCode ?? customerMeta.referralCode ?? null,
    totalPoints: customer.points,
    points: customer.points,
    visits: customer.visits,
    lastOrder: customer.lastOrder,
    flag: customer.flag,
    multiplier: memberRuleForLevel(cardTier).multiplier,
    perks: memberRuleForLevel(cardTier).perks,
    progress,
    annualSpend: customerMeta.annualSpend ?? annualSpendForPoints(customer.points),
    birthday: customerMeta.birthday ?? null,
    referralCode: customerMeta.referralCode ?? null,
    referredByCode: customerMeta.referredByCode ?? null,
    address: customerMeta.address ?? null,
    photoUrl: customerMeta.photoUrl ?? null,
    expiresAt: expiresAtIso,
    expired,
    expiringSoon,
    membershipSince: customerMeta.membershipSince
      ? new Date(customerMeta.membershipSince).toISOString()
      : null,
    ultraCandidate:
      Boolean(customerMeta.ultraCandidate) || isUltraCandidate(customerMeta.membershipSince),
    ultraApprovedAt: customerMeta.ultraApprovedAt
      ? new Date(customerMeta.ultraApprovedAt).toISOString()
      : null,
    ultraApprovedBy: customerMeta.ultraApprovedBy ?? null,
  };
}

export function successJson<T>(data: T, init?: ResponseInit) {
  return Response.json({ success: true, data }, init);
}

export function errorJson(status: number, message: string) {
  return Response.json({ success: false, message }, { status });
}

export async function readMemberJson<T>(request: Request, schema: ZodSchema<T>) {
  try {
    const payload = await request.json();
    return { data: schema.parse(payload), response: null as null };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        data: null,
        response: errorJson(400, error.issues.map((issue) => issue.message).join("; ")),
      };
    }

    return {
      data: null,
      response: errorJson(400, "Request body harus JSON valid."),
    };
  }
}
