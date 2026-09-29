// Migrasi data konsolidasi role: 14 role lama → 4 role (Owner, Manajer, Kasir, Waiter).
// Default dry-run (hanya laporan). Jalankan dengan --apply untuk menulis.
//   npx tsx src/scripts/migrate-role-consolidation.ts
//   npx tsx src/scripts/migrate-role-consolidation.ts --apply
// Backup DB dulu sebelum --apply. Jangan jalankan saat server memegang PGlite.
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";
import {
  aiActionRegistry,
  announcements,
  companyDocuments,
  session as sessionTable,
  sopChecklists,
  staffEarnings,
  staffProfiles,
  staffTasks,
  trainingCourses,
  user,
} from "@/db/schema";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const apply = process.argv.includes("--apply");

const ROLE_MAP: Record<string, string> = {
  "Owner / CEO": "Owner",
  Admin: "Manajer",
  "Manager Operasional": "Manajer",
  "Finance / CFO": "Manajer",
  "Supervisor Shift": "Manajer",
  Barista: "Kasir",
  Koki: "Kasir",
  "Asisten Koki": "Kasir",
  "Kitchen / Barista": "Kasir",
  Gudang: "Kasir",
  "Waiter 1": "Waiter",
  "Waiter 2": "Waiter",
  "Delivery Admin": "Waiter",
};

const OLD_ROLES = Object.keys(ROLE_MAP);

const EMAIL_RENAMES: Array<{ from: string; to: string; name: string }> = [
  { from: "owner@garage.local", to: "owner@garage.id", name: "Owner Garage" },
  { from: "manager@garage.local", to: "manajer@garage.id", name: "Manajer Garage" },
  { from: "kasir@garage.local", to: "kasir@garage.id", name: "Kasir Garage" },
  { from: "kasir2@garage.local", to: "kasir2@garage.id", name: "Kasir 2 Garage" },
  { from: "waiter1@garage.local", to: "waiter@garage.id", name: "Waiter Garage" },
  { from: "waiter2@garage.local", to: "waiter2@garage.id", name: "Waiter 2 Garage" },
];

const DEMO_ACCOUNTS_TO_DELETE = [
  "admin@garage.local",
  "finance@garage.local",
  "supervisor@garage.local",
  "barista@garage.local",
  "koki@garage.local",
  "asisten-koki@garage.local",
  "kitchen@garage.local",
  "gudang@garage.local",
  "delivery@garage.local",
];

function remapList(values: string[]) {
  return [...new Set(values.map((value) => ROLE_MAP[value] ?? value))];
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function main() {
  await ensureDatabaseReady();
  const db = getDb();
  const log = (msg: string) => console.log(`${apply ? "[APPLY]" : "[DRY]"} ${msg}`);

  // 1. Kolom text berisi nama role.
  const textColumns = [
    { label: "staff_profiles.role", table: staffProfiles, column: staffProfiles.role, key: "role" },
    { label: "staff_earnings.role", table: staffEarnings, column: staffEarnings.role, key: "role" },
    { label: "staff_tasks.target_role", table: staffTasks, column: staffTasks.targetRole, key: "targetRole" },
    { label: "sop_checklists.role_target", table: sopChecklists, column: sopChecklists.roleTarget, key: "roleTarget" },
    { label: "announcements.target_role", table: announcements, column: announcements.targetRole, key: "targetRole" },
  ] as const;

  for (const { label, table, column, key } of textColumns) {
    for (const [oldRole, newRole] of Object.entries(ROLE_MAP)) {
      const rows = await db.select({ v: column }).from(table).where(eq(column, oldRole));
      if (!rows.length) continue;
      log(`${label}: ${rows.length} baris "${oldRole}" → "${newRole}"`);
      if (apply) {
        await db.update(table).set({ [key]: newRole } as never).where(eq(column, oldRole));
      }
    }
  }

  // 2. Kolom jsonb array berisi nama role.
  const registryRows = await db
    .select({ actionType: aiActionRegistry.actionType, roles: aiActionRegistry.allowedRoles })
    .from(aiActionRegistry);
  for (const row of registryRows) {
    const next = remapList(row.roles ?? []);
    if (sameList(next, row.roles ?? [])) continue;
    log(`ai_action_registry ${row.actionType}: ${JSON.stringify(row.roles)} → ${JSON.stringify(next)}`);
    if (apply) {
      await db
        .update(aiActionRegistry)
        .set({ allowedRoles: next })
        .where(eq(aiActionRegistry.actionType, row.actionType));
    }
  }

  const docRows = await db.select({ id: companyDocuments.id, roles: companyDocuments.allowedRoles }).from(companyDocuments);
  for (const row of docRows) {
    const next = remapList(row.roles ?? []);
    if (sameList(next, row.roles ?? [])) continue;
    log(`company_documents ${row.id}: ${JSON.stringify(row.roles)} → ${JSON.stringify(next)}`);
    if (apply) await db.update(companyDocuments).set({ allowedRoles: next }).where(eq(companyDocuments.id, row.id));
  }

  const courseRows = await db.select({ id: trainingCourses.id, roles: trainingCourses.targetRoles }).from(trainingCourses);
  for (const row of courseRows) {
    const next = remapList(row.roles ?? []);
    if (sameList(next, row.roles ?? [])) continue;
    log(`training_courses ${row.id}: ${JSON.stringify(row.roles)} → ${JSON.stringify(next)}`);
    if (apply) await db.update(trainingCourses).set({ targetRoles: next }).where(eq(trainingCourses.id, row.id));
  }

  // 3. Ganti email akun demo yang dipertahankan ke domain garage.id.
  for (const rename of EMAIL_RENAMES) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, rename.from)).limit(1);
    if (!existing) continue;
    const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, rename.to)).limit(1);
    if (taken) {
      log(`SKIP ${rename.from} → ${rename.to}: email tujuan sudah dipakai`);
      continue;
    }
    log(`email ${rename.from} → ${rename.to} (nama: ${rename.name})`);
    if (apply) {
      await db.update(user).set({ email: rename.to, name: rename.name, updatedAt: new Date() }).where(eq(user.id, existing.id));
    }
  }

  // 4. Hapus akun demo role lama yang tidak dipertahankan. Kalau FK menahan,
  //    fallback ke suspend supaya tetap tidak bisa login.
  const demoUsers = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.email, DEMO_ACCOUNTS_TO_DELETE));
  for (const demo of demoUsers) {
    log(`hapus akun demo ${demo.email}`);
    if (!apply) continue;
    try {
      await db.transaction(async (tx) => {
        await tx.delete(sessionTable).where(eq(sessionTable.userId, demo.id));
        await tx.delete(user).where(eq(user.id, demo.id));
      });
    } catch (error) {
      console.warn(
        `  gagal hapus ${demo.email} (${error instanceof Error ? error.message : error}); di-suspend saja`,
      );
      await db.delete(sessionTable).where(eq(sessionTable.userId, demo.id));
      await db.update(staffProfiles).set({ status: "suspended", updatedAt: new Date() }).where(eq(staffProfiles.userId, demo.id));
    }
  }

  // 5. Laporan sisa role yang tidak dikenal.
  const leftover = await db
    .select({ role: staffProfiles.role })
    .from(staffProfiles)
    .where(inArray(staffProfiles.role, OLD_ROLES));
  log(`sisa staff_profiles dengan role lama: ${leftover.length}`);
  if (!apply) console.log("\nDry-run selesai. Jalankan ulang dengan --apply untuk menulis perubahan.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = getPgPool() as { end?: () => Promise<void>; close?: () => Promise<void> };
    await (pool.end?.() ?? pool.close?.());
  });
