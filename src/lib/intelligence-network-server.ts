// Living Intelligence Dashboard — pemuat sinyal nyata per domain (Owner). Setiap sinyal dibaca sendiri;
// sumber gagal → "Belum terverifikasi" (bukan hijau). Query ringan (hitungan & waktu terakhir).
import { and, desc, eq, gte, lt, max, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiProblemCases,
  approvals,
  auditLogs,
  cashLedgerEntries,
  customers,
  inventoryItems,
  kitchenTickets,
  mcpOperations,
  orders,
  wmsStockMovement,
} from "@/db/schema";
import { listAgentTools } from "@/lib/agent-tools";
import {
  baseSignal,
  healthFromCount,
  type DomainSignal,
  type IntelligenceSnapshot,
} from "@/lib/intelligence-network";
import { GARAGE_DOMAINS, type GarageDomainId } from "@/lib/mcp-tool-registry";
import type { GarageSession } from "@/lib/server-auth";
import { approvalRiskTier } from "@/lib/smart-approval";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error("[intelligence] sinyal gagal", error);
    return null;
  }
}

export async function getIntelligenceSnapshot(session: GarageSession): Promise<IntelligenceSnapshot> {
  if (session.profile.role !== "Owner") throw new Error("FORBIDDEN");
  const db = getDb();
  const now = new Date();
  const outletId = session.profile.outlet?.id ?? null;
  const toolCounts: Partial<Record<GarageDomainId, number>> = {};
  for (const tool of listAgentTools(undefined, { includeConfirmOnly: true })) {
    toolCounts[tool.domain as GarageDomainId] = (toolCounts[tool.domain as GarageDomainId] ?? 0) + 1;
  }
  const signals = new Map<GarageDomainId, DomainSignal>(GARAGE_DOMAINS.map((d) => [d.id, baseSignal(d.id, toolCounts[d.id] ?? 0)]));
  const set = (id: GarageDomainId, patch: Partial<DomainSignal>) => signals.set(id, { ...signals.get(id)!, ...patch, dataAsOf: now.toISOString() });

  // POS: order belum lunas > 60 menit (status belum dibayar), aktivitas = order terakhir.
  const pos = await safe(async () => {
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    const [unpaid] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(sql`${orders.status} in ('pending_cashier','awaiting_payment','accepted')`, lt(orders.createdAt, hourAgo), outletId ? eq(orders.outletId, outletId) : undefined));
    const [last] = await db.select({ at: max(orders.createdAt) }).from(orders);
    return { unpaid: unpaid?.n ?? 0, last: iso(last?.at) };
  });
  if (pos) {
    const health = healthFromCount(pos.unpaid, { attention: 1, critical: 5 });
    set("pos", { health, reason: pos.unpaid ? `${pos.unpaid} tagihan belum bayar lebih dari 60 menit.` : "Tidak ada tagihan lama yang belum dibayar.", metric: { label: "Belum bayar > 60 mnt", value: pos.unpaid }, lastActivityAt: pos.last });
    set("meja_qr", { health: "unverified", reason: "Status meja dibaca di POS → Meja.", lastActivityAt: pos.last });
  }

  // Bar/Dapur: tiket diterima > 25 menit belum siap.
  const kitchen = await safe(async () => {
    const late = new Date(now.getTime() - 25 * 60_000);
    const [stuck] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(kitchenTickets)
      .where(and(sql`${kitchenTickets.readyAt} is null`, sql`${kitchenTickets.deliveredAt} is null`, lt(kitchenTickets.acceptedAt, late), gte(kitchenTickets.acceptedAt, new Date(now.getTime() - 12 * 3600_000))));
    const [last] = await db.select({ at: max(kitchenTickets.acceptedAt) }).from(kitchenTickets);
    return { stuck: stuck?.n ?? 0, last: iso(last?.at) };
  });
  if (kitchen) {
    set("dapur_bar", {
      health: healthFromCount(kitchen.stuck, { attention: 1, critical: 4 }),
      reason: kitchen.stuck ? `${kitchen.stuck} tiket lebih dari 25 menit belum siap.` : "Tidak ada tiket yang tertahan lama.",
      metric: { label: "Tiket > 25 mnt", value: kitchen.stuck },
      lastActivityAt: kitchen.last,
    });
  }

  // Kas & ledger: aktivitas buku kas; kesehatan dari pengajuan selisih kas yang menunggu.
  const approvalRows = await safe(() =>
    db.select({ id: approvals.id, type: approvals.type, risk: approvals.risk, amountValue: approvals.amountValue, status: approvals.status, executionStatus: approvals.executionStatus, updatedAt: approvals.updatedAt }).from(approvals).where(eq(approvals.status, "pending")),
  );
  const failedRows = await safe(async () => (await db.select({ n: sql<number>`count(*)::int` }).from(approvals).where(eq(approvals.executionStatus, "failed")))[0]?.n ?? 0);
  const ledger = await safe(async () => iso((await db.select({ at: max(cashLedgerEntries.postedAt) }).from(cashLedgerEntries))[0]?.at));
  if (approvalRows) {
    const cash = approvalRows.filter((row) => row.id.startsWith("APP-CASH-")).length;
    set("shift_kas", {
      health: healthFromCount(cash, { attention: 1, critical: 3 }),
      reason: cash ? `${cash} selisih kas menunggu keputusan.` : "Tidak ada selisih kas yang menunggu.",
      metric: { label: "Selisih kas menunggu", value: cash },
      lastActivityAt: ledger,
    });
    const r3 = approvalRows.filter((row) => approvalRiskTier(row) === "R3").length;
    set("keuangan", {
      health: (failedRows ?? 0) > 0 ? "critical" : healthFromCount(r3, { attention: 1 }),
      reason: (failedRows ?? 0) > 0 ? `${failedRows} keputusan gagal dijalankan.` : r3 ? `${r3} pengajuan risiko tinggi menunggu Owner.` : "Tidak ada pengajuan risiko tinggi.",
      metric: { label: "Pengajuan menunggu", value: approvalRows.length },
      lastActivityAt: approvalRows.length ? iso(approvalRows.map((r) => r.updatedAt).sort((a, b) => b.getTime() - a.getTime())[0]) : null,
    });
  }

  // Gudang: stok minus = kritis, aktivitas = pergerakan stok terakhir.
  const wms = await safe(async () => {
    const [minus] = await db.select({ n: sql<number>`count(*)::int` }).from(inventoryItems).where(lt(inventoryItems.onHand, sql`0`));
    const [last] = await db.select({ at: max(wmsStockMovement.createdAt) }).from(wmsStockMovement);
    return { minus: minus?.n ?? 0, last: iso(last?.at) };
  });
  if (wms) {
    set("gudang", {
      health: healthFromCount(wms.minus, { attention: 1, critical: 3 }),
      reason: wms.minus ? `${wms.minus} bahan stok minus.` : "Tidak ada bahan stok minus.",
      metric: { label: "Bahan stok minus", value: wms.minus },
      lastActivityAt: wms.last,
    });
  }

  const crm = await safe(async () => iso((await db.select({ at: max(customers.updatedAt) }).from(customers))[0]?.at));
  if (crm) set("member_crm", { lastActivityAt: crm, reason: "Aktivitas pelanggan terbaca; kesehatan dinilai di modul Pelanggan." });

  // Sistem/AI: operasi MCP terakhir + kasus AYA.
  const ai = await safe(async () => {
    const [lastOp] = await db.select({ at: max(mcpOperations.createdAt) }).from(mcpOperations);
    const [open] = await db.select({ n: sql<number>`count(*)::int` }).from(aiProblemCases).where(and(eq(aiProblemCases.ownerUserId, session.user.id), sql`${aiProblemCases.status} in ('open','monitoring')`));
    const [lastCase] = await db.select({ at: max(aiProblemCases.updatedAt) }).from(aiProblemCases).where(eq(aiProblemCases.ownerUserId, session.user.id));
    return { lastOp: iso(lastOp?.at), open: open?.n ?? 0, lastCase: iso(lastCase?.at) };
  });
  if (ai) set("sistem", { health: "ok", reason: "Server menjawab & data terbaca.", lastActivityAt: ai.lastOp, metric: { label: "Kasus AYA terbuka", value: ai.open } });

  const recent = await safe(() =>
    db.select({ at: auditLogs.createdAt, action: auditLogs.action, object: auditLogs.object }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(15),
  );

  return {
    generatedAt: now.toISOString(),
    domains: [...signals.values()],
    approvals: {
      pending: approvalRows?.length ?? 0,
      highRisk: approvalRows?.filter((row) => approvalRiskTier(row) === "R3").length ?? 0,
      failedExecution: failedRows ?? 0,
    },
    aya: {
      investigating: Boolean(ai?.lastCase && now.getTime() - new Date(ai.lastCase).getTime() < 60_000),
      openCases: ai?.open ?? 0,
      lastCaseAt: ai?.lastCase ?? null,
    },
    activity: (recent ?? []).map((row) => ({ at: row.at.toISOString(), domain: domainOfObject(row.object), action: row.action })),
  };
}

function domainOfObject(object: string): GarageDomainId | null {
  if (/^APP-CASH|^CS-|^KAS-/.test(object)) return "shift_kas";
  if (/^APP-/.test(object)) return "keuangan";
  if (/^POS-|^QR-/.test(object)) return "pos";
  if (/^(BAR|KIT|RTL)-/.test(object)) return "gudang";
  return null;
}
