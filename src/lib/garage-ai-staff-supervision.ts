import type { SystemAutopilotDraftInput } from "@/lib/garage-ai-alerts";
import type { Role } from "@/lib/garage-data";
import {
  getApprovalData,
  getApprovalStats,
  getAuditData,
  getFinanceGuardSummary,
  getInventoryData,
  getKitchenData,
  getQrControlInsights,
} from "@/lib/garage-service";

export type AiStaffSupervisionKind = "mistake" | "correction" | "coaching";
export type AiStaffSupervisionGroup = "floor" | "kitchen" | "inventory" | "control";

const FLOOR_ROLES: Role[] = [
  "Kasir",
  "Waiter 1",
  "Waiter 2",
  "Supervisor Shift",
  "Manager Operasional",
  "Admin",
  "Owner / CEO",
];

const KITCHEN_ROLES: Role[] = [
  "Barista",
  "Koki",
  "Asisten Koki",
  "Kitchen / Barista",
  "Supervisor Shift",
  "Manager Operasional",
  "Admin",
  "Owner / CEO",
];

const INVENTORY_ROLES: Role[] = [
  "Gudang",
  "Manager Operasional",
  "Admin",
  "Owner / CEO",
];

const SUPERVISOR_ROLES: Role[] = [
  "Supervisor Shift",
  "Manager Operasional",
  "Admin",
  "Owner / CEO",
];

const MANAGEMENT_ROLES: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
  "Supervisor Shift",
];

const FINANCE_ROLES: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
];

const AUDIT_PROBLEM_STATUSES = new Set([
  "critical",
  "blocked",
  "warning",
  "flagged",
  "error",
]);

const PAYMENT_STUCK_MINUTES = 8;
const APPROVAL_STALE_HOURS = 2;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function uniqueRoles(...groups: Role[][]) {
  return [...new Set(groups.flat())];
}

function supervisionDraft(
  input: Omit<SystemAutopilotDraftInput, "actionType" | "source"> & {
    supervisionKind: AiStaffSupervisionKind;
    staffGroup: AiStaffSupervisionGroup;
    fixAction: string;
    notifySupervisor?: boolean;
  },
): SystemAutopilotDraftInput {
  const prefix =
    input.supervisionKind === "mistake"
      ? "Kesalahan"
      : input.supervisionKind === "correction"
        ? "Perlu dibenahi"
        : "Pengingat SOP";

  const targetRoles = input.notifySupervisor
    ? uniqueRoles(input.targetRoles, SUPERVISOR_ROLES)
    : input.targetRoles;

  return {
    actionType: "staff_supervision",
    agentId: input.agentId,
    title: input.title.startsWith(prefix) ? input.title : `${prefix}: ${input.title}`,
    detail: input.detail,
    riskLevel: input.riskLevel,
    priority: input.priority,
    targetRoles,
    fingerprint: input.fingerprint,
    source: "staff_supervision_job",
    metadata: {
      ...(input.metadata ?? {}),
      category: "staff_supervision",
      channel: "staff_supervision",
      supervisionKind: input.supervisionKind,
      staffGroup: input.staffGroup,
      fixAction: input.fixAction,
    },
  };
}

function parseApprovalAgeHours(age: string) {
  const hourMatch = age.match(/(\d+)\s*jam/i);
  if (hourMatch) {
    return Number(hourMatch[1]);
  }

  const dayMatch = age.match(/(\d+)\s*hari/i);
  if (dayMatch) {
    return Number(dayMatch[1]) * 24;
  }

  return 0;
}

function jakartaTodayIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export async function buildStaffSupervisionDrafts(): Promise<SystemAutopilotDraftInput[]> {
  const today = jakartaTodayIso();
  const [qr, kitchen, inventory, approvals, approvalStats, audit, finance] =
    await Promise.all([
      getQrControlInsights(),
      getKitchenData(),
      getInventoryData(),
      getApprovalData({ status: "pending" }),
      getApprovalStats(),
      getAuditData({ dateFrom: today, limit: 80 }),
      getFinanceGuardSummary().catch(() => null),
    ]);

  const drafts: SystemAutopilotDraftInput[] = [];

  for (const alert of qr.pendingAlerts.slice(0, 5)) {
    drafts.push(
      supervisionDraft({
        agentId: "pos_agent",
        supervisionKind: alert.minutesWaiting >= 5 ? "mistake" : "correction",
        staffGroup: "floor",
        title: `QR meja ${alert.tableLabel} belum direspons kasir`,
        detail: `Order ${alert.orderNo} menunggu ${alert.minutesWaiting} menit (SLA ${qr.pendingSlaMinutes} menit). Total ${formatCurrency(alert.total)}.`,
        fixAction:
          "Buka POS → validasi order QR → Accept atau Reject dengan alasan jelas. Jangan biarkan tamu menunggu tanpa respon.",
        riskLevel: alert.minutesWaiting >= 5 ? "high" : "medium",
        priority: alert.minutesWaiting >= 5 ? "high" : "medium",
        targetRoles: FLOOR_ROLES,
        fingerprint: `staff:qr-pending:${alert.orderId}`,
        notifySupervisor: alert.minutesWaiting >= 5,
        metadata: { orderId: alert.orderId, tableLabel: alert.tableLabel },
      }),
    );
  }

  const paymentStuck = qr.recentOrders.filter((order) => {
    if (order.status !== "awaiting_payment") {
      return false;
    }

    const createdAt = Date.parse(order.createdAt);
    if (!Number.isFinite(createdAt)) {
      return false;
    }

    return Date.now() - createdAt >= PAYMENT_STUCK_MINUTES * 60_000;
  });

  for (const order of paymentStuck.slice(0, 3)) {
    drafts.push(
      supervisionDraft({
        agentId: "pos_agent",
        supervisionKind: "correction",
        staffGroup: "floor",
        title: `Pembayaran order ${order.orderNo} tertunda`,
        detail: `Meja ${order.tableLabel} sudah diterima tetapi pembayaran belum selesai. Status ${order.status}.`,
        fixAction:
          "Kasir follow-up meja tersebut: proses bayar di POS atau koordinasi dengan waiter jika tamu masih di meja.",
        riskLevel: "medium",
        priority: "medium",
        targetRoles: FLOOR_ROLES,
        fingerprint: `staff:payment-stuck:${order.id}`,
        notifySupervisor: true,
        metadata: { orderId: order.id, orderNo: order.orderNo },
      }),
    );
  }

  if (qr.summary.rejected >= 3) {
    const topReason = qr.rejectedReasons[0];
    drafts.push(
      supervisionDraft({
        agentId: "pos_agent",
        supervisionKind: "coaching",
        staffGroup: "floor",
        title: "Banyak order QR ditolak hari ini",
        detail: `Total ${qr.summary.rejected} penolakan. Alasan teratas: ${topReason?.reason ?? "belum tercatat"} (${topReason?.count ?? 0}x).`,
        fixAction:
          "Supervisor review alasan tolak: pastikan kasir jelaskan ke tamu sebelum Reject dan catat alasan standar (stok habis, meja pindah, dll.).",
        riskLevel: qr.summary.rejected >= 6 ? "high" : "medium",
        priority: qr.summary.rejected >= 6 ? "high" : "medium",
        targetRoles: FLOOR_ROLES,
        fingerprint: `staff:qr-reject:${qr.summary.rejected}`,
        notifySupervisor: true,
        metadata: { rejected: qr.summary.rejected },
      }),
    );
  }

  const lateKitchen = kitchen.filter(
    (ticket) =>
      ticket.status !== "delivered" &&
      typeof ticket.elapsed === "number" &&
      typeof ticket.targetMinutes === "number" &&
      ticket.elapsed > ticket.targetMinutes,
  );

  for (const ticket of lateKitchen.slice(0, 4)) {
    const overBy = ticket.elapsed - ticket.targetMinutes;
    drafts.push(
      supervisionDraft({
        agentId: "kitchen_agent",
        supervisionKind: overBy >= 5 ? "mistake" : "correction",
        staffGroup: "kitchen",
        title: `Ticket ${ticket.id} terlambat ${overBy} menit`,
        detail: `Station ${ticket.station} (${ticket.table}) status ${ticket.status}. Target ${ticket.targetMinutes} menit, sudah ${ticket.elapsed} menit.`,
        fixAction:
          "Prioritaskan ticket di KDS, cek bottleneck station, dan update status item saat sudah siap. Supervisor pantau jika delay berulang.",
        riskLevel: overBy >= 5 ? "high" : "medium",
        priority: overBy >= 5 ? "high" : "medium",
        targetRoles: KITCHEN_ROLES,
        fingerprint: `staff:kitchen-late:${ticket.id}`,
        notifySupervisor: overBy >= 5,
        metadata: { ticketId: ticket.id, station: ticket.station },
      }),
    );
  }

  const lowStock = inventory.filter((item) => item.status === "low");
  const watchStock = inventory.filter((item) => item.status === "watch");

  for (const item of lowStock.slice(0, 4)) {
    drafts.push(
      supervisionDraft({
        agentId: "inventory_agent",
        supervisionKind: "correction",
        staffGroup: "inventory",
        title: `Stok kritis belum ditangani: ${item.name}`,
        detail: `${item.name} (${item.sku}) tersisa ${item.onHand} ${item.unit}, minimum ${item.min}.`,
        fixAction:
          "Gudang cek fisik stok, input movement/receiving, atau ajukan reorder. Jangan lanjut produksi menu yang pakai bahan ini tanpa konfirmasi manager.",
        riskLevel: "high",
        priority: "high",
        targetRoles: INVENTORY_ROLES,
        fingerprint: `staff:stock-low:${item.sku}`,
        notifySupervisor: true,
        metadata: { sku: item.sku },
      }),
    );
  }

  for (const item of watchStock.slice(0, 2)) {
    drafts.push(
      supervisionDraft({
        agentId: "inventory_agent",
        supervisionKind: "coaching",
        staffGroup: "inventory",
        title: `Stok mendekati minimum: ${item.name}`,
        detail: `${item.name} (${item.sku}) ${item.onHand} ${item.unit}, batas aman ${item.min}.`,
        fixAction: "Rencanakan replenishment hari ini agar tidak masuk status kritis.",
        riskLevel: "medium",
        priority: "medium",
        targetRoles: INVENTORY_ROLES,
        fingerprint: `staff:stock-watch:${item.sku}`,
        metadata: { sku: item.sku },
      }),
    );
  }

  const staleApprovals = approvals.filter(
    (row) => parseApprovalAgeHours(row.age) >= APPROVAL_STALE_HOURS,
  );

  for (const row of staleApprovals.slice(0, 3)) {
    drafts.push(
      supervisionDraft({
        agentId: "approval_agent",
        supervisionKind: "correction",
        staffGroup: "control",
        title: `Approval ${row.type} terlalu lama pending`,
        detail: `${row.requester} menunggu ${row.age}. Alasan: ${row.reason}. Risiko ${row.risk}.`,
        fixAction:
          row.type.toLowerCase().includes("void") || row.type.toLowerCase().includes("refund")
            ? "Pemohon pastikan bukti lengkap; Supervisor/Manager putuskan di modul Approvals hari ini."
            : "Manager/Owner tinjau di Approvals — jangan biarkan pending mengganggu operasi shift.",
        riskLevel: row.risk === "high" || row.risk === "High" ? "high" : "medium",
        priority: row.risk === "high" || row.risk === "High" ? "high" : "medium",
        targetRoles: MANAGEMENT_ROLES,
        fingerprint: `staff:approval-stale:${row.id}`,
        notifySupervisor: true,
        metadata: { approvalId: row.id, type: row.type },
      }),
    );
  }

  if (approvalStats.pending >= 3) {
    drafts.push(
      supervisionDraft({
        agentId: "approval_agent",
        supervisionKind: "coaching",
        staffGroup: "control",
        title: `${approvalStats.pending} approval menumpuk`,
        detail: `Termasuk ${approvalStats.pendingHighRisk} risiko tinggi. Rata-rata putus ${approvalStats.avgDecideMinutes} menit.`,
        fixAction:
          "Supervisor/Manager alokasikan 10 menit untuk kosongkan antrian approval sebelum peak hour.",
        riskLevel: approvalStats.pendingHighRisk > 0 ? "high" : "medium",
        priority: approvalStats.pending >= 5 ? "high" : "medium",
        targetRoles: MANAGEMENT_ROLES,
        fingerprint: `staff:approval-backlog:${approvalStats.pending}`,
        notifySupervisor: false,
        metadata: { pending: approvalStats.pending },
      }),
    );
  }

  const auditProblems = audit.rows.filter((row) =>
    AUDIT_PROBLEM_STATUSES.has(row.status.toLowerCase()),
  );

  const actorProblems = new Map<string, number>();
  for (const row of auditProblems) {
    actorProblems.set(row.actor, (actorProblems.get(row.actor) ?? 0) + 1);
  }

  for (const [actor, count] of Array.from(actorProblems.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)) {
    const latest = auditProblems.find((row) => row.actor === actor);
    drafts.push(
      supervisionDraft({
        agentId: "supervisor",
        supervisionKind: count >= 2 ? "mistake" : "correction",
        staffGroup: "control",
        title: `Aktivitas bermasalah: ${actor}`,
        detail: `${count} kejadian hari ini. Terakhir: ${latest?.action ?? "—"} (${latest?.status ?? "—"}).`,
        fixAction:
          "Karyawan terkait review langkah yang salah; Supervisor dokumentasikan koreksi singkat di handover shift.",
        riskLevel: latest?.status === "critical" || latest?.status === "blocked" ? "high" : "medium",
        priority: latest?.status === "critical" || latest?.status === "blocked" ? "high" : "medium",
        targetRoles: SUPERVISOR_ROLES,
        fingerprint: `staff:audit-actor:${actor}:${count}`,
        notifySupervisor: false,
        metadata: { actor, count },
      }),
    );
  }

  const financeRisks = finance?.guard?.risks ?? [];
  if (financeRisks.length) {
    for (const risk of financeRisks.slice(0, 2)) {
      if (!risk || risk.level === "watch") {
        continue;
      }

      drafts.push(
        supervisionDraft({
          agentId: "finance_guard_agent",
          supervisionKind: risk.level === "critical" ? "mistake" : "correction",
          staffGroup: "control",
          title: risk.area,
          detail: risk.message,
          fixAction:
            risk.area.toLowerCase().includes("cash")
              ? "Kasir/Finance rekonsiliasi kas dengan bukti fisik; Manager approve selisih bila sudah valid."
              : "Finance selesaikan rekonsiliasi dan update status di modul Finance hari ini.",
          riskLevel: risk.level === "critical" ? "high" : "medium",
          priority: risk.level === "critical" ? "high" : "medium",
          targetRoles:
            risk.area.toLowerCase().includes("cash")
              ? uniqueRoles(FLOOR_ROLES, FINANCE_ROLES)
              : FINANCE_ROLES,
          fingerprint: `staff:finance-guard:${risk.area}:${risk.level}`,
          notifySupervisor: true,
          metadata: { area: risk.area, level: risk.level },
        }),
      );
    }
  }

  if (qr.shiftReport.gate === "WATCH") {
    drafts.push(
      supervisionDraft({
        agentId: "daily_brief_agent",
        supervisionKind: "coaching",
        staffGroup: "control",
        title: "Shift gate WATCH — perlu perhatian supervisor",
        detail: qr.shiftReport.lines.join(" "),
        fixAction:
          "Supervisor briefing 5 menit dengan kasir & kitchen: fokus QR SLA, delay ticket, dan penolakan order.",
        riskLevel: "medium",
        priority: "medium",
        targetRoles: MANAGEMENT_ROLES,
        fingerprint: `staff:shift-gate:${qr.shiftReport.gate}`,
        metadata: { gate: qr.shiftReport.gate },
      }),
    );
  }

  return drafts;
}
