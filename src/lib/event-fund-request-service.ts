// Pengajuan dana panitia (Owner 23 Nov 2026, pindahan Dashboard Penyelenggara platform).
// - Ajukan: Ketua/Bendahara panitia AKTIF event itu (akun login langsung), wajib bukti (foto/PDF, privat).
// - Sahkan/tolak: Owner login langsung. Sah → satu baris Transparansi (catatan publik) dalam transaksi yang sama;
//   TIDAK PERNAH baris buku kas. Status hanya berubah dari "diajukan" (sekali, tidak bisa diulang).
// - Bukti: hanya Owner, pengaju, dan Ketua/Bendahara event itu. Nama berkas acak, tidak pernah publik.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { eventCrew, eventFundRequests, eventPublicFinance, events, staffProfiles } from "@/db/schema";
import {
  applyFundRequest,
  FUND_PROOF_MAX_BYTES,
  FUND_PROOF_TYPES,
  proofContentMatches,
  type FundRequestInput,
} from "@/lib/event-fund-request-rules";
import { LineupError } from "@/lib/event-lineup-service";
import type { CrewRole } from "@/lib/event-lineup-rules";
import { EMPTY_PUBLIC_FINANCE, publicFinanceSchema } from "@/lib/event-public-finance-rules";
import { createAuditLog } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

export const FUND_SUBMITTERS: CrewRole[] = ["ketua", "bendahara"];
const PROOF_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

function storageBase() {
  return process.env.GARAGE_STORAGE_BASE_DIR || /* turbopackIgnore: true */ process.cwd();
}
export function fundProofDir() {
  return path.join(storageBase(), "storage", "event-proofs");
}

function assertHuman(garage: GarageSession) {
  if (garage.profile.agentKey) throw new LineupError("HUMAN_SESSION_REQUIRED", "Pengajuan dana hanya untuk akun yang login langsung.", 403);
}
function assertOwnerHuman(garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new LineupError("FORBIDDEN", "Hanya Owner yang bisa mengesahkan pengajuan dana.", 403);
  assertHuman(garage);
}

async function crewRoles(garage: GarageSession, eventId: string): Promise<CrewRole[]> {
  const rows = await getDb()
    .select({ role: eventCrew.role })
    .from(eventCrew)
    .where(and(eq(eventCrew.userId, garage.user.id), eq(eventCrew.eventId, eventId), eq(eventCrew.status, "aktif")));
  return rows.map((r) => r.role as CrewRole);
}

export type FundRequestView = {
  id: string;
  kind: "masuk" | "keluar";
  date: string;
  amount: number;
  party: string;
  budgetCode: string | null;
  payKind: string;
  description: string;
  hasProof: boolean;
  status: "diajukan" | "disahkan" | "ditolak";
  submittedByName: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};

function view(r: typeof eventFundRequests.$inferSelect): FundRequestView {
  return {
    id: r.id,
    kind: r.kind as FundRequestView["kind"],
    date: String(r.date),
    amount: r.amount,
    party: r.party,
    budgetCode: r.budgetCode,
    payKind: r.payKind,
    description: r.description,
    hasProof: Boolean(r.proofFile),
    status: r.status as FundRequestView["status"],
    submittedByName: r.submittedByName,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Semua yang menunggu keputusan (tidak pernah terpotong oleh batas riwayat) + riwayat terbaru. */
async function listFor(eventId: string, historyLimit = 100) {
  const db = getDb();
  const [pending, history] = await Promise.all([
    db
      .select()
      .from(eventFundRequests)
      .where(and(eq(eventFundRequests.eventId, eventId), eq(eventFundRequests.status, "diajukan")))
      .orderBy(desc(eventFundRequests.createdAt)),
    db
      .select()
      .from(eventFundRequests)
      .where(and(eq(eventFundRequests.eventId, eventId), ne(eventFundRequests.status, "diajukan")))
      .orderBy(desc(eventFundRequests.createdAt))
      .limit(historyLimit),
  ]);
  return [...pending, ...history].map(view);
}

async function budgetCodesFor(eventId: string) {
  const [row] = await getDb().select({ data: eventPublicFinance.data }).from(eventPublicFinance).where(eq(eventPublicFinance.eventId, eventId)).limit(1);
  const finance = publicFinanceSchema.safeParse(row?.data).data ?? EMPTY_PUBLIC_FINANCE;
  return finance.budgetLines.map((l) => ({ code: l.code, name: l.name }));
}

/** Bagian Ruang Panitia: hanya Ketua/Bendahara (lihat + ajukan). Selain itu null. */
export async function panitiaFundRequests(eventId: string | null, roles: CrewRole[]) {
  if (!eventId || !roles.some((r) => FUND_SUBMITTERS.includes(r))) return null;
  const [items, budgetCodes] = await Promise.all([listFor(eventId, 50), budgetCodesFor(eventId)]);
  return { items, budgetCodes };
}

/** Simpan bukti (sudah dicek jenis + ukuran + isi). Mengembalikan nama berkas acak. */
async function storeProof(file: { type: string; bytes: Uint8Array }) {
  const ext = FUND_PROOF_TYPES[file.type.toLowerCase()];
  if (!ext) throw new LineupError("PROOF_UNSUPPORTED", "Bukti harus foto JPG/PNG/WebP atau PDF.", 400);
  if (!file.bytes.length) throw new LineupError("PROOF_MISSING", "Bukti wajib dilampirkan.", 400);
  if (file.bytes.length > FUND_PROOF_MAX_BYTES) throw new LineupError("PROOF_TOO_LARGE", "Bukti maksimal 5 MB.", 413);
  if (!proofContentMatches(file.bytes, ext)) throw new LineupError("PROOF_MISMATCH", "Isi berkas tidak sesuai formatnya.", 400);
  const name = `${randomUUID()}${ext}`;
  await mkdir(fundProofDir(), { recursive: true });
  await writeFile(path.join(fundProofDir(), name), file.bytes, { flag: "wx" });
  return name;
}

export async function submitFundRequest(input: FundRequestInput, proof: { type: string; bytes: Uint8Array } | null, garage: GarageSession) {
  assertHuman(garage);
  const db = getDb();
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, input.eventId)).limit(1);
  if (!event) throw new LineupError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  const roles = await crewRoles(garage, event.id);
  if (!roles.some((r) => FUND_SUBMITTERS.includes(r))) throw new LineupError("FORBIDDEN", "Hanya Ketua atau Bendahara panitia event ini yang bisa mengajukan dana.", 403);
  if (input.kind === "keluar" && !(await budgetCodesFor(event.id)).some((l) => l.code === input.budgetCode)) {
    throw new LineupError("BUDGET_CODE_UNKNOWN", "Pos RAB tidak ada di Transparansi event ini.", 400);
  }
  if (!proof) throw new LineupError("PROOF_MISSING", "Bukti wajib dilampirkan.", 400);
  const proofFile = await storeProof(proof);
  const [row] = await db
    .insert(eventFundRequests)
    .values({
      eventId: event.id,
      kind: input.kind,
      date: input.date,
      amount: input.amount,
      party: input.party,
      budgetCode: input.kind === "keluar" ? input.budgetCode : null,
      payKind: input.kind === "keluar" ? input.payKind : "",
      description: input.description,
      proofFile,
      submittedBy: garage.user.id,
      submittedByName: garage.user.name ?? "Panitia",
    })
    .returning();
  await createAuditLog({
    actor: `${garage.user.name ?? "Panitia"} (panitia)`,
    action: `Ajukan dana ${row.kind}`,
    object: event.title,
    device: garage.profile.deviceLabel ?? "Ruang Panitia",
    metadata: { module: "event-fund-request", via: "panitia", eventId: event.id, requestId: row.id, kind: row.kind, amount: row.amount, budgetCode: row.budgetCode },
  });
  await notifyOwners(event, row);
  return view(row);
}

async function notifyOwners(event: { id: string; title: string }, row: typeof eventFundRequests.$inferSelect) {
  try {
    const owners = await getDb()
      .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
      .from(staffProfiles)
      .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
    const { notifyStaff } = await import("@/lib/staff-notifications");
    for (const owner of owners) {
      await notifyStaff({
        outletId: owner.outletId,
        audience: "user",
        userId: owner.userId,
        kind: "event_fund_request",
        severity: "info",
        title: `Pengajuan dana ${row.kind} menunggu pengesahan`,
        body: `${row.submittedByName} · ${event.title}. Periksa bukti di Transparansi.`,
        url: `/control/event-transparency?eventId=${event.id}`,
        dedupKey: `event-fund-request:${row.id}:${owner.userId}`,
      }).catch(() => null);
    }
  } catch {
    // Notifikasi gagal tidak membatalkan pengajuan.
  }
}

/** Owner: daftar pengajuan satu event (terbaru dulu). */
export async function listFundRequests(eventId: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  return { items: await listFor(eventId) };
}

/** Owner: sahkan (→ Transparansi, transaksi yang sama) atau tolak (alasan wajib). Hanya dari status "diajukan". */
export async function decideFundRequest(id: string, input: { action: "sahkan" | "tolak"; note: string }, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const [current] = await db.select().from(eventFundRequests).where(eq(eventFundRequests.id, id)).limit(1);
  if (!current) throw new LineupError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
  if (current.status !== "diajukan") throw new LineupError("ALREADY_DECIDED", "Pengajuan ini sudah diputuskan.", 409);
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, current.eventId)).limit(1);

  const saved = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(eventFundRequests)
      .set({ status: input.action === "sahkan" ? "disahkan" : "ditolak", decidedBy: garage.user.id, decidedAt: new Date(), decisionNote: input.note || null })
      .where(and(eq(eventFundRequests.id, id), eq(eventFundRequests.status, "diajukan")))
      .returning();
    if (!claimed) throw new LineupError("ALREADY_DECIDED", "Pengajuan ini sudah diputuskan.", 409);
    if (input.action === "sahkan") {
      // Kunci baris Transparansi agar dua pengesahan bersamaan tidak saling menimpa. Baris dibuat dulu bila belum ada
      // (kosong, belum tampil), supaya selalu ada yang dikunci — pengesahan pertama pun berurutan.
      await tx.insert(eventPublicFinance).values({ eventId: claimed.eventId, enabled: false, data: EMPTY_PUBLIC_FINANCE, updatedBy: garage.user.id }).onConflictDoNothing();
      const [row] = await tx.select().from(eventPublicFinance).where(eq(eventPublicFinance.eventId, claimed.eventId)).for("update").limit(1);
      const finance = publicFinanceSchema.safeParse(row?.data).data ?? EMPTY_PUBLIC_FINANCE;
      const applied = applyFundRequest(finance, { ...claimed, date: String(claimed.date) });
      if ("error" in applied) throw new LineupError("FINANCE_REJECTED", applied.error, 409);
      const parsed = publicFinanceSchema.safeParse(applied.finance);
      if (!parsed.success) throw new LineupError("FINANCE_REJECTED", parsed.error.issues[0]?.message ?? "Data Transparansi tidak valid.", 409);
      const now = new Date();
      // Saklar tampil tidak diubah (baris baru = belum tampil, sama seperti Transparansi).
      await tx.update(eventPublicFinance).set({ data: parsed.data, updatedBy: garage.user.id, updatedAt: now }).where(eq(eventPublicFinance.eventId, claimed.eventId));
    }
    return claimed;
  });

  await createAuditLog({
    actor: garage.user.name ?? "Owner",
    action: input.action === "sahkan" ? `Sahkan pengajuan dana ${saved.kind}` : `Tolak pengajuan dana ${saved.kind}`,
    object: event?.title ?? saved.eventId,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: { module: "event-fund-request", eventId: saved.eventId, requestId: saved.id, amount: saved.amount, note: input.note || null },
  });
  return view(saved);
}

/** Bukti pengajuan: Owner, pengaju, atau Ketua/Bendahara event itu. */
export async function readFundProof(id: string, garage: GarageSession) {
  assertHuman(garage);
  const [row] = await getDb().select().from(eventFundRequests).where(eq(eventFundRequests.id, id)).limit(1);
  if (!row || !row.proofFile || !PROOF_NAME.test(row.proofFile)) throw new LineupError("NOT_FOUND", "Bukti tidak ditemukan.", 404);
  const allowed =
    garage.profile.role === "Owner" || row.submittedBy === garage.user.id || (await crewRoles(garage, row.eventId)).some((r) => FUND_SUBMITTERS.includes(r));
  if (!allowed) throw new LineupError("FORBIDDEN", "Anda tidak berhak melihat bukti ini.", 403);
  const bytes = await readFile(path.join(fundProofDir(), row.proofFile)).catch(() => null);
  if (!bytes) throw new LineupError("NOT_FOUND", "Berkas bukti tidak ditemukan.", 404);
  const ext = row.proofFile.slice(row.proofFile.lastIndexOf("."));
  const type = Object.entries(FUND_PROOF_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return { bytes, type, name: `bukti-${row.id.slice(0, 8)}${ext}` };
}
