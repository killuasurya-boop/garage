// Audit keamanan (HANYA BACA): akun login mana yang masih memakai password
// default seed (GARAGE_SEED_PASSWORD atau default lama di kode). Menampilkan
// email saja — password tidak pernah dicetak.
//
// Pakai (server Garage mati — PGlite satu penulis):
//   npx tsx src/scripts/check-default-passwords.ts
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const LEGACY_DEFAULT = "garage12345";

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { ensureDatabaseReady, getDb, getPgPool } = await import("@/db");
  const { account, staffProfiles, user } = await import("@/db/schema");
  const { auth } = await import("@/lib/auth");

  await ensureDatabaseReady();
  const ctx = await auth.$context;
  const candidates = [...new Set([process.env.GARAGE_SEED_PASSWORD, LEGACY_DEFAULT].filter(Boolean))] as string[];

  const rows = await getDb()
    .select({ email: user.email, role: staffProfiles.role, status: staffProfiles.status, hash: account.password })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(and(eq(account.providerId, "credential")));

  const weak: string[] = [];
  for (const row of rows) {
    if (!row.hash) continue;
    for (const password of candidates) {
      if (await ctx.password.verify({ hash: row.hash, password })) {
        weak.push(`${row.email} (${row.role ?? "tanpa profil"}${row.status === "suspended" ? ", suspended" : ""})`);
        break;
      }
    }
  }

  console.log(`Diperiksa ${rows.length} akun login.`);
  if (weak.length) {
    console.log(`MASIH PASSWORD DEFAULT (${weak.length}) — wajib diganti sebelum buka:`);
    for (const line of weak) console.log(`  - ${line}`);
  } else {
    console.log("Tidak ada akun yang memakai password default. ✓");
  }
  const client = getPgPool() as { close?: () => Promise<void>; end?: () => Promise<void> };
  await (client.close?.() ?? client.end?.());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("GAGAL:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
