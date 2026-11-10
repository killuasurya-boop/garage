// =============================================================================
// Notifikasi WMS (Smart Notification V2, Tahap 1.3). Satu notifikasi per dokumen
// per pengajuan (dedup), ke manajemen saja; selesai (resolved) begitu diputus.
// Tidak pernah menggagalkan mutasi gudang yang sudah tersimpan.
// =============================================================================

type PoLike = { id: string; doc: string; supplierName: string | null; revision: number; submittedAt: Date | null };
type OpnameLike = { id: string; doc: string; submittedAt: Date | null };

async function staff() {
  return import("@/lib/staff-notifications");
}

export async function notifyPoPendingApproval(po: PoLike, actorName: string) {
  try {
    const { notifyStaff } = await staff();
    await notifyStaff({
      outletId: null,
      audience: "management",
      kind: "po_approval",
      severity: "warning",
      title: `PO ${po.doc} menunggu persetujuan${po.revision > 1 ? ` (revisi ${po.revision})` : ""}`,
      body: `${po.supplierName || "Supplier"} · diajukan ${actorName}. Penyetuju ≠ pembuat.`,
      url: "/warehouse/purchase-orders",
      dedupKey: `po_approval:${po.id}:${po.revision}:${po.submittedAt?.getTime() ?? 0}`,
    });
  } catch (error) {
    console.error("[wms-notify] PO", error);
  }
}

export async function resolvePoApproval(poId: string, reason: string) {
  const { resolveStaffNotifications } = await staff();
  await resolveStaffNotifications({ dedupPrefixes: [`po_approval:${poId}:`] }, reason);
}

export async function notifyOpnameSubmitted(op: OpnameLike, ownerOnly: boolean) {
  try {
    const { notifyStaff } = await staff();
    await notifyStaff({
      outletId: null,
      audience: "management",
      kind: "opname_review",
      severity: ownerOnly ? "urgent" : "warning",
      title: `Opname ${op.doc} ${ownerOnly ? "perlu persetujuan OWNER" : "menunggu tinjauan"}`,
      body: ownerOnly ? "Ada selisih di atas batas Owner." : "Cek hasil hitung lalu setujui atau minta hitung ulang.",
      url: "/warehouse/opname",
      dedupKey: `opname_review:${op.id}:${op.submittedAt?.getTime() ?? 0}`,
    });
  } catch (error) {
    console.error("[wms-notify] opname", error);
  }
}

export async function resolveOpnameReview(opnameId: string, reason: string) {
  const { resolveStaffNotifications } = await staff();
  await resolveStaffNotifications({ dedupPrefixes: [`opname_review:${opnameId}:`] }, reason);
}
