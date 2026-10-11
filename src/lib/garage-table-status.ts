// =============================================================================
// Status & warna meja untuk menu digital dan layar staf (owner, Okt 2026 —
// "Flow Pemesanan Menu Digital — Pilih Meja & Indikator Warna"). Hanya meja
// hijau (Kosong) yang bisa dipilih pelanggan; warna SELALU disertai label teks.
// Modul ini aman dipakai di klien (tanpa import server).
// =============================================================================

export type CustomerTableStatus = "available" | "held" | "occupied" | "reserved" | "cleaning";

/** Status staf (getTableLiveData) → status pelanggan. `null` = meja tidak ditampilkan. */
export function customerTableStatusFor(row: {
  status: string;
  needsCleaning?: boolean;
  active?: boolean;
}): CustomerTableStatus | null {
  if (row.active === false) return null;
  if (row.needsCleaning || row.status === "needs_cleaning" || row.status === "cleaning") return "cleaning";
  if (row.status === "empty") return "available";
  if (row.status === "held") return "held";
  if (row.status === "reserved") return "reserved";
  return "occupied";
}

export const CUSTOMER_TABLE_STATUS_COPY: Record<
  CustomerTableStatus,
  { label: string; hint: string; selectable: boolean }
> = {
  available: { label: "Kosong", hint: "Bisa dipilih", selectable: true },
  held: { label: "Sedang dipilih", hint: "Dipilih pelanggan lain", selectable: false },
  occupied: { label: "Terisi", hint: "Gabung dengan kode", selectable: false },
  reserved: { label: "Reserved", hint: "Sudah dipesan", selectable: false },
  cleaning: { label: "Perlu dibersihkan", hint: "Sedang disiapkan", selectable: false },
};

/** Warna PDF owner: hijau / kuning / merah / biru / abu-abu. */
export const TABLE_STATUS_COLORS: Record<CustomerTableStatus, { dot: string; border: string; bg: string; text: string }> = {
  available: { dot: "#22c55e", border: "rgba(34,197,94,0.65)", bg: "rgba(34,197,94,0.14)", text: "#bbf7d0" },
  held: { dot: "#facc15", border: "rgba(250,204,21,0.7)", bg: "rgba(250,204,21,0.14)", text: "#fef08a" },
  occupied: { dot: "#ef4444", border: "rgba(239,68,68,0.7)", bg: "rgba(239,68,68,0.14)", text: "#fecaca" },
  reserved: { dot: "#3b82f6", border: "rgba(59,130,246,0.7)", bg: "rgba(59,130,246,0.15)", text: "#bfdbfe" },
  cleaning: { dot: "#9ca3af", border: "rgba(156,163,175,0.6)", bg: "rgba(156,163,175,0.14)", text: "#e5e7eb" },
};

/** Warna status staf (getTableLiveData.status) mengikuti palet PDF yang sama. */
export function staffTableColorKey(status: string, needsCleaning?: boolean): CustomerTableStatus {
  return customerTableStatusFor({ status, needsCleaning }) ?? "cleaning";
}

export const JOIN_CODE_PATTERN = /^\d{4}$/;

// Status kurir memakai logika warna yang sama dengan meja (PDF owner).
export type CourierStatusKey = "available" | "assigned" | "delivering" | "offline";

export const COURIER_STATUS_COPY: Record<CourierStatusKey, { label: string; color: keyof typeof TABLE_STATUS_COLORS }> = {
  available: { label: "Tersedia", color: "available" },
  assigned: { label: "Ditugaskan, menunggu pickup", color: "held" },
  delivering: { label: "Sedang mengantar", color: "occupied" },
  offline: { label: "Offline / istirahat", color: "cleaning" },
};
