// Impor data Dashboard Penyelenggara platform GIGS ke Garage OS (Owner 22 Nov 2026).
// Owner saja (login langsung). Data dibaca browser Owner dari dashboard lama (login dashboard itu sendiri, Garage OS
// tidak pernah menyimpan password platform), dikirim ke sini, dipetakan oleh platform-import-rules.ts.
// dryRun = pratinjau tanpa menulis. Impor ulang aman: kontrak & kejadian ber-`platform_ref` unik, dana dicocokkan isinya.
// Tidak ada uang yang bergerak: dana masuk/keluar masuk ke Transparansi (catatan publik), BUKAN buku kas.

import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventBudgetLines, eventIncidents, eventPublicFinance, events, eventVendorContracts } from "@/db/schema";
import { EMPTY_PUBLIC_FINANCE, publicFinanceSchema, type PublicFinance } from "@/lib/event-public-finance-rules";
import { createAuditLog } from "@/lib/garage-service";
import { matchBudgetLine, planContracts, planIncidents, planLedger } from "@/lib/platform-import-rules";
import type { GarageSession } from "@/lib/server-auth";

export class PlatformImportError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "PlatformImportError";
  }
}

export const platformImportSchema = z.object({
  eventId: z.string().uuid(),
  dryRun: z.boolean().default(true),
  ledger: z.array(z.unknown()).max(2000).default([]),
  contracts: z.array(z.unknown()).max(500).default([]),
  log: z.array(z.unknown()).max(2000).default([]),
  budgetLines: z
    .array(z.object({ code: z.string().max(6), name: z.string().max(80), budget: z.number().optional(), purpose: z.string().max(300).optional(), pic: z.string().max(60).optional(), needsVendor: z.boolean().optional() }).passthrough())
    .max(40)
    .default([]),
});

export async function importFromPlatformDashboard(input: z.infer<typeof platformImportSchema>, garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new PlatformImportError("FORBIDDEN", "Impor data platform hanya untuk Owner.", 403);
  if (garage.profile.agentKey) throw new PlatformImportError("HUMAN_SESSION_REQUIRED", "Impor data platform hanya untuk Owner yang login langsung.", 403);
  const db = getDb();
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, input.eventId)).limit(1);
  if (!event) throw new PlatformImportError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);

  const rabNames = new Map(input.budgetLines.map((l) => [l.code.trim(), l.name.trim()]));
  const [lines, financeRow, contractRefs, incidentRefs] = await Promise.all([
    db.select({ id: eventBudgetLines.id, title: eventBudgetLines.title, notes: eventBudgetLines.notes, status: eventBudgetLines.status }).from(eventBudgetLines).where(eq(eventBudgetLines.eventId, event.id)),
    db.select().from(eventPublicFinance).where(eq(eventPublicFinance.eventId, event.id)).limit(1),
    db.select({ ref: eventVendorContracts.platformRef }).from(eventVendorContracts).where(and(eq(eventVendorContracts.eventId, event.id), isNotNull(eventVendorContracts.platformRef))),
    db.select({ ref: eventIncidents.platformRef }).from(eventIncidents).where(and(eq(eventIncidents.eventId, event.id), isNotNull(eventIncidents.platformRef))),
  ]);

  // Transparansi: pos RAB diambil dari dashboard bila Transparansi belum punya pos (supaya dana keluar bisa dicocokkan kodenya).
  const saved = financeRow[0] ? publicFinanceSchema.safeParse(financeRow[0].data).data : null;
  const finance: PublicFinance = saved ?? EMPTY_PUBLIC_FINANCE;
  const budgetLinesForFinance: PublicFinance["budgetLines"] = finance.budgetLines.length
    ? finance.budgetLines
    : input.budgetLines
        .filter((l) => /^[A-Za-z0-9-]{1,6}$/.test(l.code.trim()) && l.name.trim())
        .map((l) => ({
          code: l.code.trim(),
          name: l.name.trim().slice(0, 80),
          budget: Math.max(0, Math.min(2_000_000_000, Math.round(l.budget ?? 0))),
          purpose: (l.purpose ?? "").slice(0, 300),
          pic: (l.pic ?? "").slice(0, 60),
          needsVendor: l.needsVendor !== false,
          contracted: 0,
          stage: "belum-dipesan" as const,
        }));
  const ledger = planLedger(input.ledger, { incomes: finance.incomes, expenses: finance.expenses, budgetLines: budgetLinesForFinance });

  const knownContracts = new Set(contractRefs.map((r) => r.ref));
  const contractPlan = planContracts(input.contracts);
  const contracts: Array<(typeof contractPlan.items)[number] & { budgetLineId: string }> = [];
  const unmatched: string[] = [];
  let contractsExisting = 0;
  for (const c of contractPlan.items) {
    if (knownContracts.has(c.platformRef)) {
      contractsExisting += 1;
      continue;
    }
    const budgetLineId = matchBudgetLine(c.budgetCode, lines, rabNames);
    if (!budgetLineId) {
      unmatched.push(`${c.vendor} (pos ${c.budgetCode || "-"})`);
      continue;
    }
    contracts.push({ ...c, budgetLineId });
  }

  const knownIncidents = new Set(incidentRefs.map((r) => r.ref));
  const incidentPlan = planIncidents(input.log);
  const incidents = incidentPlan.items.filter((i) => !knownIncidents.has(i.platformRef));

  const summary = {
    event: event.title,
    funds: { incomes: ledger.incomes.length, expenses: ledger.expenses.length, incomeTotal: ledger.incomes.reduce((s, e) => s + e.amount, 0), expenseTotal: ledger.expenses.reduce((s, e) => s + e.amount, 0), skipped: ledger.skipped },
    contracts: { new: contracts.length, existing: contractsExisting, unmatched, invalid: contractPlan.invalid },
    incidents: { new: incidents.length, existing: incidentPlan.items.length - incidents.length, invalid: incidentPlan.invalid },
    budgetLinesFromDashboard: !finance.budgetLines.length && budgetLinesForFinance.length > 0,
  };
  if (input.dryRun) return { dryRun: true, ...summary };

  await db.transaction(async (tx) => {
    if (contracts.length) {
      await tx
        .insert(eventVendorContracts)
        .values(
          contracts.map((c) => ({
            eventId: event.id,
            budgetLineId: c.budgetLineId,
            vendor: c.vendor,
            pic: c.pic,
            phone: c.phone,
            value: c.value,
            terms: c.terms,
            dueDate: c.dueDate,
            status: c.status,
            doneNote: c.doneNote,
            cancelReason: c.status === "batal" ? "Dibatalkan di Dashboard Penyelenggara platform" : null,
            platformRef: c.platformRef,
            createdBy: garage.user.id,
          })),
        )
        .onConflictDoNothing();
    }
    if (incidents.length) {
      await tx
        .insert(eventIncidents)
        .values(
          incidents.map((i) => ({
            eventId: event.id,
            type: i.type,
            severity: i.severity,
            note: i.note,
            reportedByName: i.reportedByName,
            createdAt: i.createdAt,
            resolvedAt: i.resolvedAt,
            resolution: i.resolution,
            platformRef: i.platformRef,
          })),
        )
        .onConflictDoNothing();
    }
    if (ledger.incomes.length || ledger.expenses.length || summary.budgetLinesFromDashboard) {
      const data: PublicFinance = {
        ...finance,
        budgetLines: budgetLinesForFinance,
        incomes: [...finance.incomes, ...ledger.incomes].slice(0, 300),
        expenses: [...finance.expenses, ...ledger.expenses].slice(0, 300),
      };
      const parsed = publicFinanceSchema.safeParse(data);
      if (!parsed.success) throw new PlatformImportError("INVALID_FINANCE", parsed.error.issues[0]?.message ?? "Data dana dari dashboard tidak valid.");
      const now = new Date();
      // Tidak mengubah saklar tampil: Transparansi tetap seperti pilihan Owner (baru = belum tampil).
      await tx
        .insert(eventPublicFinance)
        .values({ eventId: event.id, enabled: false, data: parsed.data, updatedBy: garage.user.id, updatedAt: now })
        .onConflictDoUpdate({ target: eventPublicFinance.eventId, set: { data: parsed.data, updatedBy: garage.user.id, updatedAt: now } });
    }
  });

  // Audit setelah transaksi (PGlite satu koneksi).
  await createAuditLog({
    actor: garage.user.name ?? "Owner",
    action: "Impor data Dashboard Penyelenggara platform",
    object: event.title,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: { module: "platform-import", eventId: event.id, funds: summary.funds, contracts: { new: contracts.length, unmatched: unmatched.length }, incidents: { new: incidents.length } },
  });
  return { dryRun: false, ...summary };
}

