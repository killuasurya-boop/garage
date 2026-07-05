// Tipe & konstanta WMS yang AMAN untuk client (tanpa import DB/server).

export type WhType = "main" | "bar" | "kitchen";
export type WhArea = "bar" | "dapur" | "umum";
export type StockStatus = "in" | "low" | "out";
export type MoveType = "in" | "out" | "transfer" | "waste" | "adjustment" | "internal_out";

export type WmsWarehouse = {
  id: string;
  code: string;
  name: string;
  type: WhType;
  area: WhArea;
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
  receiving?: {
    todayCount: number;
    todayValue: number;
    draftCount: number;
  };
};

export type WmsNotification = {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  text: string;
  href: string;
};

export type WmsConfig = {
  expiryStrict: boolean;
  defaultPutAway: string;
  notifyLowStock: boolean;
  notifyColdChain: boolean;
  reorderLeadDays: number;
};

export function stockStatus(onHand: number, min: number): StockStatus {
  if (onHand <= 0) return "out";
  if (onHand <= min) return "low";
  return "in";
}

// Seed default warehouse: Gudang Utama = 2 RUANG (Bar & Dapur) + 2 Outlet jual.
export const WMS_DEFAULT_WAREHOUSES: Array<{
  code: string;
  name: string;
  type: WhType;
  area: WhArea;
  isPrimary: boolean;
}> = [
  { code: "WH-01", name: "Gudang Utama · Ruang Bar", type: "main", area: "bar", isPrimary: true },
  { code: "WH-MK", name: "Gudang Utama · Ruang Dapur", type: "main", area: "dapur", isPrimary: false },
  { code: "WH-BAR", name: "Outlet Bar", type: "bar", area: "bar", isPrimary: false },
  { code: "WH-KIT", name: "Outlet Dapur", type: "kitchen", area: "dapur", isPrimary: false },
];

// Status → warna token (dipakai badge UI; konsisten dgn README §8).
export const WMS_STATUS_COLOR: Record<StockStatus, { label: string; bg: string; text: string }> = {
  in: { label: "IN STOCK", bg: "#DCFCE7", text: "#16A34A" },
  low: { label: "LOW STOCK", bg: "#FEF3C7", text: "#D97706" },
  out: { label: "OUT OF STOCK", bg: "#FEE2E2", text: "#DC2626" },
};
