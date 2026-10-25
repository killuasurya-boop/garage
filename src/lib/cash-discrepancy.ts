// Status selisih kas laci (P3 closing, owner Okt 2026) — dipakai UI, PDF & server.
// Hanya Rp0 = "ok". Ambang hanya menentukan eskalasi, bukan menyembunyikan selisih.
export const DISCREPANCY_STATUS_LABEL: Record<string, string> = {
  ok: "Balance",
  minor: "Selisih kecil",
  review: "Perlu diperiksa",
  critical: "Kritis",
};

export function discrepancyStatusLabel(status: string | null | undefined) {
  return DISCREPANCY_STATUS_LABEL[status ?? ""] ?? "Kritis";
}
