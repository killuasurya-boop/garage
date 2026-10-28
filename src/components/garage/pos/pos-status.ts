// Label & warna status POS (dipindah dari pos-view.tsx tanpa perubahan perilaku, U0e).

export type QrWorkTab = "incoming" | "history" | "table_map" | "qr_control" | "follow_up" | "qr_tables";

export const statusClass: Record<string, string> = {
  ready: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  safe: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  healthy: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  info: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  warning: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  draft: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  critical: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  controlled: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  read_only: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  not_required: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  pending: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  pending_approval: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  pending_cashier: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  awaiting_payment: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  accepted: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  paid: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  sent: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  not_sent: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  qr_table: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  qr_takeaway: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  approved: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  applied: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  rejected: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  completed: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  planned: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  blocked: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  deterministic: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  fast: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  basic: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  limited: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  sold_out: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  watch: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  manager: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  operational: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  owner_free_chat: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  async: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  low: "border-[#ff2a3a]/45 bg-[#ff2a3a]/14 text-[#ffc2c8]",
  queue: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  cooking: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  delivered: "border-[#4a4a54] bg-[#222229] text-[#d0d0d6]",
  high: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  finance: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  financial: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  executive: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  medium: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  recorded: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  approval_required: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  missing: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  error: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  failed: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  skipped: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  untested: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
};

const BILL_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  pending_cashier: "Menunggu kasir",
  accepted: "Diterima dapur",
  ready: "Siap",
  awaiting_payment: "Menunggu bayar",
  paid: "Lunas",
  rejected: "Ditolak",
  voided: "Dibatalkan",
  cancelled: "Dibatalkan",
};

export function billStatusLabel(status: string) {
  return BILL_STATUS_LABEL[status] ?? status;
}

// Label + warna status tiket dapur (per station). null = order belum masuk dapur
// (mis. masih menunggu kasir). Status per item mewarisi status station-nya.
const kitchenStatusLabels: Record<string, string> = {
  queue: "Antre",
  cooking: "Dimasak",
  ready: "Siap",
  delivered: "Diantar",
  completed: "Selesai",
};
export function kitchenStatusLabel(status: string | null) {
  if (!status) return "Belum masuk dapur";
  return kitchenStatusLabels[status] ?? status;
}
export function kitchenStatusTone(status: string | null) {
  if (status === "ready") return "border-[#22c55e]/50 bg-[#22c55e]/14 text-[#dcfce7]";
  if (status === "delivered" || status === "completed")
    return "border-[#4a4a54] bg-white/[0.06] text-[#b8b8bf]";
  if (status === "cooking") return "border-[#f5a742]/50 bg-[#f5a742]/14 text-[#ffd08a]";
  if (status === "queue") return "border-[#d11a2a]/50 bg-[#d11a2a]/14 text-[#ffc2c8]";
  return "border-[#4a4a54] bg-white/[0.04] text-[#9aa0a6]";
}
