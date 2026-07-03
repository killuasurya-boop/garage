// Tipe & konstanta WMS yang AMAN untuk client (tanpa import DB/server).

export type WhType = "main" | "bar" | "kitchen";
export type StockStatus = "in" | "low" | "out";
export type MoveType = "in" | "out" | "transfer" | "waste" | "adjustment" | "internal_out";

export type WmsWarehouse = {
  id: string;
  code: string;
  name: string;
  type: WhType;
  isPrimary: boolean;
};

export type WmsProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  minStock: number;
  hpp: number;
  onHand: number; // di warehouse aktif (atau total bila scope semua)
  status: StockStatus;
  imageUrl: string | null;
  barcode: string | null;
  createdAt: string;
};

export type WmsDashboard = {
  kpis: {
    totalProducts: number;
    lowStock: number;
    outOfStock: number;
    stockValue: number; // Σ onHand × hpp
    movementsToday: number;
  };
  trend: Array<{ label: string; masuk: number; keluar: number }>;
  alerts: Array<{ id: string; level: StockStatus; text: string }>;
  recentMovements: Array<{
    id: string;
    type: MoveType;
    productName: string;
    qty: number;
    refDoc: string;
    createdAt: string;
  }>;
};

export function stockStatus(onHand: number, min: number): StockStatus {
  if (onHand <= 0) return "out";
  if (onHand <= min) return "low";
  return "in";
}

// Seed default warehouse (3 scope: Gudang Utama / Stok Bar / Stok Dapur).
export const WMS_DEFAULT_WAREHOUSES: Array<{
  code: string;
  name: string;
  type: WhType;
  isPrimary: boolean;
}> = [
  { code: "WH-01", name: "Gudang Utama", type: "main", isPrimary: true },
  { code: "WH-BAR", name: "Stok Bar", type: "bar", isPrimary: false },
  { code: "WH-KIT", name: "Stok Dapur", type: "kitchen", isPrimary: false },
];

// Status → warna token (dipakai badge UI; konsisten dgn README §8).
export const WMS_STATUS_COLOR: Record<StockStatus, { label: string; bg: string; text: string }> = {
  in: { label: "IN STOCK", bg: "#DCFCE7", text: "#16A34A" },
  low: { label: "LOW STOCK", bg: "#FEF3C7", text: "#D97706" },
  out: { label: "OUT OF STOCK", bg: "#FEE2E2", text: "#DC2626" },
};
