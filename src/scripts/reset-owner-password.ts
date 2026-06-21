import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";
import { staffProfiles, user } from "@/db/schema";
import { resetUserPassword } from "@/lib/admin-user-service";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const ownerEmail = process.env.OWNER_EMAIL?.trim() || "owner@garage.local";
const providedPassword = process.env.OWNER_NEW_PASSWORD?.trim();

function generatePassword() {
  return `GarageOwner-${randomBytes(9).toString("base64url")}-2026`;
}

async function main() {
  await ensureDatabaseReady();
  const db = getDb();
  const [owner] = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: staffProfiles.role,
      status: staffProfiles.status,
    })
    .from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(eq(user.email, ownerEmail))
    .limit(1);

  if (!owner) {
    throw new Error(`Owner account not found: ${ownerEmail}`);
  }

  if (owner.role !== "Owner / CEO") {
    throw new Error(`Account ${ownerEmail} is not Owner / CEO. Current role: ${owner.role}`);
  }

  const newPassword = providedPassword || generatePassword();
  const result = await resetUserPassword(owner.userId, newPassword, {
    actorUserId: "local-reset-script",
    actorName: "Local reset script",
    actorRole: undefined,
    deviceLabel: "local-cli",
  });

  if ("error" in result) {
    throw new Error(result.error);
  }

  console.log("OWNER_PASSWORD_RESET_OK");
  console.log(`email=${owner.email}`);
  console.log(`name=${owner.name}`);
  console.log(`status=${owner.status}`);
  console.log("passwordResetRequired=true");
  if (providedPassword) {
    console.log("password_source=OWNER_NEW_PASSWORD");
  } else {
    console.log(`temporary_password=${newPassword}`);
  }
}

main()
  .finally(async () => {
    const pool = getPgPool();
    if ("end" in pool && typeof pool.end === "function") {
      await pool.end();
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

