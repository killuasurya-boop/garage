// =============================================================================
// RESET GRAND OPENING — bersihkan transaksi uji coba, SIMPAN data master.
//
// Beda dengan reset-demo.ts:
//   - SETIAP tabel di DB wajib terklasifikasi (KEEP / CLEAR / RESET). Tabel baru
//     yang belum dikenal → skrip BERHENTI (tidak ada tabel yang terlewat diam-diam).
//   - Pakai DELETE (bukan TRUNCATE CASCADE) supaya tabel master yang merujuk
//     transaksi tidak ikut terhapus. Relasi dicek dulu; bila ada data master yang
//     akan ikut terhapus/terblokir, skrip berhenti sebelum mengubah apa pun.
//   - Default DRY-RUN. Terapkan butuh --apply --yes dan backup otomatis dulu.
//
// Pakai (server Garage HARUS mati):
//   npx tsx src/db/reset-grand-opening.ts                      # dry-run
//   npx tsx src/db/reset-grand-opening.ts --apply --yes        # terapkan
//   Opsi: --reset-member-points  (poin & riwayat poin member ikut di-nol-kan)
// =============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// --- Klasifikasi -------------------------------------------------------------

/** Data master & konfigurasi — TIDAK disentuh. */
export const KEEP_TABLES = [
  // akun & akses
  "user", "account", "session", "verification", "two_factor", "staff_profiles", "push_subscriptions",
  // outlet & pengaturan
  "outlets", "app_settings", "pos_terminals", "site_assets", "operation_locations", "operation_glossary",
  // menu, resep, katalog
  "menu_items", "menu_variants", "menu_recipes", "menu_research",
  // pelanggan & member (poin dipertahankan kecuali --reset-member-points)
  "customers", "customer_tags", "member_accounts", "custom_segments", "custom_segment_customers",
  // marketing (definisi), voucher (definisi; used_count di-reset)
  "marketing_campaigns",
  // supplier (master)
  "suppliers",
  // SDM & payroll (konfigurasi, roster, rekrutmen, training)
  "payroll_settings", "staff_wage_config", "staff_salaries", "shift_schedules", "candidates",
  "recruitment_positions", "training_courses", "training_lessons", "training_progress",
  "company_org_roles", "company_documents", "company_document_versions", "compliance_items",
  "sop_checklists", "announcements",
  // chat internal: kanal & anggota tetap, pesan dihapus
  "chat_channels", "chat_channel_members",
  // AI & integrasi (konfigurasi)
  "ai_provider_configs", "ai_agent_configs", "ai_action_registry", "google_drive_connections",
  "social_publisher_connections",
  // finance (konfigurasi & modal pemilik)
  "finance_settings", "finance_cost_items", "finance_payroll_positions", "finance_expense_categories",
  "finance_scenarios", "capital_transactions",
  // WMS master
  "wms_warehouse", "wms_category", "wms_supplier", "wms_product", "wms_recipe", "wms_recipe_version",
  "wms_recipe_audit_log", "wms_bom_item", "wms_production_recipe", "wms_production_bom",
] as const;

/** Transaksi & log uji coba — dihapus. */
export const CLEAR_TABLES = [
  // order & produksi
  "orders", "order_items", "payments", "payment_settlements", "kitchen_tickets",
  "production_ticket_items", "production_batches", "production_batch_allocations",
  "table_sessions", "service_requests", "print_jobs", "customer_chat_threads", "customer_chat_messages",
  "voucher_redemptions",
  // kas & finance transaksional
  "cash_sessions", "cash_movements", "expenses", "supplier_invoices", "supplier_receivings",
  "supplier_receiving_items", "finance_daily_closings", "finance_monthly_closings", "financial_snapshots",
  // stok transaksional
  "stock_movements", "stock_opname_sessions", "stock_opname_items", "inventory_transfer_requests",
  "inventory_transfer_items",
  // approval, audit, log
  "approvals", "audit_logs", "audit_cases", "login_attempts", "error_events", "feedback_entries",
  "notification_logs", "shift_handover_reports", "staff_shift_handovers", "sop_logs", "staff_tasks",
  "kpi_evaluations", "chat_messages",
  // marketing & publikasi transaksional
  "crm_campaign_logs", "marketing_broadcasts", "marketing_broadcast_deliveries", "whatsapp_messaging_queue",
  "content_publishing_queue", "content_publishing_results",
  // member (sesi)
  "member_sessions",
  // SDM/payroll transaksional
  "employee_attendances", "staff_attendance_v2", "staff_daily_wages", "staff_leaves", "fee_pool_daily",
  "fee_pool_splits", "staff_payroll_payments", "staff_payrolls", "staff_advances", "staff_cash_advances",
  "staff_payout_requests", "staff_thr_payments", "staff_earnings", "staff_earning_payouts",
  "earnings_failed_queue",
  // WMS transaksional
  "wms_batch", "wms_receiving", "wms_receiving_item", "wms_internal_order", "wms_internal_order_item",
  "wms_stock_movement", "wms_stock_opname", "wms_opname_line", "wms_checklist_run", "wms_checklist_run_item",
  "wms_cold_chain_reading",
  // AI log
  "ai_agent_runs", "ai_action_drafts", "ai_agent_events", "ai_context_snapshots", "ai_owner_chat_history",
] as const;

/** Baris dipertahankan, nilai tertentu di-nol-kan (lihat RESET_SQL). */
export const RESET_TABLES = [
  "inventory_items", "inventory_location_stocks", "wms_warehouse_stock", "vouchers",
] as const;

/** Riwayat poin member — KEEP secara default, CLEAR dengan --reset-member-points. */
export const MEMBER_POINT_TABLES = ["member_transactions", "point_redemptions"] as const;

const RESET_SQL: Record<(typeof RESET_TABLES)[number], string> = {
  inventory_items: `UPDATE "inventory_items" SET "on_hand" = 0, "status" = CASE WHEN "min_stock" > 0 THEN 'low' ELSE 'safe' END, "movement" = '', "updated_at" = now()`,
  inventory_location_stocks: `UPDATE "inventory_location_stocks" SET "on_hand" = 0, "status" = CASE WHEN "min_stock" > 0 THEN 'low' ELSE 'safe' END, "movement" = '', "updated_at" = now()`,
  wms_warehouse_stock: `UPDATE "wms_warehouse_stock" SET "qty" = 0, "updated_at" = now()`,
  vouchers: `UPDATE "vouchers" SET "used_count" = 0, "updated_at" = now()`,
};

type Row = Record<string, unknown>;
const rowsOf = (result: unknown) => ((result as { rows?: Row[] }).rows ?? (result as Row[])) || [];

function portInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export type ResetPlan = {
  clear: string[];
  reset: string[];
  keep: string[];
  unknown: string[];
  missing: string[];
  blockers: string[];
  notes: string[];
};

/** Susun rencana dari daftar tabel & relasi FK aktual (dipakai juga oleh tes). */
export function buildResetPlan(
  existing: string[],
  foreignKeys: Array<{ child: string; parent: string; onDelete: string }>,
  options: { resetMemberPoints: boolean },
): ResetPlan {
  const clearSet = new Set<string>([
    ...CLEAR_TABLES,
    ...(options.resetMemberPoints ? MEMBER_POINT_TABLES : []),
  ]);
  const keepSet = new Set<string>([
    ...KEEP_TABLES,
    ...RESET_TABLES,
    ...(options.resetMemberPoints ? [] : MEMBER_POINT_TABLES),
  ]);
  const existingSet = new Set(existing);
  const known = new Set([...clearSet, ...keepSet]);

  const blockers: string[] = [];
  const notes: string[] = [];
  for (const fk of foreignKeys) {
    if (!keepSet.has(fk.child) || !clearSet.has(fk.parent)) continue;
    if (fk.onDelete === "n" || fk.onDelete === "d") {
      notes.push(`${fk.child} → ${fk.parent}: referensi dikosongkan (SET NULL), baris ${fk.child} tetap.`);
    } else if (fk.onDelete === "c") {
      blockers.push(`${fk.child} (KEEP) ikut TERHAPUS lewat ON DELETE CASCADE dari ${fk.parent} (CLEAR).`);
    } else {
      blockers.push(`${fk.child} (KEEP) merujuk ${fk.parent} (CLEAR) tanpa SET NULL — penghapusan akan terblokir.`);
    }
  }

  return {
    clear: [...clearSet].filter((t) => existingSet.has(t)).sort(),
    reset: RESET_TABLES.filter((t) => existingSet.has(t)),
    keep: [...keepSet].filter((t) => existingSet.has(t) && !(RESET_TABLES as readonly string[]).includes(t)).sort(),
    unknown: existing.filter((t) => !known.has(t) && !t.startsWith("__")).sort(),
    missing: [...known].filter((t) => !existingSet.has(t)).sort(),
    blockers,
    notes,
  };
}

type ExecDb = {
  transaction: <T>(fn: (tx: { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> }) => Promise<T>) => Promise<T>;
};

/** Baca daftar tabel & relasi FK aktual dari DB. */
export async function readDbShape(db: { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> }) {
  const existing = rowsOf(
    await db.execute(sql.raw(`
      select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1
    `)),
  ).map((row) => String(row.t));
  const foreignKeys = rowsOf(
    await db.execute(sql.raw(`
      select cl.relname as child, pl.relname as parent, con.confdeltype as on_delete
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_class pl on pl.oid = con.confrelid
      where con.contype = 'f'
    `)),
  ).map((row) => ({ child: String(row.child), parent: String(row.parent), onDelete: String(row.on_delete) }));
  return { existing, foreignKeys };
}

/**
 * Terapkan reset dalam satu transaksi. DELETE berulang: tabel yang terblokir FK
 * (anaknya belum dihapus) dicoba lagi di putaran berikut lewat savepoint.
 */
export async function applyGrandOpeningReset(
  db: ExecDb,
  plan: ResetPlan,
  options: { resetMemberPoints: boolean },
) {
  await db.transaction(async (tx) => {
    let pending = [...plan.clear];
    for (let round = 0; pending.length && round < plan.clear.length + 1; round++) {
      const next: string[] = [];
      for (const table of pending) {
        await tx.execute(sql.raw(`SAVEPOINT reset_sp`));
        try {
          await tx.execute(sql.raw(`DELETE FROM "${table}"`));
          await tx.execute(sql.raw(`RELEASE SAVEPOINT reset_sp`));
        } catch {
          await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT reset_sp`));
          next.push(table);
        }
      }
      if (next.length === pending.length) {
        throw new Error(`Tidak bisa menghapus (relasi melingkar?): ${next.join(", ")}`);
      }
      pending = next;
    }
    for (const table of plan.reset) {
      await tx.execute(sql.raw(RESET_SQL[table as (typeof RESET_TABLES)[number]]));
    }
    if (options.resetMemberPoints) {
      await tx.execute(sql.raw(`UPDATE customers SET points = 0`));
    }
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--yes");
  const resetMemberPoints = process.argv.includes("--reset-member-points");
  const driver = (process.env.GARAGE_DB_DRIVER ?? "pglite").trim().toLowerCase();
  const dataDir = path.resolve(process.env.PGLITE_DATA_DIR ?? ".pglite-data");

  if (apply && !confirmed) {
    throw new Error("Reset bersifat permanen. Tambahkan --yes bersama --apply.");
  }
  if (driver === "pglite" && ((await portInUse(3001)) || (await portInUse(3000)))) {
    throw new Error("Server Garage masih jalan (port 3000/3001). Matikan dulu — PGlite hanya boleh satu penulis.");
  }

  // Backup SEBELUM DB dibuka proses ini.
  if (apply) {
    const target = path.resolve("backups", `pre-grand-opening-${stamp()}`);
    if (driver === "pglite") {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(dataDir, target, { recursive: true });
      fs.rmSync(path.join(target, "postmaster.pid"), { force: true });
      console.log(`Backup PGlite: ${target}`);
    } else {
      const backup = spawnSync(process.execPath, ["scripts/backup.mjs"], { stdio: "inherit", env: process.env });
      if (backup.status !== 0) throw new Error("Backup Postgres gagal — reset dibatalkan.");
    }
  }

  const { ensureDatabaseReady, getDb, getPgPool } = await import("@/db");
  await ensureDatabaseReady();
  const db = getDb();

  const { existing, foreignKeys } = await readDbShape(db);

  const plan = buildResetPlan(existing, foreignKeys, { resetMemberPoints });
  if (plan.unknown.length) {
    throw new Error(
      `Tabel belum diklasifikasi (tambahkan ke KEEP/CLEAR/RESET di reset-grand-opening.ts): ${plan.unknown.join(", ")}`,
    );
  }
  if (plan.blockers.length) {
    throw new Error(`Relasi tidak aman:\n  - ${plan.blockers.join("\n  - ")}`);
  }

  const count = async (table: string) =>
    Number(rowsOf(await db.execute(sql.raw(`select count(*)::int as n from "${table}"`)))[0]?.n ?? 0);

  console.log(apply ? "=== RESET GRAND OPENING (APPLY) ===" : "=== RESET GRAND OPENING (DRY-RUN) ===");
  let totalRows = 0;
  console.log("\nDIHAPUS (transaksi uji):");
  for (const table of plan.clear) {
    const n = await count(table);
    totalRows += n;
    if (n) console.log(`  ${table.padEnd(34)} ${n}`);
  }
  console.log(`  (${plan.clear.length} tabel, total ${totalRows} baris)`);
  console.log("\nNILAI DI-NOL-KAN:");
  for (const table of plan.reset) console.log(`  ${table.padEnd(34)} ${await count(table)} baris`);
  console.log(`\nDISIMPAN (master): ${plan.keep.length} tabel`);
  for (const table of ["user", "staff_profiles", "menu_items", "menu_variants", "menu_recipes", "customers", "member_accounts", "inventory_items", "suppliers"]) {
    if (plan.keep.includes(table) || plan.reset.includes(table as never)) {
      console.log(`  ${table.padEnd(34)} ${await count(table)}`);
    }
  }
  const points = rowsOf(await db.execute(sql`select coalesce(sum(points),0)::int as p, count(*) filter (where points > 0)::int as m from customers`))[0];
  console.log(
    `\nPoin member: ${points?.p ?? 0} poin di ${points?.m ?? 0} pelanggan — ${resetMemberPoints ? "AKAN di-nol-kan" : "dipertahankan (pakai --reset-member-points untuk nol-kan)"}.`,
  );
  if (plan.notes.length) console.log(`\nCatatan relasi:\n  - ${plan.notes.join("\n  - ")}`);
  if (plan.missing.length) console.log(`\nTabel terklasifikasi tapi tidak ada di DB (dilewati): ${plan.missing.join(", ")}`);

  if (!apply) {
    console.log("\nDry-run selesai. Tidak ada yang diubah. Terapkan: npx tsx src/db/reset-grand-opening.ts --apply --yes");
    await (getPgPool() as { close?: () => Promise<void>; end?: () => Promise<void> }).close?.();
    return;
  }

  await applyGrandOpeningReset(db, plan, { resetMemberPoints });

  console.log(`\nRESET SELESAI: ${totalRows} baris transaksi dihapus, stok & pemakaian voucher di-nol-kan.`);
  console.log("Lanjutkan runbook: docs/GRAND-OPENING-H-1.md (stock opname pembukaan, cek akun, buka shift).");
  await (getPgPool() as { close?: () => Promise<void>; end?: () => Promise<void> }).close?.();
}

// Jalankan hanya bila dieksekusi langsung (bukan saat diimpor tes).
if (process.argv[1] && /reset-grand-opening\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("GAGAL:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
