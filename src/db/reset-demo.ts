/**
 * reset-demo.ts — Bersihkan data dummy/demo untuk persiapan operasional nyata.
 *
 * MENGHAPUS (permanen): semua data transaksi & demo — order, customer, member,
 * kitchen, finance, approval, audit, marketing, stock movement, chat, dll.
 * MEMPERTAHANKAN: akun login staff + auth, outlet, app settings, menu & varian,
 * katalog SKU bahan baku (di-normalkan ke onHand 0), resep, POS terminal,
 * site assets, dan konfigurasi AI/Google.
 *
 * Jalankan:  npm run db:reset-demo -- --yes
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Tabel transaksi/demo yang di-truncate (anak FK ditangani CASCADE).
const TABLES_TO_CLEAR = [
  // logs & device
  "error_events",
  "feedback_entries",
  "push_subscriptions",
  "login_attempts",
  // customer & member
  "customers",
  "customer_tags",
  "member_accounts",
  "member_sessions",
  "member_transactions",
  "point_redemptions",
  // orders & payments
  "orders",
  "order_items",
  "payments",
  // kitchen
  "kitchen_tickets",
  // inventory pergerakan (katalog inventory_items DIPERTAHANKAN, dinormalkan terpisah)
  "stock_movements",
  "inventory_location_stocks",
  "inventory_transfer_requests",
  "inventory_transfer_items",
  "stock_opname_sessions",
  "stock_opname_items",
  // finance
  "cash_sessions",
  "cash_movements",
  "suppliers",
  "supplier_invoices",
  "supplier_receivings",
  "supplier_receiving_items",
  "expenses",
  "payment_settlements",
  // tables
  "table_sessions",
  // marketing & voucher
  "vouchers",
  "crm_campaign_logs",
  "voucher_redemptions",
  "marketing_campaigns",
  "marketing_broadcasts",
  // ops & approval & audit
  "shift_handover_reports",
  "print_jobs",
  "approvals",
  "audit_logs",
  "audit_cases",
  // staff earnings & tasks
  "staff_earning_payouts",
  "staff_earnings",
  "earnings_failed_queue",
  "staff_tasks",
  // chat
  "chat_channels",
  "chat_channel_members",
  "chat_messages",
  // segmen & training progress
  "custom_segments",
  "custom_segment_customers",
  "training_progress",
  // AI run logs (konfigurasi AI DIPERTAHANKAN)
  "ai_agent_runs",
  "ai_action_drafts",
  "ai_agent_events",
  "ai_context_snapshots",
  "ai_owner_chat_history",
] as const;

async function main() {
  const confirmed =
    process.argv.includes("--yes") || process.env.RESET_CONFIRM === "1";
  if (!confirmed) {
    console.error(
      "ABORT: reset-demo bersifat permanen. Tambahkan flag --yes untuk eksekusi.\n" +
        "Contoh: npm run db:reset-demo -- --yes",
    );
    process.exitCode = 1;
    return;
  }

  await ensureDatabaseReady();
  const db = getDb();

  // 1) Truncate tabel transaksi/demo. Hanya tabel yang benar-benar ada
  //    (DB bisa belum punya semua tabel jika migrasi tertinggal) — FK via CASCADE.
  const existingRows = (await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `)) as unknown as { rows?: Array<{ table_name: string }> };
  const existingNames = new Set(
    (existingRows.rows ?? (existingRows as unknown as Array<{ table_name: string }>)).map(
      (r) => r.table_name,
    ),
  );
  const targets = TABLES_TO_CLEAR.filter((t) => existingNames.has(t));
  const skipped = TABLES_TO_CLEAR.filter((t) => !existingNames.has(t));

  if (targets.length === 0) {
    console.warn("Tidak ada tabel target yang ditemukan — lewati truncate.");
  } else {
    const tableList = targets.map((t) => `"${t}"`).join(", ");
    await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`));
    console.log(`Truncated ${targets.length} tabel transaksi/demo.`);
  }
  if (skipped.length > 0) {
    console.log(`Lewati ${skipped.length} tabel (belum ada di DB): ${skipped.join(", ")}`);
  }

  // 2) Normalkan katalog bahan baku ke "mode normal": stok mulai 0,
  //    status dihitung nyata (onHand 0 <= min => 'low'), narasi demo dibuang.
  const updated = await db.execute(sql`
    UPDATE inventory_items
    SET on_hand = 0,
        status = CASE WHEN min_stock > 0 THEN 'low' ELSE 'safe' END,
        movement = '',
        updated_at = now()
  `);
  const updatedCount =
    (updated as { rowCount?: number }).rowCount ?? "semua";
  console.log(`Inventory dinormalkan (onHand=0): ${updatedCount} item.`);

  console.log("Reset demo selesai. DB siap diisi data operasional nyata.");
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
    } else if (
      "close" in client &&
      typeof (client as { close: () => Promise<void> }).close === "function"
    ) {
      await (client as { close: () => Promise<void> }).close();
    }
  });
