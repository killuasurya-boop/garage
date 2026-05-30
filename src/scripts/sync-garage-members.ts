import { readFile } from "node:fs/promises";

import { config } from "dotenv";
import { count, eq, inArray, notInArray } from "drizzle-orm";

import { getDb, getPgPool } from "@/db";
import { customers, memberAccounts, memberTransactions } from "@/db/schema";
import { hashPassword } from "@/lib/member-auth";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

type CsvMember = {
  no: number;
  code: string;
  name: string;
  phone: string;
  category: string;
  card: string;
};

const csvPath = process.argv[2] ?? "H:/My Drive/GARAGE_DATA_MEMBER csv.csv";
const seedMemberPassword = process.env.GARAGE_MEMBER_SEED_PASSWORD ?? "member12345";

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function tierFromCard(card: string) {
  const normalized = card.trim().toUpperCase();
  if (normalized === "ULTRA") return "Ultra";
  if (normalized === "PLATINUM") return "Platinum";
  if (normalized === "GOLD") return "Gold";
  return "Silver";
}

function normalizePhone(phone: string) {
  return phone.trim().replace(/[^\d+]/g, "");
}

function emailFromMember(member: CsvMember) {
  return `${member.code.toLowerCase()}@garage.local`;
}

async function readMembers() {
  const text = await readFile(csvPath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) =>
    /^No,Member Code,Nama,Nomor HP,Kategori,Type Card$/i.test(line),
  );

  if (headerIndex < 0) {
    throw new Error("Header CSV member tidak ditemukan.");
  }

  return lines
    .slice(headerIndex + 1)
    .map(parseCsvLine)
    .filter((row) => row.length >= 6 && row[0])
    .map((row, index): CsvMember => ({
      no: Number(row[0]) || index + 1,
      code: row[1],
      name: row[2],
      phone: normalizePhone(row[3]),
      category: row[4],
      card: row[5],
    }));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL wajib ada di .env.local sebelum sync member.");
  }

  const db = getDb();
  const activeMembers = await readMembers();
  const activePhones = activeMembers.map((member) => member.phone);
  const passwordHash = await hashPassword(seedMemberPassword);

  if (!activeMembers.length) {
    throw new Error("CSV tidak berisi member aktif.");
  }

  const before = await db.select({ total: count() }).from(customers);
  const staleCustomers = await db
    .select({ phone: customers.phone })
    .from(customers)
    .where(notInArray(customers.phone, activePhones));

  if (staleCustomers.length) {
    const stalePhones = staleCustomers.map((customer) => customer.phone);
    await db.delete(memberAccounts).where(inArray(memberAccounts.phone, stalePhones));
    await db.delete(customers).where(inArray(customers.phone, stalePhones));
  }

  for (const member of activeMembers) {
    const tier = tierFromCard(member.card);
    const [customer] = await db
      .insert(customers)
      .values({
        name: member.name,
        phone: member.phone,
        tier,
        cardTier: tier,
        memberCode: member.code,
        points: 0,
        visits: 0,
        lastOrder: "-",
        flag: `${member.category} - ${member.card}`,
        referralCode: member.code,
        ultraCandidate: tier === "Ultra",
        ultraApprovedAt: tier === "Ultra" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: customers.phone,
        set: {
          name: member.name,
          tier,
          cardTier: tier,
          memberCode: member.code,
          flag: `${member.category} - ${member.card}`,
          referralCode: member.code,
          ultraCandidate: tier === "Ultra",
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
        email: emailFromMember(member),
        passwordHash,
        status: "active",
      })
      .onConflictDoUpdate({
        target: memberAccounts.phone,
        set: {
          customerId: customer.id,
          name: member.name,
          email: emailFromMember(member),
          passwordHash,
          status: "active",
          updatedAt: new Date(),
        },
      });

    const [historyCount] = await db
      .select({ total: count() })
      .from(memberTransactions)
      .where(eq(memberTransactions.customerId, customer.id));

    if (!historyCount.total) {
      await db.insert(memberTransactions).values({
        customerId: customer.id,
        source: "WELCOME",
        amount: 0,
        pointsEarned: 0,
        levelBefore: tier,
        levelAfter: tier,
        upgradeNotification: `Member aktif ${member.code} tersinkron dari data resmi GARAGE.`,
      });
    }
  }

  const after = await db.select({ total: count() }).from(customers);
  const accounts = await db.select({ total: count() }).from(memberAccounts);

  console.log(
    JSON.stringify(
      {
        source: csvPath,
        before: Number(before[0]?.total ?? 0),
        removed: staleCustomers.length,
        activeMembers: activeMembers.length,
        after: Number(after[0]?.total ?? 0),
        memberAccounts: Number(accounts[0]?.total ?? 0),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const client = getPgPool();
    if ("end" in client && typeof client.end === "function") {
      await client.end();
    } else if ("close" in client && typeof (client as { close: () => Promise<void> }).close === "function") {
      await (client as { close: () => Promise<void> }).close();
    }
  });
