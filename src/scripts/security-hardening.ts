// Penegakan keamanan pra-launch (QA-audit 2026-09-28) — tanpa pernah
// menentukan/mencetak password siapa pun:
//   1. Akun yang masih memakai password default seed → "wajib ganti password"
//      saat login berikutnya (staf membuat password sendiri; password lemah
//      ditolak /api/account/password).
//   2. Kebijakan 2FA wajib untuk Owner/Manajer (securityRequire2faForOwner)
//      → setelah login diarahkan ke /control/2fa sebelum bisa memakai modul.
//
// Server Garage harus MATI (PGlite satu penulis).
//   npx tsx src/scripts/security-hardening.ts            (dry-run)
//   npx tsx src/scripts/security-hardening.ts --apply
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const LEGACY_DEFAULT = "garage12345";

async function main() {
  const apply = process.argv.includes("--apply");
  const { eq, inArray } = await import("drizzle-orm");
  const { ensureDatabaseReady, getDb, getPgPool } = await import("@/db");
  const { account, staffProfiles, user } = await import("@/db/schema");
  const { auth } = await import("@/lib/auth");
  const { getAppSettings, updateAppSettings } = await import("@/lib/garage-service");

  await ensureDatabaseReady();
  const db = getDb();
  const ctx = await auth.$context;
  const candidates = [...new Set([process.env.GARAGE_SEED_PASSWORD, LEGACY_DEFAULT].filter(Boolean))] as string[];

  const rows = await db
    .select({ userId: user.id, email: user.email, role: staffProfiles.role, reset: staffProfiles.passwordResetRequired, hash: account.password })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(eq(account.providerId, "credential"));

  async function firstOutletId() {
    const [outlet] = await db.select({ id: staffProfiles.outletId }).from(staffProfiles).limit(1);
    return outlet?.id ?? "";
  }
  function systemSession(outletId: string) {
    return {
      user: { id: "system-security-hardening", name: "Hardening keamanan (QA)", email: "system@garage.local" },
      profile: {
        id: "system",
        role: "Owner",
        shiftLabel: "-",
        deviceLabel: "SCRIPT",
        passwordResetRequired: false,
        workstation: null,
        outlet: { id: outletId, code: "-", name: "-", timezone: "Asia/Jakarta" },
      },
    };
  }

  const weak: typeof rows = [];
  for (const row of rows) {
    if (!row.hash) continue;
    for (const password of candidates) {
      if (await ctx.password.verify({ hash: row.hash, password })) {
        weak.push(row);
        break;
      }
    }
  }

  const before = await getAppSettings(null);

  // Katup darurat: matikan kebijakan 2FA wajib (mis. HP authenticator hilang
  // dan backup code habis) — owner lalu bisa masuk dan mengatur ulang 2FA.
  if (process.argv.includes("--disable-2fa-policy")) {
    await updateAppSettings(null, { securityRequire2faForOwner: false }, systemSession(await firstOutletId()) as never);
    console.log("Kebijakan 2FA wajib DIMATIKAN.");
    const client = getPgPool() as { close?: () => Promise<void>; end?: () => Promise<void> };
    await (client.close?.() ?? client.end?.());
    return;
  }
  console.log(apply ? "=== HARDENING (APPLY) ===" : "=== HARDENING (DRY-RUN) ===");
  console.log(`Akun password default: ${weak.length}`);
  for (const row of weak) console.log(`  - ${row.email} (${row.role})${row.reset ? " — sudah wajib ganti" : ""}`);
  console.log(`Kebijakan 2FA wajib Owner/Manajer saat ini: ${before.securityRequire2faForOwner ? "AKTIF" : "tidak aktif"}`);

  if (apply) {
    if (weak.length) {
      await db
        .update(staffProfiles)
        .set({ passwordResetRequired: true, updatedAt: new Date() })
        .where(inArray(staffProfiles.userId, weak.map((row) => row.userId)));
    }
    if (!before.securityRequire2faForOwner) {
      await updateAppSettings(null, { securityRequire2faForOwner: true }, systemSession(await firstOutletId()) as never);
    }
    const after = await getAppSettings(null);
    console.log(`\nSelesai: ${weak.length} akun wajib ganti password; 2FA wajib = ${after.securityRequire2faForOwner ? "AKTIF" : "GAGAL"}.`);
  } else {
    console.log("\nDry-run: tidak ada yang diubah. Terapkan dengan --apply (server mati).");
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
