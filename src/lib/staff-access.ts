// =============================================================================
// I3 — Pengajuan akses staf + Owner Access Approval Center (PRD V4.0 §06.5–06.6,
// F44/F45, AC-I04–I07).
//
// - Mendaftar membuat `staff_access_requests`, BUKAN staff_profiles → pemohon
//   tetap ditolak semua API staf (STAFF_PROFILE_MISSING) sampai disetujui.
// - Jabatan & outlet dari Owner (allowlist), tidak pernah dari input pemohon.
// - Hanya Owner dengan 2FA aktif yang memutuskan; percobaan peran lain ditolak
//   dan tercatat di audit (AC-I07).
// - Setujui = profil staf dibuat atomik bersama status pengajuan (+ audit).
// - Verifikasi email/WhatsApp (I1/I2) belum tersedia: status kontak ditampilkan
//   apa adanya ("belum terverifikasi") agar Owner memverifikasi secara operasional.
// =============================================================================
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, outlets, staffAccessRequests, staffProfiles, user } from "@/db/schema";
import { attachAbsenIdentity, workstationForRole } from "@/lib/admin-user-service";
import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { normalizeWaNumber } from "@/lib/whatsapp-link";

export const ACCESS_REQUEST_STATUSES = ["pending_owner_approval", "needs_info", "approved", "rejected"] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];
const OPEN_STATUSES: AccessRequestStatus[] = ["pending_owner_approval", "needs_info"];

/** Peran yang boleh diberikan lewat pengajuan. Owner tidak pernah lewat jalur ini. */
export const APPROVABLE_ROLES = ["Manajer", "Kasir", "Waiter"] as const satisfies readonly Role[];
export type ApprovableRole = (typeof APPROVABLE_ROLES)[number];

export class StaffAccessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "StaffAccessError";
  }
}

type Db = ReturnType<typeof getDb>;

async function audit(db: Db, entry: { actor: string; action: string; object: string; status: string; metadata: Record<string, unknown> }) {
  await db.insert(auditLogs).values({
    time: new Date().toISOString(),
    actor: entry.actor,
    action: entry.action,
    object: entry.object,
    device: "access-approval",
    status: entry.status,
    metadata: entry.metadata,
  });
}

/** WA tersamarkan untuk kartu identitas (PRD §06.6): +62 812-****-7890. */
export function maskPhone(e164: string) {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 8) return "****";
  return `+${digits.slice(0, 2)} ${digits.slice(2, 5)}-****-${digits.slice(-4)}`;
}

// ─── Pemohon ────────────────────────────────────────────────────────────────

export async function getMyAccessRequest(userId: string) {
  const db = getDb();
  const [[profile], [request]] = await Promise.all([
    db.select({ id: staffProfiles.id, role: staffProfiles.role, status: staffProfiles.status }).from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1),
    db.select().from(staffAccessRequests).where(eq(staffAccessRequests.userId, userId)).limit(1),
  ]);
  return {
    hasStaffProfile: Boolean(profile),
    request: request
      ? {
          id: request.id,
          status: request.status as AccessRequestStatus,
          legalName: request.legalName,
          phone: maskPhone(request.phone),
          requestedPosition: request.requestedPosition,
          note: request.note,
          infoRequest: request.infoRequest,
          decisionReason: request.status === "rejected" ? request.decisionReason : null,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Ajukan / perbarui pengajuan. Input hanya data diri — tidak ada field peran,
 * outlet, atau status (AC-I05: server mengabaikan field lain apa pun).
 */
export async function submitAccessRequest(
  account: { id: string; name: string; email: string; emailVerified: boolean },
  input: { legalName: string; phone: string; requestedPosition: string; note?: string | null },
) {
  const legalName = input.legalName.trim();
  const position = input.requestedPosition.trim();
  const phone = normalizeWaNumber(input.phone);
  if (legalName.length < 3) throw new StaffAccessError("VALIDATION_ERROR", "Nama lengkap minimal 3 huruf.");
  if (position.length < 2) throw new StaffAccessError("VALIDATION_ERROR", "Isi posisi yang dilamar.");
  if (!phone) throw new StaffAccessError("INVALID_PHONE", "Nomor WhatsApp tidak valid (contoh 0812xxxxxxx).");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [profile] = await tx.select({ id: staffProfiles.id }).from(staffProfiles).where(eq(staffProfiles.userId, account.id)).limit(1);
    if (profile) throw new StaffAccessError("ALREADY_STAFF", "Akun ini sudah terdaftar sebagai staf.", 409);
    const [existing] = await tx.select().from(staffAccessRequests).where(eq(staffAccessRequests.userId, account.id)).for("update").limit(1);
    if (existing && !OPEN_STATUSES.includes(existing.status as AccessRequestStatus)) {
      throw new StaffAccessError(
        "REQUEST_CLOSED",
        existing.status === "rejected" ? "Pengajuan sudah ditolak Owner. Hubungi Owner untuk banding." : "Pengajuan sudah diputuskan.",
        409,
      );
    }
    const values = {
      legalName,
      phone: `+${phone}`,
      requestedPosition: position,
      note: input.note?.trim() || null,
      status: "pending_owner_approval" as const,
      emailVerified: account.emailVerified,
      updatedAt: new Date(),
    };
    const [row] = existing
      ? await tx.update(staffAccessRequests).set(values).where(eq(staffAccessRequests.id, existing.id)).returning()
      : await tx.insert(staffAccessRequests).values({ ...values, userId: account.id }).returning();
    await audit(tx as unknown as Db, {
      actor: account.name,
      action: existing ? "Staff access request updated" : "Staff access request submitted",
      object: account.email,
      status: "pending_owner_approval",
      metadata: { requestId: row.id, userId: account.id, requestedPosition: position },
    });
    return row;
  }).then(async (row) => {
    // Notifikasi Owner/Manajemen di lonceng Garage OS (PRD §06.5 langkah 6).
    try {
      const { notifyStaff } = await import("@/lib/staff-notifications");
      await notifyStaff({
        outletId: null,
        audience: "management",
        kind: "staff_access_request",
        severity: "info",
        title: `Pengajuan akses staf: ${row.legalName}`,
        body: `${row.requestedPosition} · menunggu persetujuan Owner`,
        url: "/control/access-approval",
        dedupKey: `staff-access:${row.id}:${row.updatedAt.getTime()}`,
      });
    } catch {
      // Notifikasi gagal tidak membatalkan pengajuan.
    }
    return { id: row.id, status: row.status as AccessRequestStatus };
  });
}

// ─── Owner Access Approval Center ──────────────────────────────────────────

export async function listAccessRequests(filter: { status?: AccessRequestStatus | "open" | "all" } = {}) {
  const status = filter.status ?? "open";
  const statuses = status === "all" ? null : status === "open" ? OPEN_STATUSES : [status];
  const rows = await getDb()
    .select({ request: staffAccessRequests, email: user.email, accountName: user.name, outletName: outlets.name })
    .from(staffAccessRequests)
    .innerJoin(user, eq(user.id, staffAccessRequests.userId))
    .leftJoin(outlets, eq(outlets.id, staffAccessRequests.approvedOutletId))
    .where(statuses ? inArray(staffAccessRequests.status, statuses) : undefined)
    .orderBy(desc(staffAccessRequests.createdAt))
    .limit(200);
  return rows.map(({ request, email, accountName, outletName }) => ({
    id: request.id,
    status: request.status as AccessRequestStatus,
    legalName: request.legalName,
    accountName,
    email,
    emailVerified: request.emailVerified,
    phone: maskPhone(request.phone),
    whatsappVerified: request.whatsappVerified,
    requestedPosition: request.requestedPosition,
    note: request.note,
    infoRequest: request.infoRequest,
    decisionReason: request.decisionReason,
    approvedRole: request.approvedRole,
    approvedOutlet: outletName,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  }));
}

export type AccessDecisionInput =
  | { decision: "approve"; role: ApprovableRole; outletId: string; position?: string | null; workstation?: string | null; reason: string }
  | { decision: "reject"; reason: string }
  | { decision: "request_info"; reason: string };

async function assertOwnerStepUp(garage: GarageSession, requestId: string) {
  const db = getDb();
  if (garage.profile.role !== "Owner" || garage.profile.agentKey) {
    // AC-I07: Manajer/peran lain/API key → 403 dan tercatat.
    await audit(db, {
      actor: garage.user.name,
      action: "Staff access decision denied",
      object: requestId,
      status: "denied",
      metadata: { requestId, role: garage.profile.role, agentKey: garage.profile.agentKey?.label ?? null },
    });
    throw new StaffAccessError("OWNER_ONLY", "Hanya Owner yang boleh memutuskan pengajuan akses staf.", 403);
  }
  // Step-up MFA (PRD §06.5 langkah 8): Owner wajib sudah mengaktifkan 2FA.
  const [owner] = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, garage.user.id)).limit(1);
  if (!owner?.twoFactorEnabled) {
    throw new StaffAccessError("TWO_FACTOR_REQUIRED", "Aktifkan 2FA Owner dulu (/control/2fa) sebelum menyetujui akses staf.", 403);
  }
}

export async function decideAccessRequest(requestId: string, input: AccessDecisionInput, garage: GarageSession) {
  await assertOwnerStepUp(garage, requestId);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new StaffAccessError("REASON_REQUIRED", "Tulis alasan keputusan (min. 3 huruf).");
  if (input.decision === "approve" && !(APPROVABLE_ROLES as readonly string[]).includes(input.role)) {
    throw new StaffAccessError("ROLE_NOT_ALLOWED", `Peran harus salah satu: ${APPROVABLE_ROLES.join(", ")}.`);
  }

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(staffAccessRequests).where(eq(staffAccessRequests.id, requestId)).for("update").limit(1);
    if (!request) throw new StaffAccessError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
    if (!OPEN_STATUSES.includes(request.status as AccessRequestStatus)) {
      throw new StaffAccessError("ALREADY_DECIDED", `Pengajuan sudah ${request.status}.`, 409);
    }
    const now = new Date();
    const [account] = await tx.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, request.userId)).limit(1);

    if (input.decision === "approve") {
      const [outlet] = await tx.select({ id: outlets.id, status: outlets.status }).from(outlets).where(eq(outlets.id, input.outletId)).limit(1);
      if (!outlet || outlet.status !== "active") throw new StaffAccessError("OUTLET_INVALID", "Outlet tidak ditemukan / tidak aktif.");
      const [profile] = await tx.select({ id: staffProfiles.id }).from(staffProfiles).where(eq(staffProfiles.userId, request.userId)).limit(1);
      if (profile) throw new StaffAccessError("ALREADY_STAFF", "Akun ini sudah punya profil staf.", 409);
      await tx.insert(staffProfiles).values({
        userId: request.userId,
        outletId: outlet.id,
        role: input.role,
        position: input.position?.trim() || request.requestedPosition,
        workstation: workstationForRole(input.role, input.workstation),
        passwordResetRequired: false,
      });
    }

    const status: AccessRequestStatus = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "needs_info";
    await tx
      .update(staffAccessRequests)
      .set({
        status,
        decisionReason: input.decision === "request_info" ? request.decisionReason : reason,
        infoRequest: input.decision === "request_info" ? reason : request.infoRequest,
        approvedRole: input.decision === "approve" ? input.role : null,
        approvedOutletId: input.decision === "approve" ? input.outletId : null,
        decidedBy: garage.user.id,
        decidedAt: now,
        updatedAt: now,
      })
      .where(and(eq(staffAccessRequests.id, requestId), inArray(staffAccessRequests.status, OPEN_STATUSES)));
    await audit(tx as unknown as Db, {
      actor: garage.user.name,
      action: `Staff access ${input.decision}`,
      object: account?.email ?? request.userId,
      status,
      metadata: {
        requestId,
        userId: request.userId,
        before: { status: request.status },
        after: { status, role: input.decision === "approve" ? input.role : null, outletId: input.decision === "approve" ? input.outletId : null },
        reason,
      },
    });
    return { requestId, status, userId: request.userId, role: input.decision === "approve" ? input.role : null };
  });

  if (result.role) await attachAbsenIdentity(result.userId, result.role, input.decision === "approve" ? input.position ?? null : null);
  return result;
}
