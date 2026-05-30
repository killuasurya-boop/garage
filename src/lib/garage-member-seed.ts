import { count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  customers as customersTable,
  memberAccounts,
  memberTransactions,
} from "@/db/schema";
import { hashPassword } from "@/lib/member-auth";
import { memberLevelForPoints } from "@/lib/member-types";

export const GARAGE_SMOKE_MEMBER_PHONE = "081300001001";

export type GarageSampleMember = {
  name: string;
  phone: string;
  email: string;
  points: number;
  visits: number;
  lastOrder: string;
  flag: string;
  amount: number;
  birthday: string;
  referralCode: string;
  referredByCode: string | null;
};

export const GARAGE_SAMPLE_MEMBERS: GarageSampleMember[] = [
  {
    name: "Sinta Silver",
    phone: "081300001001",
    email: "sinta.silver@garage.local",
    points: 320,
    visits: 4,
    lastOrder: "Americano",
    flag: "Member aktif",
    amount: 320000,
    birthday: "1998-05-24",
    referralCode: "SINTA001",
    referredByCode: null,
  },
  {
    name: "Gilang Gold",
    phone: "081300001002",
    email: "gilang.gold@garage.local",
    points: 2400,
    visits: 21,
    lastOrder: "Sanger Garage",
    flag: "Priority order",
    amount: 2400000,
    birthday: "1994-06-02",
    referralCode: "GILANG002",
    referredByCode: "SINTA001",
  },
  {
    name: "Nadia Platinum",
    phone: "081300001003",
    email: "nadia.platinum@garage.local",
    points: 6200,
    visits: 58,
    lastOrder: "Octane Affogato",
    flag: "VIP Garage",
    amount: 6200000,
    birthday: "1992-05-27",
    referralCode: "NADIA003",
    referredByCode: "GILANG002",
  },
];

export async function ensureGarageMemberLoyaltySeed(memberPassword?: string) {
  const password =
    memberPassword ??
    process.env.GARAGE_MEMBER_SEED_PASSWORD ??
    process.env.SMOKE_MEMBER_PASSWORD ??
    "member12345";

  const db = getDb();
  let upsertedAccounts = 0;

  for (const member of GARAGE_SAMPLE_MEMBERS) {
    const tier = memberLevelForPoints(member.points);
    const [customer] = await db
      .insert(customersTable)
      .values({
        name: member.name,
        phone: member.phone,
        tier,
        points: member.points,
        visits: member.visits,
        lastOrder: member.lastOrder,
        flag: member.flag,
        birthday: member.birthday,
        referralCode: member.referralCode,
        referredByCode: member.referredByCode,
      })
      .onConflictDoUpdate({
        target: customersTable.phone,
        set: {
          name: member.name,
          tier,
          points: member.points,
          visits: member.visits,
          lastOrder: member.lastOrder,
          flag: member.flag,
          birthday: member.birthday,
          referralCode: member.referralCode,
          referredByCode: member.referredByCode,
          updatedAt: new Date(),
        },
      })
      .returning();

    await db
      .insert(memberAccounts)
      .values({
        customerId: customer.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        passwordHash: await hashPassword(password),
        status: "active",
      })
      .onConflictDoUpdate({
        target: memberAccounts.phone,
        set: {
          customerId: customer.id,
          name: member.name,
          email: member.email,
          passwordHash: await hashPassword(password),
          status: "active",
          updatedAt: new Date(),
        },
      });
    upsertedAccounts += 1;

    const [historyCount] = await db
      .select({ total: count() })
      .from(memberTransactions)
      .where(eq(memberTransactions.customerId, customer.id));

    if (!historyCount.total) {
      await db.insert(memberTransactions).values({
        customerId: customer.id,
        source: "POS",
        amount: member.amount,
        pointsEarned: member.points,
        levelBefore: "Silver",
        levelAfter: tier,
        upgradeNotification:
          tier === "Silver" ? null : `Selamat, level member naik ke ${tier}.`,
      });
    }
  }

  return { upsertedAccounts };
}
