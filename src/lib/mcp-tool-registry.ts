// Registry kemampuan AI Garage OS (PRD V4.0 §04 16 domain, §04.1 Module
// Registry, §07.2 risiko aksi R0–R4; batch M1). Setiap tool agent/MCP wajib
// menyatakan domain & risiko — tes memaksa ini. M2 memakai `risk` untuk
// mewajibkan preview + konfirmasi Owner pada R2/R3.

export const GARAGE_DOMAINS = [
  { id: "dashboard", no: 1, label: "Dashboard & Analytics" },
  { id: "pos", no: 2, label: "POS & Order" },
  { id: "shift_kas", no: 3, label: "Shift & Cash" },
  { id: "keuangan", no: 4, label: "Keuangan & Ledger" },
  { id: "produk_harga", no: 5, label: "Produk & Harga" },
  { id: "bahan_resep", no: 6, label: "Bahan & Resep" },
  { id: "gudang", no: 7, label: "Gudang / WMS" },
  { id: "dapur_bar", no: 8, label: "Bar / Kitchen / KDS" },
  { id: "member_crm", no: 9, label: "Member & CRM" },
  { id: "karyawan", no: 10, label: "Karyawan / HR" },
  { id: "event", no: 11, label: "Event & Invitation" },
  { id: "marketing", no: 12, label: "Konten & Marketing" },
  { id: "meja_qr", no: 13, label: "Meja & QR Ordering" },
  { id: "dokumen", no: 14, label: "Dokumen & Files" },
  { id: "notifikasi", no: 15, label: "Email & Notifikasi" },
  { id: "sistem", no: 16, label: "Config, Security & Ops" },
] as const;

export type GarageDomainId = (typeof GARAGE_DOMAINS)[number]["id"];

/**
 * R0 baca · R1 reversibel non-keuangan · R2 berdampak uang/stok/poin ·
 * R3 kritis/massal/identitas. R4 (hapus ledger/audit, SQL bebas, shell,
 * rahasia) tidak pernah menjadi tool — lihat R4_FORBIDDEN.
 */
export type ToolRisk = "R0" | "R1" | "R2" | "R3";

export const RISK_LABELS: Record<ToolRisk, string> = {
  R0: "Baca",
  R1: "Ubah reversibel",
  R2: "Dampak finansial",
  R3: "Kritis",
};

/** Kategori yang ditolak di semua jalur (PRD §07.2 R4, keputusan Owner D-01). */
export const R4_FORBIDDEN = [
  "Hapus/ubah baris buku kas (cash_ledger_entries) atau audit log — koreksi hanya lewat reversal",
  "SQL bebas, shell/VPS, akses berkas server",
  "Membaca atau menampilkan secret, token, password, kode OTP",
  "Potong gaji otomatis tanpa proses HR (PP 36/2021)",
] as const;

/** R2/R3 wajib preview + konfirmasi Owner (diterapkan di M2). */
export function riskNeedsConfirmation(risk: ToolRisk) {
  return risk === "R2" || risk === "R3";
}

export type CapabilityTool = { name: string; title: string; domain: GarageDomainId; risk: ToolRisk; write: boolean };

/** Peta kemampuan per domain + domain yang belum punya tool (missing capabilities). */
export function buildCapabilities(tools: CapabilityTool[]) {
  const domains = GARAGE_DOMAINS.map((domain) => {
    const own = tools.filter((tool) => tool.domain === domain.id);
    return {
      id: domain.id,
      no: domain.no,
      label: domain.label,
      tools: own.map((tool) => ({ name: tool.name, title: tool.title, risk: tool.risk, butuhKonfirmasi: riskNeedsConfirmation(tool.risk) })),
      bisaBaca: own.some((tool) => tool.risk === "R0"),
      bisaUbah: own.some((tool) => tool.risk !== "R0"),
    };
  });
  return {
    domains,
    belumTersedia: domains.filter((domain) => domain.tools.length === 0).map((domain) => domain.label),
    risiko: RISK_LABELS,
    selaluDitolak: R4_FORBIDDEN,
  };
}
