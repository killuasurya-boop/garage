import { config as loadEnv } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashPassword, symmetricEncrypt, generateRandomString } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";
import { account, inventoryItems, staffProfiles, stockMovements, twoFactor, user } from "@/db/schema";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const seededEmails = [
  "owner@garage.local",
  "admin@garage.local",
  "manager@garage.local",
  "finance@garage.local",
  "kasir@garage.local",
  "kasir2@garage.local",
  "barista@garage.local",
  "koki@garage.local",
  "asisten-koki@garage.local",
  "waiter1@garage.local",
  "waiter2@garage.local",
  "kitchen@garage.local",
  "gudang@garage.local",
  "supervisor@garage.local",
  "delivery@garage.local",
] as const;

function generatePassword() {
  return `G4R-${randomBytes(24).toString("base64url")}`;
}

function generateBackupCodes() {
  return Array.from({ length: 10 }, () => {
    const code = generateRandomString(10);
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

async function setEnvValue(key: string, value: string) {
  const envPath = path.join(process.cwd(), ".env.local");
  let current = "";
  try {
    current = await readFile(envPath, "utf8");
  } catch {
    current = "";
  }

  const escaped = `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(current)
    ? current.replace(pattern, escaped)
    : `${current.trimEnd()}\n${escaped}\n`;

  if (next !== current) {
    await writeFile(envPath, next, "utf8");
  }
}

async function rotateDefaultSeedPasswords(nextPassword: string) {
  const db = getDb();
  const hashedPassword = await hashPassword(nextPassword);
  const updated = await db
    .update(account)
    .set({
      password: hashedPassword,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(account.providerId, "credential"),
        inArray(
          account.userId,
          db.select({ id: user.id }).from(user).where(inArray(user.email, [...seededEmails])),
        ),
      ),
    )
    .returning({ id: account.id });

  return updated.length;
}

async function bootstrapAdminTwoFactor() {
  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!authSecret) {
    throw new Error("BETTER_AUTH_SECRET wajib ada sebelum bootstrap 2FA.");
  }

  const db = getDb();
  const admins = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: staffProfiles.role,
      enabled: user.twoFactorEnabled,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId))
    .where(
      and(
        eq(staffProfiles.status, "active"),
        inArray(staffProfiles.role, ["Owner / CEO", "Admin"]),
      ),
    );

  const provisioned: Array<{
    email: string;
    role: string;
    totpURI: string;
    backupCodes: string[];
  }> = [];

  for (const admin of admins) {
    if (admin.enabled) continue;

    const secret = generateRandomString(32);
    const backupCodes = generateBackupCodes();
    const encryptedSecret = await symmetricEncrypt({ key: authSecret, data: secret });
    const encryptedBackupCodes = await symmetricEncrypt({
      key: authSecret,
      data: JSON.stringify(backupCodes),
    });

    await db.delete(twoFactor).where(eq(twoFactor.userId, admin.userId));
    await db.insert(twoFactor).values({
      id: crypto.randomUUID(),
      userId: admin.userId,
      secret: encryptedSecret,
      backupCodes: encryptedBackupCodes,
    });
    await db
      .update(user)
      .set({ twoFactorEnabled: true, updatedAt: new Date() })
      .where(eq(user.id, admin.userId));

    provisioned.push({
      email: admin.email,
      role: admin.role,
      totpURI: createOTP(secret).url("Garage Coffee & Motor", admin.email),
      backupCodes,
    });
  }

  if (provisioned.length > 0) {
    const outputDir = path.join(process.cwd(), ".tmp", "garage-predeploy");
    await mkdir(outputDir, { recursive: true });
    const outputPath = path.join(
      outputDir,
      `2fa-bootstrap-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          warning:
            "Sensitive bootstrap file. Import each totpURI into an authenticator, store backupCodes offline, then delete this file.",
          accounts: provisioned,
        },
        null,
        2,
      ),
      "utf8",
    );
    return { count: provisioned.length, outputPath };
  }

  return { count: 0, outputPath: null };
}

async function baselineLowStock() {
  const db = getDb();
  const rows = await db
    .select({
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      onHand: inventoryItems.onHand,
      min: inventoryItems.min,
      status: inventoryItems.status,
    })
    .from(inventoryItems)
    .where(sql`${inventoryItems.status} IN ('low', 'critical') OR ${inventoryItems.onHand} <= ${inventoryItems.min}`);

  for (const item of rows) {
    const nextQty = Math.max(Number(item.min) + 1, Number(item.onHand), 1);
    const adjustment = nextQty - Number(item.onHand);
    await db
      .update(inventoryItems)
      .set({
        onHand: nextQty,
        status: "safe",
        movement: "pre-deploy baseline receiving",
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.sku, item.sku));

    if (adjustment > 0) {
      await db.insert(stockMovements).values({
        itemSku: item.sku,
        type: "receiving",
        note: `Pre-deploy baseline receiving for ${item.name}`,
        qty: adjustment,
        actor: "Predeploy Fix",
      });
    }
  }

  return rows.length;
}

async function main() {
  await ensureDatabaseReady();

  let seedPassword = process.env.GARAGE_SEED_PASSWORD?.trim();
  let seedPasswordRotated = false;
  if (!seedPassword || seedPassword === "garage12345") {
    seedPassword = generatePassword();
    process.env.GARAGE_SEED_PASSWORD = seedPassword;
    process.env.SMOKE_STAFF_PASSWORD = seedPassword;
    process.env.READINESS_STAFF_PASSWORD = seedPassword;
    await setEnvValue("GARAGE_SEED_PASSWORD", seedPassword);
    await setEnvValue("SMOKE_STAFF_PASSWORD", seedPassword);
    await setEnvValue("READINESS_STAFF_PASSWORD", seedPassword);
    seedPasswordRotated = true;
  }

  const rotatedAccounts = await rotateDefaultSeedPasswords(seedPassword);
  const twoFactorResult = await bootstrapAdminTwoFactor();
  const stockItemsBaselined = await baselineLowStock();

  console.log(
    JSON.stringify(
      {
        ok: true,
        seedPasswordRotated,
        rotatedAccounts,
        adminTwoFactorBootstrapped: twoFactorResult.count,
        twoFactorBootstrapFile: twoFactorResult.outputPath,
        stockItemsBaselined,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
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
