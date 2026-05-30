import { randomBytes } from "node:crypto";

import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  customers,
  memberAccounts,
  memberTransactions,
  orders,
  orderItems,
  pointRedemptions,
  voucherRedemptions,
  vouchers,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/member-auth";
import {
  calculateEarnedPoints,
  calculateRedeemDiscount,
  GOLD_ANNUAL_SPEND,
  memberLevelForPoints,
  memberLevelRank,
  memberResponseData,
  normalizeMemberLevel,
  normalizePhone,
  PLATINUM_ANNUAL_SPEND,
  REFERRAL_BONUS_POINTS,
  type MemberTransactionSource,
} from "@/lib/member-types";

type RegisterMemberInput = {
  name: string;
  phone: string;
  email?: string | null;
  password: string;
  birthday?: string | null;
  referralCode?: string | null;
  memberCode?: string | null;
  tier?: string | null;
};

type LoginMemberInput = {
  identifier: string;
  password: string;
};

type EarnPointsInput = {
  customerId: string;
  amount: number;
  source: MemberTransactionSource;
  lastOrder?: string;
};

type RedeemPointsInput = {
  customerId: string;
  pointsToRedeem: number;
};

function normalizeEmail(email?: string | null) {
  const value = email?.trim().toLowerCase();
  return value || null;
}

function normalizeBirthday(value?: string | null) {
  const birthday = value?.trim();
  return birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null;
}

function normalizeReferralCode(value?: string | null) {
  const code = value?.trim().replace(/\s+/g, "").toUpperCase();
  return code || null;
}

function generateReferralCode(name: string, phone: string) {
  const namePart = name
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 5) || "GRG";
  const phonePart = phone.replace(/\D/g, "").slice(-3) || "000";
  return `${namePart}${phonePart}${randomBytes(2).toString("hex").toUpperCase()}`;
}

const TIER_CODE_PREFIX: Record<string, string> = {
  Silver: "SLV",
  Gold: "GLD",
  Platinum: "PLT",
  Ultra: "OMG",
};

export function generateMemberCode(tier: string) {
  const prefix = TIER_CODE_PREFIX[normalizeMemberLevel(tier)] ?? "SLV";
  const year = new Date().getFullYear();
  const random = randomBytes(3).toString("hex").toUpperCase();
  return `GRG-${prefix}-${year}-${random}`;
}

function memberLevelForAnnualSpend(annualSpend: number) {
  if (annualSpend >= PLATINUM_ANNUAL_SPEND) return "Platinum";
  if (annualSpend >= GOLD_ANNUAL_SPEND) return "Gold";
  return "Silver";
}

export async function getCustomerAnnualSpend(customerId: string, db = getDb()) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.status, "paid"), gte(orders.createdAt, since)));

  return Number(row?.total ?? 0);
}

export async function getMemberProfile(customerId: string) {
  const db = getDb();
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return null;

  const annualSpend = await getCustomerAnnualSpend(customer.id, db);
  const annualLevel = memberLevelForAnnualSpend(annualSpend);
  const level =
    memberLevelRank(annualLevel) > memberLevelRank(customer.tier)
      ? annualLevel
      : normalizeMemberLevel(customer.tier);

  if (level !== customer.tier) {
    const [updated] = await db
      .update(customers)
      .set({ tier: level, updatedAt: new Date() })
      .where(eq(customers.id, customer.id))
      .returning();
    return memberResponseData({ ...updated, annualSpend });
  }

  return memberResponseData({ ...customer, annualSpend });
}

async function issueWelcomeVoucher(customer: typeof customers.$inferSelect, db = getDb()) {
  const code = `WELCOME-${customer.referralCode ?? customer.phone.replace(/\D/g, "").slice(-6)}`;
  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [voucher] = await db
    .insert(vouchers)
    .values({
      code,
      customerId: customer.id,
      title: `Welcome Reward 10% untuk ${customer.name}`,
      type: "percent",
      value: 10,
      minSpend: 0,
      maxDiscount: 25_000,
      audience: "all",
      status: "active",
      startsAt: new Date(),
      endsAt,
      usageLimit: 1,
    })
    .onConflictDoUpdate({
      target: vouchers.code,
      set: {
        title: `Welcome Reward 10% untuk ${customer.name}`,
        status: "active",
        endsAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  return voucher;
}

function upgradeMessage(beforeLevel: string, afterLevel: string) {
  if (memberLevelRank(afterLevel) <= memberLevelRank(beforeLevel)) {
    return null;
  }

  return `Selamat, level member naik ke ${afterLevel}.`;
}

export async function findMemberAccountByIdentifier(identifier: string) {
  const db = getDb();
  const trimmed = identifier.trim();
  const email = normalizeEmail(trimmed) ?? "";
  const phone = normalizePhone(trimmed);

  const [row] = await db
    .select({ account: memberAccounts, customer: customers })
    .from(memberAccounts)
    .innerJoin(customers, eq(memberAccounts.customerId, customers.id))
    .where(
      trimmed.includes("@")
        ? eq(memberAccounts.email, email)
        : or(eq(memberAccounts.phone, phone), eq(memberAccounts.email, email)),
    )
    .limit(1);

  return row ?? null;
}

export async function registerMember(input: RegisterMemberInput) {
  const db = getDb();
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const birthday = normalizeBirthday(input.birthday);
  const referredByCode = normalizeReferralCode(input.referralCode);
  const requestedTier = normalizeMemberLevel(input.tier);

  const [existingAccount] = await db
    .select()
    .from(memberAccounts)
    .where(email ? or(eq(memberAccounts.phone, phone), eq(memberAccounts.email, email)) : eq(memberAccounts.phone, phone))
    .limit(1);

  if (existingAccount) {
    return { data: null, error: "Phone atau email sudah terdaftar sebagai member." };
  }

  const [existingCustomer] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  const startingPoints = existingCustomer?.points ?? 0;
  const startingLevel = input.tier ? requestedTier : memberLevelForPoints(startingPoints);
  const memberCode =
    input.memberCode?.trim().replace(/\s+/g, "").toUpperCase() ||
    existingCustomer?.memberCode ||
    generateMemberCode(startingLevel);
  const referralCode = existingCustomer?.referralCode ?? memberCode ?? generateReferralCode(input.name.trim(), phone);
  const lockedCustomerName = existingCustomer?.name ?? input.name.trim();
  const customerValues = {
    name: lockedCustomerName,
    phone,
    tier: startingLevel,
    points: startingPoints,
    visits: existingCustomer?.visits ?? 0,
    lastOrder: existingCustomer?.lastOrder ?? "-",
    flag: existingCustomer?.flag === "Member" ? "Silver" : existingCustomer?.flag ?? "Member aktif",
    cardTier: startingLevel,
    memberCode,
    birthday: birthday ?? existingCustomer?.birthday ?? null,
    referralCode,
    referredByCode: referredByCode ?? existingCustomer?.referredByCode ?? null,
    updatedAt: new Date(),
  };

  const [customer] = existingCustomer
    ? await db
        .update(customers)
        .set(customerValues)
        .where(eq(customers.id, existingCustomer.id))
        .returning()
    : await db
        .insert(customers)
        .values({
          ...customerValues,
          flag: "Member aktif",
        })
        .returning();

  const welcomeVoucher = await issueWelcomeVoucher(customer, db);

  if (referredByCode) {
    await db.insert(memberTransactions).values({
      customerId: customer.id,
      source: "WELCOME",
      amount: 0,
      pointsEarned: 0,
      levelBefore: customer.tier,
      levelAfter: customer.tier,
      upgradeNotification: `Referral ${referredByCode} tercatat. Bonus aktif setelah transaksi pertama.`,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
  }

  const [account] = await db
    .insert(memberAccounts)
    .values({
      customerId: customer.id,
      name: lockedCustomerName,
      phone,
      email,
      passwordHash: await hashPassword(input.password),
      status: "active",
    })
    .returning();

  return {
    data: {
      account,
      customer,
      member: memberResponseData(customer),
      welcomeVoucher: {
        code: welcomeVoucher.code,
        discount: `${welcomeVoucher.value}%`,
        validUntil: welcomeVoucher.endsAt?.toISOString() ?? null,
      },
    },
    error: null,
  };
}

export async function loginMember(input: LoginMemberInput) {
  const row = await findMemberAccountByIdentifier(input.identifier);
  if (!row || row.account.status !== "active") {
    return { data: null, error: "Akun member tidak ditemukan atau belum aktif." };
  }

  const validPassword = await verifyPassword(input.password, row.account.passwordHash);
  if (!validPassword) {
    return { data: null, error: "Password atau PIN member salah." };
  }

  return {
    data: {
      account: row.account,
      customer: row.customer,
      member: memberResponseData(row.customer),
    },
    error: null,
  };
}

export async function getMemberHistory(customerId: string) {
  const db = getDb();
  const transactions = await db
    .select()
    .from(memberTransactions)
    .where(eq(memberTransactions.customerId, customerId))
    .orderBy(desc(memberTransactions.createdAt))
    .limit(10);

  const redemptions = await db
    .select()
    .from(pointRedemptions)
    .where(eq(pointRedemptions.customerId, customerId))
    .orderBy(desc(pointRedemptions.createdAt))
    .limit(10);

  return { transactions, redemptions };
}

export async function getMemberWallet(customerId: string) {
  const db = getDb();
  const now = new Date();
  const voucherRows = await db
    .select()
    .from(vouchers)
    .where(
      and(
        eq(vouchers.status, "active"),
        or(eq(vouchers.customerId, customerId), eq(vouchers.audience, "all")),
      ),
    )
    .orderBy(desc(vouchers.createdAt))
    .limit(30);

  const voucherIds = voucherRows.map((voucher) => voucher.id);
  const redemptions = voucherIds.length
    ? await db
        .select()
        .from(voucherRedemptions)
        .where(and(eq(voucherRedemptions.customerId, customerId), inArray(voucherRedemptions.voucherId, voucherIds)))
    : [];
  const redeemed = new Set(redemptions.map((row) => row.voucherId).filter(Boolean));

  const [coffeeMilkMission] = await db
    .select({
      qty: sql<number>`coalesce(sum(${orderItems.qty}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(orders.status, "paid"),
        ilike(orderItems.itemName, "%kopi susu%"),
      ),
    );
  const coffeeMilkQty = Number(coffeeMilkMission?.qty ?? 0);
  const visitProgress = await db
    .select({ visits: customers.visits })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const visits = Number(visitProgress[0]?.visits ?? 0);

  return {
    vouchers: voucherRows.map((voucher) => {
      const expired = Boolean(voucher.endsAt && voucher.endsAt < now);
      const quotaUsed = voucher.usageLimit != null && voucher.usedCount >= voucher.usageLimit;
      return {
        id: voucher.id,
        code: voucher.code,
        title: voucher.title,
        type: voucher.type,
        value: voucher.value,
        maxDiscount: voucher.maxDiscount,
        minSpend: voucher.minSpend,
        endsAt: voucher.endsAt?.toISOString() ?? null,
        audience: voucher.audience,
        status: expired || quotaUsed || redeemed.has(voucher.id) ? "unavailable" : "active",
        note: redeemed.has(voucher.id)
          ? "Sudah dipakai"
          : expired
            ? "Sudah expired"
            : quotaUsed
              ? "Kuota habis"
              : "Siap dipakai",
      };
    }),
    missions: [
      {
        key: "kopi-susu-5",
        title: "Beli 5 Kopi Susu",
        reward: "Gratis 1 kopi susu",
        progress: Math.min(5, coffeeMilkQty % 5),
        target: 5,
        completed: coffeeMilkQty >= 5 && coffeeMilkQty % 5 === 0,
      },
      {
        key: "visit-10",
        title: "Datang 10x",
        reward: "Bonus dessert",
        progress: Math.min(10, visits % 10),
        target: 10,
        completed: visits >= 10 && visits % 10 === 0,
      },
    ],
  };
}

export async function earnMemberPoints(input: EarnPointsInput) {
  const db = getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);

  if (!customer) {
    return { data: null, error: "Member tidak ditemukan." };
  }

  const beforeCardTier = normalizeMemberLevel(customer.cardTier ?? customer.tier);
  const { basePoints, multiplier, pointsEarned } = calculateEarnedPoints(input.amount, beforeCardTier);
  const totalPoints = customer.points + pointsEarned;
  const annualSpend = (await getCustomerAnnualSpend(customer.id, db)) + input.amount;
  const earnedLevel = memberLevelForAnnualSpend(annualSpend);
  const afterLevel =
    beforeCardTier === "Ultra"
      ? "Ultra"
      : memberLevelRank(earnedLevel) > memberLevelRank(beforeCardTier)
        ? earnedLevel
        : beforeCardTier;
  const notification = upgradeMessage(beforeCardTier, afterLevel);

  const [updatedCustomer] = await db
    .update(customers)
    .set({
      points: totalPoints,
      tier: afterLevel,
      cardTier: afterLevel,
      visits: customer.visits + 1,
      lastOrder: input.lastOrder ?? (input.source === "POS" ? "POS purchase" : "Website order"),
      flag: notification ?? customer.flag,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customer.id))
    .returning();

  const [transaction] = await db
    .insert(memberTransactions)
    .values({
      customerId: customer.id,
      source: input.source,
      amount: input.amount,
      pointsEarned,
      levelBefore: beforeCardTier,
      levelAfter: afterLevel,
      upgradeNotification: notification,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    .returning();

  if (customer.referredByCode) {
    const [existingReferralReward] = await db
      .select()
      .from(memberTransactions)
      .where(and(eq(memberTransactions.customerId, customer.id), eq(memberTransactions.source, "REFERRAL")))
      .limit(1);

    if (!existingReferralReward) {
      const [referrer] = await db
        .select()
        .from(customers)
        .where(eq(customers.referralCode, customer.referredByCode))
        .limit(1);

      await db.insert(memberTransactions).values({
        customerId: customer.id,
        source: "REFERRAL",
        amount: 0,
        pointsEarned: REFERRAL_BONUS_POINTS,
        levelBefore: afterLevel,
        levelAfter: afterLevel,
        upgradeNotification: `Bonus referral ${REFERRAL_BONUS_POINTS} poin aktif.`,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
      await db
        .update(customers)
        .set({
          points: sql`${customers.points} + ${REFERRAL_BONUS_POINTS}`,
          flag: `Referral bonus +${REFERRAL_BONUS_POINTS}`,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customer.id));

      if (referrer) {
        await db.insert(memberTransactions).values({
          customerId: referrer.id,
          source: "REFERRAL",
          amount: 0,
          pointsEarned: REFERRAL_BONUS_POINTS,
          levelBefore: normalizeMemberLevel(referrer.tier),
          levelAfter: normalizeMemberLevel(referrer.tier),
          upgradeNotification: `${customer.name} transaksi pertama. Bonus referral ${REFERRAL_BONUS_POINTS} poin.`,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
        await db
          .update(customers)
          .set({
            points: sql`${customers.points} + ${REFERRAL_BONUS_POINTS}`,
            flag: `Referral ${customer.name} +${REFERRAL_BONUS_POINTS}`,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, referrer.id));
      }
    }
  }

  return {
    data: {
      memberName: updatedCustomer.name,
      level: afterLevel,
      pointsEarned,
      totalPoints,
      basePoints,
      multiplier,
      upgradeNotification: notification,
      transaction,
      member: memberResponseData(updatedCustomer),
    },
    error: null,
  };
}

export async function redeemMemberPoints(input: RedeemPointsInput) {
  const db = getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);

  if (!customer) {
    return { data: null, error: "Member tidak ditemukan." };
  }

  if (input.pointsToRedeem % 100 !== 0) {
    return { data: null, error: "Redeem harus kelipatan 100 points." };
  }

  if (customer.points < input.pointsToRedeem) {
    return { data: null, error: "Points member tidak cukup." };
  }

  const totalPoints = customer.points - input.pointsToRedeem;
  const level = normalizeMemberLevel(customer.tier);
  const discount = calculateRedeemDiscount(input.pointsToRedeem);

  const [updatedCustomer] = await db
    .update(customers)
    .set({
      points: totalPoints,
      tier: level,
      flag: customer.flag,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customer.id))
    .returning();

  const [redemption] = await db
    .insert(pointRedemptions)
    .values({
      customerId: customer.id,
      pointsUsed: input.pointsToRedeem,
      discount,
    })
    .returning();

  return {
    data: {
      redemption,
      discount,
      totalPoints,
      level,
      member: memberResponseData(updatedCustomer),
    },
    error: null,
  };
}

type UpdateMemberProfileInput = {
  customerId: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  birthday?: string | null;
  photoUrl?: string | null;
};

export async function updateMemberProfile(input: UpdateMemberProfileInput) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);

  if (!existing) {
    return { data: null, error: "Member tidak ditemukan." };
  }

  const trimmedName = input.name?.trim();
  const trimmedAddress = input.address?.trim();
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;
  const normalizedBirthday = normalizeBirthday(input.birthday ?? null);
  const photo = input.photoUrl?.trim();

  if (normalizedPhone && normalizedPhone !== existing.phone) {
    const [conflict] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phone, normalizedPhone))
      .limit(1);
    if (conflict && conflict.id !== existing.id) {
      return { data: null, error: "Nomor telepon sudah dipakai member lain." };
    }
  }

  if (photo && photo.length > 350_000) {
    return { data: null, error: "Foto terlalu besar (maks ~250KB). Coba kompres dulu." };
  }

  const [updated] = await db
    .update(customers)
    .set({
      name: trimmedName && trimmedName.length > 0 ? trimmedName : existing.name,
      phone: normalizedPhone ?? existing.phone,
      address:
        input.address === undefined
          ? existing.address
          : trimmedAddress && trimmedAddress.length > 0
            ? trimmedAddress
            : null,
      birthday:
        input.birthday === undefined ? existing.birthday : normalizedBirthday,
      photoUrl:
        input.photoUrl === undefined
          ? existing.photoUrl
          : photo && photo.length > 0
            ? photo
            : null,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, existing.id))
    .returning();

  if (normalizedPhone && normalizedPhone !== existing.phone) {
    await db
      .update(memberAccounts)
      .set({ phone: normalizedPhone, updatedAt: new Date() })
      .where(eq(memberAccounts.customerId, existing.id));
  }

  if (trimmedName && trimmedName !== existing.name) {
    await db
      .update(memberAccounts)
      .set({ name: trimmedName, updatedAt: new Date() })
      .where(eq(memberAccounts.customerId, existing.id));
  }

  const annualSpend = await getCustomerAnnualSpend(updated.id, db);

  return {
    data: { member: memberResponseData({ ...updated, annualSpend }) },
    error: null,
  };
}

export async function lookupMemberByQr(payload: string) {
  const trimmed = payload.trim();
  if (!trimmed) {
    return { data: null, error: "QR payload kosong." };
  }

  let identifier: string | null = null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        id?: string;
        code?: string;
        phone?: string;
      };
      identifier = parsed.id ?? parsed.code ?? parsed.phone ?? null;
    } catch {
      return { data: null, error: "Format QR tidak valid." };
    }
  } else {
    identifier = trimmed;
  }

  if (!identifier) {
    return { data: null, error: "QR tidak berisi identitas member." };
  }

  const db = getDb();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let row: typeof customers.$inferSelect | undefined;
  if (uuidPattern.test(identifier)) {
    [row] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, identifier))
      .limit(1);
  }

  if (!row) {
    const normalized = identifier.toUpperCase().replace(/\s+/g, "");
    [row] = await db
      .select()
      .from(customers)
      .where(
        or(
          eq(customers.memberCode, normalized),
          eq(customers.referralCode, normalized),
        ),
      )
      .limit(1);
  }

  if (!row && /^\+?\d/.test(identifier)) {
    return lookupMemberByPhone(identifier);
  }

  if (!row) {
    return { data: null, error: "Member tidak ditemukan dari QR." };
  }

  return {
    data: {
      customerId: row.id,
      member: memberResponseData(row),
    },
    error: null,
  };
}

export async function lookupMemberByPhone(phoneInput: string) {
  const db = getDb();
  const phone = normalizePhone(phoneInput);
  const [row] = await db
    .select({ account: memberAccounts, customer: customers })
    .from(customers)
    .leftJoin(memberAccounts, eq(memberAccounts.customerId, customers.id))
    .where(eq(customers.phone, phone))
    .limit(1);

  if (!row) {
    return { data: null, error: "Member tidak ditemukan." };
  }

  return {
    data: {
      accountStatus: row.account?.status ?? "crm-only",
      customerId: row.customer.id,
      member: memberResponseData(row.customer),
    },
    error: null,
  };
}

export async function syncPosTransaction(input: {
  memberPhone: string;
  totalAmount: number;
}) {
  const lookup = await lookupMemberByPhone(input.memberPhone);
  if (!lookup.data) {
    return { data: null, error: lookup.error };
  }

  const result = await earnMemberPoints({
    customerId: lookup.data.customerId,
    amount: input.totalAmount,
    source: "POS",
    lastOrder: "POS purchase",
  });

  if (!result.data) {
    return result;
  }

  return {
    data: {
      memberName: result.data.memberName,
      level: result.data.level,
      pointsEarned: result.data.pointsEarned,
      totalPoints: result.data.totalPoints,
      upgradeNotification: result.data.upgradeNotification,
    },
    error: null,
  };
}
