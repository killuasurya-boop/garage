/** Public contracts for closing stock. Counts are observations, never ledger adjustments. */
export type ClosingDivision = "bar" | "dapur";
export type ClosingActor = { id: string; name: string; role: string; workstation?: string | null; position?: string | null; outletId: string };
export type ClosingFilters = { neededDate?: string; businessDate?: string; division?: ClosingDivision; status?: string; productId?: string; from?: string; to?: string };
export type SaveClosingInput = {
  id?: string; version?: number; idempotencyKey: string; division: ClosingDivision;
  businessDate: string; neededDate: string; warehouseId: string; priority?: "normal" | "urgent";
  note?: string; submit?: boolean; noRequest?: boolean;
  items: Array<{ productId: string; physicalQty: number | null; targetQty: number; requestedQty: number; overrideReason?: string; note?: string }>;
};
export type ClosingTransitionInput = {
  action: "review" | "approve" | "prepare" | "ready" | "dispatch" | "receive" | "resolve_difference" | "reject" | "cancel";
  idempotencyKey: string; version?: number; sourceWarehouseId?: string; shipmentId?: string; reason?: string;
  items?: Array<{ itemId?: string; allocationId?: string; qty: number; damagedQty?: number }>;
};
export type ClosingSettingsInput = {
  idempotencyKey: string; openTime?: string; closeTime?: string; cutoffTime?: string;
  locations?: Array<{ warehouseId: string; kind: "main" | "bar" | "dapur" | "transit" | "damaged"; area: "bar" | "dapur" | "umum" }>;
  createLocations?: Array<{ code: string; name: string; kind: "transit" | "damaged"; area: "bar" | "dapur" | "umum" }>;
  access?: Array<{ userId: string; warehouseId: string; capability: "bar" | "dapur" | "warehouse" }>;
};
export type ShortageDecisionInput = { idempotencyKey: string; action: "approve" | "reject" | "cancel"; supplierId?: string; note?: string };
