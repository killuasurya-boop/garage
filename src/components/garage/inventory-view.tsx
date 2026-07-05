"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  Boxes,
  Check,
  ClipboardCheck,
  FileText,
  History,
  Image as ImageIcon,
  Info,
  LockKeyhole,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  ReceiptText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { garageApi } from "@/lib/api-client";
import { GARAGE_TAGS, subscribeGarageCache } from "@/lib/garage-cache";
import {
  currency,
  type MenuCategory,
  type ModuleId,
  type Role,
} from "@/lib/garage-data";
import type { InventoryItem, MenuItem } from "@/lib/garage-api-types";
import { GarageConnectedNav } from "@/components/garage/garage-connected-nav";
import { ProductFormPanel } from "@/components/garage/inventory/product-form";
import {
  productVariantDraftId,
  recipeCostForVariantDraft,
  type ProductDraftState,
  type ProductRecipeDraft,
  type ProductVariantDraft,
} from "@/components/garage/inventory/product-draft";
const InventoryModuleFallback = () => (
  <div className="px-4 py-10 text-center text-sm text-zinc-400">Memuat inventory...</div>
);

const InventorySmartReorderPanel = dynamic(
  () => import("@/components/garage/inventory-smart-reorder-panel").then((m) => m.InventorySmartReorderPanel),
  { loading: InventoryModuleFallback },
);
const WarehouseCashierPos = dynamic(
  () => import("@/components/garage/warehouse-cashier-pos").then((m) => m.WarehouseCashierPos),
  { loading: InventoryModuleFallback },
);

const GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY = "garage-add-product-draft";

const statusClass: Record<string, string> = {
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

type ManagedProductItem = MenuItem & {
  status?: "active" | "archived";
};

type ProductHistoryRow = {
  id: string;
  time: string;
  actor: string;
  action: string;
  object: string;
  device: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const inventoryUsageAreaLabels: Record<"bar" | "dapur" | "general", string> = {
  bar: "Bar",
  dapur: "Dapur",
  general: "Umum",
};

function inventoryUsageAreaForItem(item: Pick<InventoryItem, "usageArea" | "category" | "name">) {
  if (item.usageArea === "bar" || item.usageArea === "dapur" || item.usageArea === "general") {
    return item.usageArea;
  }
  const text = `${item.category} ${item.name}`.toLowerCase();
  if (text.includes("minuman") || text.includes("coffee") || text.includes("syrup") || text.includes("tea") || text.includes("susu")) {
    return "bar";
  }
  if (text.includes("operasional") || text.includes("packaging") || text.includes("cleaning")) {
    return "general";
  }
  return "dapur";
}

function inventoryRoleArea(role: Role): "bar" | "dapur" | null {
  if (role === "Barista") return "bar";
  if (role === "Koki" || role === "Asisten Koki") return "dapur";
  return null;
}

export function InventoryView({
  role,
  menuItems,
  inventoryItems,
  stockMovements,
  onMenuChanged,
  onNavigateModule,
  productsOnly = false,
}: {
  role: Role;
  menuItems: MenuItem[];
  inventoryItems: InventoryItem[];
  stockMovements: string[];
  onMenuChanged: () => Promise<void>;
  onNavigateModule?: (module: ModuleId) => void;
  // productsOnly: modul "Produk" mandiri — hanya kelola produk jual; bagian gudang
  // (kini digantikan WMS /warehouse) disembunyikan.
  productsOnly?: boolean;
}) {
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryCategory, setInventoryCategory] = useState("All");
  const [inventoryUsageArea, setInventoryUsageArea] = useState<"all" | "bar" | "dapur" | "general">("all");
  const [outletStockQuery, setOutletStockQuery] = useState("");
  const [outletAuditArea, setOutletAuditArea] = useState<"all" | "bar" | "dapur" | "general">("all");
  const [outletAdjustStock, setOutletAdjustStock] = useState<LocationStockRow | null>(null);
  const [outletAdjustMode, setOutletAdjustMode] = useState<"add" | "subtract" | "clear">("add");
  const [outletAdjustQty, setOutletAdjustQty] = useState("");
  const [outletAdjustNote, setOutletAdjustNote] = useState("");
  const [outletAdjustSaving, setOutletAdjustSaving] = useState(false);
  const [outletAdjustError, setOutletAdjustError] = useState<string | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState("all");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [inventoryWorkspaceTab, setInventoryWorkspaceTab] =
    useState<"products" | "warehouse">(
      productsOnly || role === "Owner / CEO" || role === "Admin" ? "products" : "warehouse",
    );
  // Modul Produk mandiri: paksa selalu di workspace "products".
  const effectiveWorkspaceTab = productsOnly ? "products" : inventoryWorkspaceTab;
  const [warehouseSubTab, setWarehouseSubTab] = useState<
    | "warehouse-dashboard"
    | "daily-report"
    | "kasir-pos"
    | "warehouse-cashier"
    | "warehouse-stock"
    | "outlet-stock"
    | "request-outlet"
    | "supplier-pos"
  >(role === "Gudang" ? "warehouse-dashboard" : inventoryRoleArea(role) ? "request-outlet" : "kasir-pos");
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
  const [warehouseSku, setWarehouseSku] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseAlias, setWarehouseAlias] = useState("");
  const [warehouseCategoryInput, setWarehouseCategoryInput] = useState("Bahan Baku");
  const [warehouseUsageArea, setWarehouseUsageArea] = useState<"bar" | "dapur" | "general">("dapur");
  const [warehouseUnit, setWarehouseUnit] = useState("unit");
  const [warehousePackageSize, setWarehousePackageSize] = useState("1 unit");
  const [warehouseUnitCost, setWarehouseUnitCost] = useState("");
  const [warehouseOnHand, setWarehouseOnHand] = useState("0");
  const [warehouseMin, setWarehouseMin] = useState("0");
  const [warehouseMovement, setWarehouseMovement] = useState("SKU gudang baru");
  const [warehouseSaving, setWarehouseSaving] = useState(false);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [exportingInventory, setExportingInventory] = useState<"xlsx" | "pdf" | null>(null);
  type LocationStockRow = {
    id: string;
    itemSku: string;
    locationType: string;
    outletId: string | null;
    outletName: string | null;
    onHand: number;
    min: number;
    status: string;
    movement: string;
    updatedAt: string;
    name: string;
    category: string;
    usageArea: string;
    unit: string;
    unitCost: number;
    stockValue: number;
  };
  type TransferRequestRow = {
    id: string;
    requestNo: string;
    outletName: string | null;
    station: "bar" | "dapur";
    status: string;
    note: string | null;
    createdAt: string;
    items: Array<{ id: string; itemName: string; unit: string; requestedQty: number; issuedQty: number }>;
  };
  type SupplierReceivingRow = {
    id: string;
    code: string;
    invoiceNo: string | null;
    totalAmount: number;
    receivedAt: string;
    supplierName: string | null;
  };
  type OutletOption = { id: string; code: string; name: string; timezone: string };
  const [locationStocks, setLocationStocks] = useState<LocationStockRow[]>([]);
  const [transferRequests, setTransferRequests] = useState<TransferRequestRow[]>([]);
  const [transferIssueDrafts, setTransferIssueDrafts] = useState<Record<string, Record<string, string>>>({});
  const [transferRequestStatusFilter, setTransferRequestStatusFilter] = useState("active");
  const [transferRequestPdfId, setTransferRequestPdfId] = useState<string | null>(null);
  const [warehouseAuditPdfLoading, setWarehouseAuditPdfLoading] = useState(false);
  const [warehouseAuditXlsxLoading, setWarehouseAuditXlsxLoading] = useState(false);
  const [warehouseReportDate, setWarehouseReportDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const [warehouseReportLoading, setWarehouseReportLoading] = useState(false);
  const [warehouseDailyReport, setWarehouseDailyReport] = useState<WarehouseDailyAudit | null>(null);
  const [supplierReceivingPdfId, setSupplierReceivingPdfId] = useState<string | null>(null);
  const [supplierReceivings, setSupplierReceivings] = useState<SupplierReceivingRow[]>([]);
  const [outletOptions, setOutletOptions] = useState<OutletOption[]>([]);
  const [warehouseFlowLoading, setWarehouseFlowLoading] = useState(false);
  const [warehouseFlowError, setWarehouseFlowError] = useState<string | null>(null);
  const [cashierOutletId, setCashierOutletId] = useState("");
  const [transferStation, setTransferStation] = useState<"bar" | "dapur">("dapur");
  const [supplierSku, setSupplierSku] = useState("");
  const [supplierQty, setSupplierQty] = useState("1");
  const [supplierUnitCost, setSupplierUnitCost] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [supplierNote, setSupplierNote] = useState("");
  const [supplierCart, setSupplierCart] = useState<
    Array<{ key: string; sku: string; name: string; unit: string; qty: number; unitCost: number }>
  >([]);
  const [transferSku, setTransferSku] = useState("");
  const [transferQuery, setTransferQuery] = useState("");
  const [transferQty, setTransferQty] = useState("1");
  const [transferNote, setTransferNote] = useState("");
  const [transferPdfLoading, setTransferPdfLoading] = useState(false);
  const [transferCart, setTransferCart] = useState<
    Array<{ key: string; sku: string; name: string; unit: string; qty: number; available: number }>
  >([]);
  // Movement summary (7 hari terakhir) untuk dashboard chart kecil
  type MovementSummary = {
    rangeDays: number;
    totalEvents: number;
    byType: Array<{ type: string; count: number; totalQty: number }>;
    topItems: Array<{
      sku: string;
      name: string;
      unit: string;
      totalAbsQty: number;
      count: number;
    }>;
    byDay: Array<{ day: string; count: number }>;
  };
  type WarehouseDailyAudit = {
    date: string;
    generatedAt: string;
    movementCount: number;
    receivingCount: number;
    receivingValue: number;
    issuedRequestCount: number;
    issuedItemCount: number;
    warehouseStockValue: number;
    lowCount: number;
    watchCount: number;
    byMovementType: Array<{ type: string; count: number; totalQty: number }>;
    byStation: Array<{ station: string; requestCount: number; totalQty: number }>;
    topMovementItems: Array<{ sku: string; name: string; unit: string; totalAbsQty: number; count: number }>;
  };
  type WarehouseDailyReportLock = {
    date: string;
    documentNo: string;
    locked: true;
    lockedAt: string;
    lockedBy: { id: string; name: string; role: string };
    outlet: { id: string; name: string };
    report: WarehouseDailyAudit;
  };
  type WarehouseMonthlyReportSummary = {
    month: string;
    totalDays: number;
    expectedLockedDays: number;
    lockedDays: number;
    missingDates: string[];
    completionPct: number;
    isComplete: boolean;
    receivingCount: number;
    receivingValue: number;
    issuedRequestCount: number;
    issuedItemCount: number;
    movementCount: number;
    averageWarehouseStockValue: number;
    lowCountLatest: number;
    watchCountLatest: number;
    byDay: Array<{
      date: string;
      documentNo: string;
      receivingValue: number;
      issuedRequestCount: number;
      movementCount: number;
      warehouseStockValue: number;
    }>;
    byStation: Array<{ station: string; requestCount: number; totalQty: number }>;
    byMovementType: Array<{ type: string; count: number; totalQty: number }>;
    topMovementItems: Array<{ sku: string; name: string; unit: string; totalAbsQty: number; count: number }>;
  };
  const [movementSummary, setMovementSummary] = useState<MovementSummary | null>(null);
  const [warehouseDailyAudit, setWarehouseDailyAudit] = useState<WarehouseDailyAudit | null>(null);
  const [warehouseReportLock, setWarehouseReportLock] = useState<WarehouseDailyReportLock | null>(null);
  const [warehouseReportLocking, setWarehouseReportLocking] = useState(false);
  const [warehouseReportArchives, setWarehouseReportArchives] = useState<WarehouseDailyReportLock[]>([]);
  const [warehouseMonthlySummary, setWarehouseMonthlySummary] = useState<WarehouseMonthlyReportSummary | null>(null);
  const [warehouseReportUnlocking, setWarehouseReportUnlocking] = useState(false);
  const yesterdayWarehouseReportDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    [],
  );
  const yesterdayWarehouseReportMissing = Boolean(
    warehouseMonthlySummary?.missingDates.includes(yesterdayWarehouseReportDate),
  );
  useEffect(() => {
    void (async () => {
      try {
        const [movementData, auditData] = await Promise.all([
          garageApi.get<MovementSummary>("/api/inventory/movements?days=7", {
            cache: "no-store",
          }),
          garageApi.get<WarehouseDailyAudit>("/api/inventory/audit-daily", {
            cache: "no-store",
          }),
        ]);
        setMovementSummary(movementData);
        setWarehouseDailyAudit(auditData);
        setWarehouseDailyReport(auditData);
      } catch {
        /* silent */
      }
    })();
  }, []);

  async function loadWarehouseFlows() {
    setWarehouseFlowLoading(true);
    setWarehouseFlowError(null);
    try {
      const month = warehouseReportDate.slice(0, 7);
      const [stocks, transfers, receivings, outlets, monthlyLocks] = await Promise.all([
        garageApi.get<{ stocks: LocationStockRow[] }>("/api/inventory/location-stocks"),
        garageApi.get<{ requests: TransferRequestRow[] }>("/api/inventory/transfers?limit=20"),
        garageApi.get<{ receivings: SupplierReceivingRow[] }>(
          "/api/inventory/supplier-receivings?limit=20",
        ),
        garageApi.get<{ outlets: OutletOption[] }>("/api/outlets/list"),
        garageApi.get<{
          month: string;
          locks: WarehouseDailyReportLock[];
          summary: WarehouseMonthlyReportSummary;
        }>(`/api/inventory/audit-daily/lock?month=${encodeURIComponent(month)}`, {
          cache: "no-store",
        }),
      ]);
      setLocationStocks(stocks.stocks);
      setTransferRequests(transfers.requests);
      setSupplierReceivings(receivings.receivings);
      setOutletOptions(outlets.outlets);
      setWarehouseReportArchives(monthlyLocks.locks);
      setWarehouseMonthlySummary(monthlyLocks.summary);
      setCashierOutletId((current) => current || outlets.outlets[0]?.id || "");
    } catch (err) {
      setWarehouseFlowError(
        err instanceof Error ? err.message : "Data Gudang/Outlet gagal dimuat.",
      );
    } finally {
      setWarehouseFlowLoading(false);
    }
  }

  useEffect(() => {
    if (inventoryWorkspaceTab !== "warehouse") return;
    if (role === "Owner / CEO" || role === "Admin" || role === "Gudang") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch remote Gudang state after entering workspace
    void loadWarehouseFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when entering Gudang workspace
  }, [inventoryWorkspaceTab, role]);
  // â”€â”€ Mode Opname â”€â”€
  // opnameDraft: map sku → input qty fisik (string supaya empty terdistinguish dari 0)
  const [opnameOpen, setOpnameOpen] = useState(false);
  const [opnameLocationType, setOpnameLocationType] = useState<"warehouse" | "outlet">("warehouse");
  const [opnameOutletId, setOpnameOutletId] = useState("");
  const [opnameCategory, setOpnameCategory] = useState("All");
  const [opnameQuery, setOpnameQuery] = useState("");
  const [opnameDraft, setOpnameDraft] = useState<Record<string, string>>({});
  const [opnameNote, setOpnameNote] = useState("");
  const [opnameSubmitting, setOpnameSubmitting] = useState(false);
  const [opnameError, setOpnameError] = useState<string | null>(null);
  const [opnameResult, setOpnameResult] = useState<{
    code: string;
    status: string;
    totalItems: number;
    totalDelta: number;
  } | null>(null);
  const [opnameSessions, setOpnameSessions] = useState<
    Array<{
      id: string;
      code: string;
      status: string;
      totalItems: number;
      totalDelta: number;
      note: string | null;
      createdAt: string;
    }>
  >([]);
  const [opnameActionId, setOpnameActionId] = useState<string | null>(null);
  const canManageMenuProducts = role === "Owner / CEO" || role === "Admin";
  const restrictedInventoryArea = inventoryRoleArea(role);
  const canSwitchInventoryArea = !restrictedInventoryArea;
  const canManageWarehouseFlow = role === "Owner / CEO" || role === "Admin" || role === "Gudang";
  const legacyWarehouseUi = effectiveWorkspaceTab === "warehouse" && !canManageWarehouseFlow;
  const wmsWarehouseRedirect = effectiveWorkspaceTab === "warehouse" && canManageWarehouseFlow;
  const effectiveInventoryUsageArea = restrictedInventoryArea ?? inventoryUsageArea;
  const effectiveOutletAuditArea = restrictedInventoryArea ?? outletAuditArea;
  const effectiveTransferStation = restrictedInventoryArea ?? transferStation;
  const [productItems, setProductItems] = useState<ManagedProductItem[]>(
    menuItems as ManagedProductItem[],
  );
  const [productListMode, setProductListMode] = useState<"active" | "archived">("active");
  // Filter & sort daftar produk (B2). Default urut A-Z by nama.
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState<"all" | MenuCategory>("all");
  const [productStockFilter, setProductStockFilter] = useState<"all" | "ready" | "limited" | "sold_out">("all");
  const [productSortBy, setProductSortBy] = useState<"name-asc" | "name-desc" | "sku-asc" | "price-asc" | "price-desc">("name-asc");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productEditId, setProductEditId] = useState("");
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productPromoActive, setProductPromoActive] = useState(false);
  const [productPromoPrice, setProductPromoPrice] = useState("");
  const [productCategory, setProductCategory] = useState<MenuCategory>("Cemilan");
  const [productSection, setProductSection] = useState("Dapur");
  const [productPrep, setProductPrep] = useState("10m");
  const [productStock, setProductStock] =
    useState<"ready" | "limited" | "sold_out">("ready");
  const [productVariants, setProductVariants] = useState<ProductVariantDraft[]>([
    { key: "regular", label: "Regular", price: "", baseCost: "" },
  ]);
  const [productRecipes, setProductRecipes] = useState<ProductRecipeDraft[]>([]);
  const [productTags, setProductTags] = useState("");
  // Foto produk: file dipilih owner saat tambah/edit; di-upload setelah produk
  // tersimpan (butuh id). Preview menampilkan file baru atau imageUrl existing.
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const productImageInputRef = useRef<HTMLInputElement | null>(null);
  const [productAction, setProductAction] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [productNotice, setProductNotice] = useState<string | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productHistoryOpen, setProductHistoryOpen] = useState(false);
  const [productHistoryLoading, setProductHistoryLoading] = useState(false);
  const [productHistoryProduct, setProductHistoryProduct] = useState<ManagedProductItem | null>(null);
  const [productHistoryRows, setProductHistoryRows] = useState<ProductHistoryRow[]>([]);

  const inventoryCategories = useMemo(
    () => ["All", ...Array.from(new Set(inventoryItems.map((item) => item.category)))],
    [inventoryItems],
  );

  const inventorySummary = useMemo(
    () =>
      inventoryCategories
        .filter((category) => category !== "All")
        .map((category) => {
          const items = inventoryItems.filter((item) => item.category === category);
          return {
            category,
            total: items.length,
            low: items.filter((item) => item.status === "low").length,
            watch: items.filter((item) => item.status === "watch").length,
          };
        }),
    [inventoryCategories, inventoryItems],
  );

  const filteredInventory = useMemo(() => {
    const query = inventoryQuery.toLowerCase();

    return inventoryItems.filter((item) => {
      const usageArea = inventoryUsageAreaForItem(item);
      const byCategory =
        inventoryCategory === "All" || item.category === inventoryCategory;
      const byUsageArea =
        effectiveInventoryUsageArea === "all" || usageArea === effectiveInventoryUsageArea;
      const byStatus =
        inventoryStatus === "all" || item.status === inventoryStatus;
      const searchText = [
        item.sku,
        item.name,
        item.alternativeName,
        item.category,
        item.packageSize,
      ]
        .join(" ")
        .toLowerCase();

      return byCategory && byUsageArea && byStatus && searchText.includes(query);
    });
  }, [effectiveInventoryUsageArea, inventoryCategory, inventoryItems, inventoryQuery, inventoryStatus]);

  const lowCount = inventoryItems.filter((item) => item.status === "low").length;
  const watchCount = inventoryItems.filter((item) => item.status === "watch").length;
  const warehouseLocationStocks = useMemo(
    () => locationStocks.filter((stock) => stock.locationType === "warehouse"),
    [locationStocks],
  );
  const outletLocationStocks = useMemo(
    () => locationStocks.filter((stock) => stock.locationType === "outlet"),
    [locationStocks],
  );
  const warehouseStockValue = warehouseLocationStocks.reduce(
    (sum, stock) => sum + stock.stockValue,
    0,
  );
  const outletStockValue = outletLocationStocks.reduce(
    (sum, stock) => sum + stock.stockValue,
    0,
  );
  const outletAuditSummary = useMemo(
    () =>
      (["bar", "dapur", "general"] as const).map((area) => {
        const rows = outletLocationStocks.filter(
          (stock) => inventoryUsageAreaForItem(stock) === area,
        );
        return {
          area,
          total: rows.length,
          value: rows.reduce((sum, stock) => sum + stock.stockValue, 0),
          low: rows.filter((stock) => stock.status === "low").length,
          watch: rows.filter((stock) => stock.status === "watch").length,
          onHand: rows.reduce((sum, stock) => sum + Number(stock.onHand || 0), 0),
        };
      }),
    [outletLocationStocks],
  );
  const outletLowCount = outletLocationStocks.filter((stock) => stock.status === "low").length;
  const outletWatchCount = outletLocationStocks.filter((stock) => stock.status === "watch").length;
  const filteredOutletLocationStocks = useMemo(
    () => {
      const query = outletStockQuery.trim().toLowerCase();
      return outletLocationStocks.filter((stock) => {
        const byArea =
          effectiveOutletAuditArea === "all" ||
          inventoryUsageAreaForItem(stock) === effectiveOutletAuditArea;
        const searchText = [
          stock.itemSku,
          stock.name,
          stock.category,
          stock.outletName ?? "",
          stock.movement,
        ]
          .join(" ")
          .toLowerCase();
        return byArea && (!query || searchText.includes(query));
      });
    },
    [effectiveOutletAuditArea, outletLocationStocks, outletStockQuery],
  );
  const selectedRequestOutletId = cashierOutletId || outletOptions[0]?.id || "";
  const warehouseStockBySku = useMemo(
    () => new Map(warehouseLocationStocks.map((stock) => [stock.itemSku, stock])),
    [warehouseLocationStocks],
  );
  const transferSelectableItems = useMemo(
    () =>
      inventoryItems.filter((item) => {
        const usageArea = inventoryUsageAreaForItem(item);
        return usageArea === effectiveTransferStation || usageArea === "general";
      }),
    [effectiveTransferStation, inventoryItems],
  );
  const filteredTransferSelectableItems = useMemo(() => {
    const query = transferQuery.trim().toLowerCase();
    return transferSelectableItems.filter((item) => {
      const stock = warehouseStockBySku.get(item.sku);
      const searchText = [
        item.sku,
        item.name,
        item.alternativeName,
        item.category,
        item.packageSize,
      ]
        .join(" ")
        .toLowerCase();
      return (!query || searchText.includes(query)) && Number(stock?.onHand ?? item.onHand ?? 0) > 0;
    });
  }, [transferQuery, transferSelectableItems, warehouseStockBySku]);
  type SmartTransferSuggestion = {
    stock: LocationStockRow;
    available: number;
    warehouseBuffer: number;
    fulfillableQty: number;
    suggestedQty: number;
    shortageQty: number;
    targetQty: number;
    needsOrder: boolean;
  };
  const buildSmartTransferSuggestions = useCallback(
    (station: "bar" | "dapur"): SmartTransferSuggestion[] => {
      const targetOutletStocks = outletLocationStocks.filter((stock) => {
        if (selectedRequestOutletId && stock.outletId !== selectedRequestOutletId) return false;
        const usageArea = inventoryUsageAreaForItem(stock);
        return usageArea === station || usageArea === "general";
      });

      return targetOutletStocks
        .map((stock) => {
          const warehouseStock = warehouseStockBySku.get(stock.itemSku);
          const available = Number(warehouseStock?.onHand ?? 0);
          const warehouseMin = Number(warehouseStock?.min ?? 0);
          const warehouseBuffer = Math.max(warehouseMin, Math.ceil(available * 0.2));
          const fulfillableQty = Math.max(0, Number((available - warehouseBuffer).toFixed(4)));
          const min = Number(stock.min || 0);
          const targetQty = Math.max(min * 1.5, min + 1);
          const gap = Math.max(0, Number((targetQty - Number(stock.onHand || 0)).toFixed(4)));
          const suggestedQty = Math.min(gap, fulfillableQty);
          const needsOrder = stock.status === "low" || stock.status === "watch" || Number(stock.onHand || 0) <= min * 1.25;
          return {
            stock,
            available,
            warehouseBuffer,
            fulfillableQty,
            suggestedQty: Number(suggestedQty.toFixed(4)),
            shortageQty: gap,
            targetQty,
            needsOrder,
          };
        })
        .filter((row) => row.needsOrder && row.suggestedQty > 0)
        .sort((a, b) => {
          const priority = (status: string) => (status === "low" ? 0 : status === "watch" ? 1 : 2);
          return priority(a.stock.status) - priority(b.stock.status) || b.shortageQty - a.shortageQty;
        })
        .slice(0, 18);
    },
    [outletLocationStocks, selectedRequestOutletId, warehouseStockBySku],
  );
  const areaSummary = useMemo(
    () =>
      (["bar", "dapur", "general"] as const).map((area) => {
        const items = inventoryItems.filter((item) => inventoryUsageAreaForItem(item) === area);
        return {
          area,
          total: items.length,
          low: items.filter((item) => item.status === "low").length,
          watch: items.filter((item) => item.status === "watch").length,
        };
      }),
    [inventoryItems],
  );
  const smartTransferSuggestions = useMemo(
    () => buildSmartTransferSuggestions(effectiveTransferStation),
    [buildSmartTransferSuggestions, effectiveTransferStation],
  );
  const smartOutletAlertGroups = useMemo(
    () =>
      (["dapur", "bar"] as const).map((station) => ({
        station,
        suggestions: buildSmartTransferSuggestions(station),
      })),
    [buildSmartTransferSuggestions],
  );
  const filteredTransferRequests = useMemo(
    () =>
      transferRequests.filter((request) => {
        if (transferRequestStatusFilter === "all") return true;
        if (transferRequestStatusFilter === "active") {
          return !["issued", "rejected"].includes(request.status);
        }
        return request.status === transferRequestStatusFilter;
      }),
    [transferRequestStatusFilter, transferRequests],
  );
  const smartOutletNeedCount = smartOutletAlertGroups.reduce(
    (sum, group) => sum + group.suggestions.length,
    0,
  );
  const activeTransferRequestCount = transferRequests.filter(
    (request) => request.status !== "issued" && request.status !== "rejected",
  ).length;
  const supplierCartTotal = supplierCart.reduce(
    (sum, item) => sum + Math.round(item.qty * item.unitCost),
    0,
  );
  const selectedTransferAvailable = transferSku
    ? Number(warehouseStockBySku.get(transferSku)?.onHand ?? 0)
    : 0;
  const opnameStockItems = useMemo(() => {
    const source =
      opnameLocationType === "warehouse"
        ? warehouseLocationStocks
        : outletLocationStocks.filter((stock) => !opnameOutletId || stock.outletId === opnameOutletId);
    if (!source.length && opnameLocationType === "warehouse") return inventoryItems;
    return source.map((stock) => {
      const item = inventoryItems.find((entry) => entry.sku === stock.itemSku);
      return {
        ...(item ?? {
          sku: stock.itemSku,
          alternativeName: "-",
          usageArea: stock.usageArea,
          packageSize: "-",
        }),
        sku: stock.itemSku,
        name: stock.name,
        category: stock.category,
        usageArea: stock.usageArea,
        unit: stock.unit,
        unitCost: stock.unitCost,
        onHand: stock.onHand,
        min: stock.min,
        status: stock.status as InventoryItem["status"],
        movement: stock.movement,
      } as InventoryItem;
    });
  }, [
    inventoryItems,
    opnameLocationType,
    opnameOutletId,
    outletLocationStocks,
    warehouseLocationStocks,
  ]);

  function addSupplierCartItem() {
    const sku = supplierSku || inventoryItems[0]?.sku || "";
    const selected = inventoryItems.find((item) => item.sku === sku);
    const qty = Number(supplierQty);
    const unitCost = Number(supplierUnitCost || selected?.unitCost || 0);
    if (!selected || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setWarehouseFlowError("Pilih SKU, qty, dan harga input yang valid.");
      return;
    }
    setSupplierCart((current) => {
      const existing = current.find((item) => item.sku === selected.sku && item.unitCost === Math.round(unitCost));
      if (existing) {
        return current.map((item) =>
          item.key === existing.key
            ? { ...item, qty: Number((item.qty + qty).toFixed(4)) }
            : item,
        );
      }
      return [
        ...current,
        {
          key: `${selected.sku}-${Date.now()}`,
          sku: selected.sku,
          name: selected.name,
          unit: selected.unit,
          qty,
          unitCost: Math.round(unitCost),
        },
      ];
    });
    setSupplierQty("1");
    setWarehouseFlowError(null);
  }

  function removeSupplierCartItem(key: string) {
    setSupplierCart((current) => current.filter((item) => item.key !== key));
  }

  function addSmartSupplierOrdersToCart(
    suggestions: Array<{ sku: string; name: string; unit: string; supplierOrderQty: number; supplierOrderValue: number }>,
  ) {
    const lines = suggestions
      .map((suggestion) => {
        const qty = Number(suggestion.supplierOrderQty || 0);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        const unitCost = Math.round(Number(suggestion.supplierOrderValue || 0) / qty);
        return {
          key: `${suggestion.sku}-supplier-smart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sku: suggestion.sku,
          name: suggestion.name,
          unit: suggestion.unit,
          qty: Number(qty.toFixed(4)),
          unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0,
        };
      })
      .filter((line): line is { key: string; sku: string; name: string; unit: string; qty: number; unitCost: number } => Boolean(line));

    if (!lines.length) {
      setWarehouseFlowError("Belum ada saran supplier yang bisa masuk cart.");
      return;
    }

    setSupplierCart((current) => {
      let next = [...current];
      for (const line of lines) {
        const existing = next.find((item) => item.sku === line.sku && item.unitCost === line.unitCost);
        if (existing) {
          next = next.map((item) =>
            item.key === existing.key
              ? { ...item, qty: Number((item.qty + line.qty).toFixed(4)) }
              : item,
          );
        } else {
          next.push(line);
        }
      }
      return next;
    });
    setWarehouseSubTab("kasir-pos");
    setSupplierNote((current) => current.trim() || "Auto order supplier dari Smart Reorder Gudang");
    setWarehouseFlowError(null);
  }

  function addTransferCartItem(qtyOverride?: number) {
    const sku = transferSku || transferSelectableItems[0]?.sku || "";
    const selected = transferSelectableItems.find((item) => item.sku === sku);
    const available = Number(warehouseStockBySku.get(sku)?.onHand ?? selected?.onHand ?? 0);
    const qty = qtyOverride ?? Number(transferQty);
    if (!selected || !Number.isFinite(qty) || qty <= 0) {
      setWarehouseFlowError("Pilih SKU dan qty request yang valid.");
      return;
    }
    const currentQty = transferCart.find((item) => item.sku === selected.sku)?.qty ?? 0;
    if (qty + currentQty > available) {
      setWarehouseFlowError(`Stok Gudang ${selected.name} tersedia ${available} ${selected.unit}.`);
      return;
    }
    setTransferCart((current) => {
      const existing = current.find((item) => item.sku === selected.sku);
      if (existing) {
        const nextQty = Number((existing.qty + qty).toFixed(4));
        return current.map((item) =>
          item.key === existing.key ? { ...item, qty: nextQty, available } : item,
        );
      }
      return [
        ...current,
        {
          key: `${selected.sku}-${Date.now()}`,
          sku: selected.sku,
          name: selected.name,
          unit: selected.unit,
          qty,
          available,
        },
      ];
    });
    setTransferQty("1");
    setWarehouseFlowError(null);
  }

  function removeTransferCartItem(key: string) {
    setTransferCart((current) => current.filter((item) => item.key !== key));
  }

  function addSmartTransferSuggestionsToCart() {
    addSmartTransferSuggestionsToCartForStation(effectiveTransferStation);
  }

  function addSmartTransferSuggestionsToCartForStation(station: "bar" | "dapur") {
    if (!canSwitchInventoryArea && station !== restrictedInventoryArea) {
      setWarehouseFlowError(`Role ini hanya bisa auto request ${restrictedInventoryArea === "bar" ? "Bar" : "Dapur"}.`);
      return;
    }
    const suggestions = buildSmartTransferSuggestions(station);
    if (!suggestions.length) {
      setWarehouseFlowError(`Belum ada saran auto order untuk ${station === "bar" ? "Bar" : "Dapur"}.`);
      return;
    }
    setTransferStation(station);
    setWarehouseSubTab("request-outlet");
    setTransferCart((current) => {
      let next = [...current];
      for (const suggestion of suggestions) {
        const existing = next.find((item) => item.sku === suggestion.stock.itemSku);
        if (existing) {
          next = next.map((item) =>
            item.key === existing.key
              ? {
                  ...item,
                  qty: Math.min(
                    item.available,
                    Number((item.qty + suggestion.suggestedQty).toFixed(4)),
                  ),
                  available: suggestion.available,
                }
              : item,
          );
          continue;
        }
        next.push({
          key: `${suggestion.stock.itemSku}-smart-${Date.now()}-${next.length}`,
          sku: suggestion.stock.itemSku,
          name: suggestion.stock.name,
          unit: suggestion.stock.unit,
          qty: suggestion.suggestedQty,
          available: suggestion.available,
        });
      }
      return next;
    });
    setWarehouseFlowError(null);
    setTransferNote((current) =>
      current.trim() || `Auto request ${station === "bar" ? "Bar" : "Dapur"} dari minimum stok outlet`,
    );
  }

  function transferCartReceiptHtml() {
    const stationLabel = effectiveTransferStation === "bar" ? "Bar" : "Dapur";
    const outletLabel =
      outletOptions.find((outlet) => outlet.id === selectedRequestOutletId)?.name ?? "Outlet";
    const rows = transferCart
      .map(
        (item) =>
          `<tr><td>${item.name}<br><small>${item.sku}</small></td><td style="text-align:right">${item.qty} ${item.unit}</td><td style="text-align:right">${item.available} ${item.unit}</td></tr>`,
      )
      .join("");
    return `<!doctype html><html><head><title>Request ${stationLabel}</title><style>
      body{font-family:ui-monospace,Consolas,monospace;margin:0;padding:14px;color:#111}
      h1{font-size:18px;margin:0 0 4px} p{margin:2px 0;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
      td,th{border-bottom:1px dashed #aaa;padding:6px 0;vertical-align:top}
      th{text-align:left} small{color:#555}
      .footer{margin-top:12px;border-top:1px dashed #888;padding-top:8px}
    </style></head><body>
      <h1>GARAGE - REQUEST GUDANG</h1>
      <p>Tujuan: ${stationLabel}</p>
      <p>Outlet: ${outletLabel}</p>
      <p>Waktu: ${new Date().toLocaleString("id-ID")}</p>
      <p>Catatan: ${transferNote.trim() || "-"}</p>
      <table><thead><tr><th>Item</th><th style="text-align:right">Request</th><th style="text-align:right">Stok Gudang</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer"><p>Total item: ${transferCart.length}</p><p>Paraf Gudang: __________</p><p>Paraf ${stationLabel}: __________</p></div>
    </body></html>`;
  }

  function transferRequestReceiptHtml(request: TransferRequestRow) {
    const stationLabel = request.station === "bar" ? "Bar" : "Dapur";
    const rows = request.items
      .map((item) => {
        const remainingQty = remainingTransferQty(item);
        return `<tr><td>${item.itemName}</td><td style="text-align:right">${item.requestedQty} ${item.unit}</td><td style="text-align:right">${item.issuedQty} ${item.unit}</td><td style="text-align:right">${remainingQty} ${item.unit}</td></tr>`;
      })
      .join("");
    return `<!doctype html><html><head><title>${request.requestNo}</title><style>
      body{font-family:ui-monospace,Consolas,monospace;margin:0;padding:14px;color:#111}
      h1{font-size:18px;margin:0 0 4px} p{margin:2px 0;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
      td,th{border-bottom:1px dashed #aaa;padding:6px 0;vertical-align:top}
      th{text-align:left}.footer{margin-top:12px;border-top:1px dashed #888;padding-top:8px}
    </style></head><body>
      <h1>GARAGE - DOKUMEN REQUEST</h1>
      <p>No: ${request.requestNo}</p>
      <p>Outlet: ${request.outletName ?? "Outlet"}</p>
      <p>Tujuan: ${stationLabel}</p>
      <p>Status: ${request.status.toUpperCase()}</p>
      <p>Waktu: ${new Date(request.createdAt).toLocaleString("id-ID")}</p>
      <table><thead><tr><th>Item</th><th style="text-align:right">Request</th><th style="text-align:right">Issue</th><th style="text-align:right">Sisa</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer"><p>Total item: ${request.items.length}</p><p>Paraf Gudang: __________</p><p>Paraf ${stationLabel}: __________</p></div>
    </body></html>`;
  }

  function printTransferCartReceipt() {
    if (!transferCart.length) {
      setWarehouseFlowError("Cart request masih kosong untuk dicetak.");
      return;
    }
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup) {
      setWarehouseFlowError("Popup print diblokir browser.");
      return;
    }
    popup.document.write(transferCartReceiptHtml());
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function printTransferRequestReceipt(request: TransferRequestRow) {
    const popup = window.open("", "_blank", "width=480,height=760");
    if (!popup) {
      setWarehouseFlowError("Popup print diblokir browser.");
      return;
    }
    popup.document.write(transferRequestReceiptHtml(request));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function downloadTransferRequestPdf(request: TransferRequestRow) {
    setTransferRequestPdfId(request.id);
    setWarehouseFlowError(null);
    try {
      const response = await fetch(`/api/inventory/transfers/${request.id}/pdf`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export PDF request gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${request.requestNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Export PDF request gagal.");
    } finally {
      setTransferRequestPdfId(null);
    }
  }

  async function loadWarehouseDailyReport(date = warehouseReportDate) {
    setWarehouseReportLoading(true);
    setWarehouseFlowError(null);
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      const month = date ? date.slice(0, 7) : warehouseReportDate.slice(0, 7);
      const [report, lockData] = await Promise.all([
        garageApi.get<WarehouseDailyAudit>(`/api/inventory/audit-daily${query}`, {
          cache: "no-store",
        }),
        date
          ? garageApi.get<{ lock: WarehouseDailyReportLock | null }>(
              `/api/inventory/audit-daily/lock${query}`,
              { cache: "no-store" },
            )
          : Promise.resolve({ lock: null }),
      ]);
      const archiveData = await garageApi.get<{
        month: string;
        locks: WarehouseDailyReportLock[];
        summary: WarehouseMonthlyReportSummary;
      }>(`/api/inventory/audit-daily/lock?month=${encodeURIComponent(month)}`, {
        cache: "no-store",
      });
      setWarehouseReportLock(lockData.lock);
      setWarehouseDailyReport(lockData.lock?.report ?? report);
      setWarehouseReportArchives(archiveData.locks);
      setWarehouseMonthlySummary(archiveData.summary);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Laporan harian Gudang gagal dimuat.");
    } finally {
      setWarehouseReportLoading(false);
    }
  }

  async function lockWarehouseDailyReportUi(date = warehouseReportDate) {
    if (warehouseReportLock || warehouseReportLocking) return;
    const confirmed = window.confirm(
      "Kunci laporan harian Gudang? Snapshot akan jadi arsip final dan PDF memakai data terkunci.",
    );
    if (!confirmed) return;

    setWarehouseReportLocking(true);
    setWarehouseFlowError(null);
    try {
      const result = await garageApi.post<{
        lock: WarehouseDailyReportLock;
        alreadyLocked: boolean;
      }>("/api/inventory/audit-daily/lock", { date });
      setWarehouseReportLock(result.lock);
      setWarehouseDailyReport(result.lock.report);
      await loadWarehouseDailyReport(date);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Laporan harian gagal dikunci.");
    } finally {
      setWarehouseReportLocking(false);
    }
  }

  async function unlockWarehouseDailyReportUi(date = warehouseReportDate) {
    if (!warehouseReportLock || warehouseReportUnlocking) return;
    const confirmed = window.confirm(
      "Buka ulang laporan harian ini? Status arsip terkunci akan dilepas dan tindakan dicatat audit.",
    );
    if (!confirmed) return;

    setWarehouseReportUnlocking(true);
    setWarehouseFlowError(null);
    try {
      await garageApi.delete<{ unlocked: boolean; lock: WarehouseDailyReportLock | null }>(
        "/api/inventory/audit-daily/lock",
        {
          body: JSON.stringify({ date }),
        },
      );
      await loadWarehouseDailyReport(date);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Laporan harian gagal dibuka ulang.");
    } finally {
      setWarehouseReportUnlocking(false);
    }
  }

  async function downloadWarehouseAuditPdf(date = warehouseReportDate) {
    setWarehouseAuditPdfLoading(true);
    setWarehouseFlowError(null);
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      const response = await fetch(`/api/inventory/audit-daily/pdf${query}`, { cache: "no-store" });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export PDF audit harian gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `garage-audit-gudang-${date || new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Export PDF audit harian gagal.");
    } finally {
      setWarehouseAuditPdfLoading(false);
    }
  }

  async function downloadWarehouseAuditXlsx(date = warehouseReportDate) {
    setWarehouseAuditXlsxLoading(true);
    setWarehouseFlowError(null);
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      const response = await fetch(`/api/inventory/audit-daily/xlsx${query}`, { cache: "no-store" });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export Excel audit harian gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `garage-laporan-harian-gudang-${date || new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Export Excel audit harian gagal.");
    } finally {
      setWarehouseAuditXlsxLoading(false);
    }
  }

  async function downloadWarehouseMonthlyAuditXlsx(month = warehouseReportDate.slice(0, 7)) {
    setWarehouseAuditXlsxLoading(true);
    setWarehouseFlowError(null);
    try {
      const response = await fetch(
        `/api/inventory/audit-daily/xlsx?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export Excel rekap bulanan gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `garage-rekap-bulanan-gudang-${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Export Excel rekap bulanan gagal.");
    } finally {
      setWarehouseAuditXlsxLoading(false);
    }
  }

  function supplierReceivingReceiptHtml(receiving: SupplierReceivingRow) {
    return `<!doctype html><html><head><title>${receiving.code}</title><style>
      body{font-family:ui-monospace,Consolas,monospace;margin:0;padding:14px;color:#111}
      h1{font-size:18px;margin:0 0 4px} p{margin:3px 0;font-size:12px}
      .line{border-top:1px dashed #888;margin:10px 0}.total{font-weight:800;font-size:15px;text-align:right}
    </style></head><body>
      <h1>GARAGE - BARANG MASUK</h1>
      <p>No: ${receiving.code}</p>
      <p>Invoice: ${receiving.invoiceNo ?? "-"}</p>
      <p>Supplier: ${receiving.supplierName ?? "-"}</p>
      <p>Waktu: ${new Date(receiving.receivedAt).toLocaleString("id-ID")}</p>
      <div class="line"></div>
      <p class="total">${currency.format(receiving.totalAmount)}</p>
      <div class="line"></div>
      <p>Paraf Supplier: __________</p>
      <p>Paraf Gudang: __________</p>
    </body></html>`;
  }

  function printSupplierReceivingReceipt(receiving: SupplierReceivingRow) {
    const popup = window.open("", "_blank", "width=420,height=680");
    if (!popup) {
      setWarehouseFlowError("Popup print diblokir browser.");
      return;
    }
    popup.document.write(supplierReceivingReceiptHtml(receiving));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function downloadSupplierReceivingPdf(receiving: SupplierReceivingRow) {
    setSupplierReceivingPdfId(receiving.id);
    setWarehouseFlowError(null);
    try {
      const response = await fetch(`/api/inventory/supplier-receivings/${receiving.id}/pdf`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export PDF receiving gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${receiving.code}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Export PDF receiving gagal.");
    } finally {
      setSupplierReceivingPdfId(null);
    }
  }

  async function downloadTransferCartPdf() {
    if (!transferCart.length) {
      setWarehouseFlowError("Cart request masih kosong untuk export PDF.");
      return;
    }
    setTransferPdfLoading(true);
    setWarehouseFlowError(null);
    try {
      const response = await fetch("/api/inventory/transfers/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station: effectiveTransferStation,
          outletName: outletOptions.find((outlet) => outlet.id === selectedRequestOutletId)?.name ?? "Outlet",
          note: transferNote.trim() || undefined,
          items: transferCart.map((item) => ({
            sku: item.sku,
            name: item.name,
            qty: item.qty,
            unit: item.unit,
            available: item.available,
          })),
        }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export PDF request gagal.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `garage-request-${effectiveTransferStation}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Export PDF request gagal.");
    } finally {
      setTransferPdfLoading(false);
    }
  }

  async function submitSupplierReceiving() {
    if (!supplierCart.length) {
      setWarehouseFlowError("Tambahkan minimal 1 item ke cart Supplier POS.");
      return;
    }
    setWarehouseFlowLoading(true);
    setWarehouseFlowError(null);
    try {
      await garageApi.post("/api/inventory/supplier-receivings", {
        invoiceNo: supplierInvoiceNo.trim() || undefined,
        note: supplierNote.trim() || undefined,
        items: supplierCart.map((item) => ({
          sku: item.sku,
          qty: item.qty,
          unitCost: item.unitCost,
        })),
      });
      setSupplierQty("1");
      setSupplierUnitCost("");
      setSupplierInvoiceNo("");
      setSupplierNote("");
      setSupplierCart([]);
      await loadWarehouseFlows();
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Supplier POS gagal diposting.");
    } finally {
      setWarehouseFlowLoading(false);
    }
  }

  async function submitTransferRequest() {
    if (!transferCart.length) {
      setWarehouseFlowError("Tambahkan minimal 1 item ke cart request outlet.");
      return;
    }
    setWarehouseFlowLoading(true);
    setWarehouseFlowError(null);
    try {
      await garageApi.post("/api/inventory/transfers", {
        station: effectiveTransferStation,
        note: transferNote.trim() || undefined,
        items: transferCart.map((item) => ({
          sku: item.sku,
          qty: item.qty,
        })),
      });
      setTransferQty("1");
      setTransferNote("");
      setTransferCart([]);
      await loadWarehouseFlows();
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Request outlet gagal dibuat.");
    } finally {
      setWarehouseFlowLoading(false);
    }
  }

  function remainingTransferQty(item: { requestedQty: number; issuedQty: number }) {
    return Math.max(0, Number((item.requestedQty - item.issuedQty).toFixed(4)));
  }

  function issueDraftValue(request: TransferRequestRow, item: TransferRequestRow["items"][number]) {
    return transferIssueDrafts[request.id]?.[item.id] ?? String(remainingTransferQty(item));
  }

  function setIssueDraftValue(requestId: string, itemId: string, value: string) {
    setTransferIssueDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? {}),
        [itemId]: value,
      },
    }));
  }

  async function runTransferAction(id: string, action: "approve" | "reject" | "issue") {
    setWarehouseFlowLoading(true);
    setWarehouseFlowError(null);
    try {
      const request = transferRequests.find((row) => row.id === id);
      const payload =
        action === "issue" && request
          ? {
              items: request.items.map((item) => ({
                itemId: item.id,
                issuedQty: Math.max(0, Number(issueDraftValue(request, item) || 0)),
              })),
            }
          : {};
      await garageApi.patch(`/api/inventory/transfers/${id}/${action}`, payload);
      if (action === "issue") {
        setTransferIssueDrafts((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
      await loadWarehouseFlows();
    } catch (err) {
      setWarehouseFlowError(err instanceof Error ? err.message : "Aksi transfer gagal.");
    } finally {
      setWarehouseFlowLoading(false);
    }
  }

  // â”€â”€ Opname computed â”€â”€
  const opnameFilteredItems = useMemo(() => {
    const q = opnameQuery.trim().toLowerCase();
    return opnameStockItems.filter((item) => {
      const byCategory =
        opnameCategory === "All" || item.category === opnameCategory;
      const byQuery = q
        ? `${item.name} ${item.alternativeName} ${item.sku}`
            .toLowerCase()
            .includes(q)
        : true;
      return byCategory && byQuery;
    });
  }, [opnameCategory, opnameQuery, opnameStockItems]);

  const opnameDraftCount = useMemo(
    () =>
      Object.values(opnameDraft).filter((v) => v !== "" && Number.isFinite(Number(v)))
        .length,
    [opnameDraft],
  );

  function startOpname() {
    setOpnameLocationType("warehouse");
    setOpnameOutletId(cashierOutletId || outletOptions[0]?.id || "");
    setOpnameCategory("All");
    setOpnameQuery("");
    setOpnameDraft({});
    setOpnameNote("");
    setOpnameError(null);
    setOpnameResult(null);
    setOpnameOpen(true);
    void loadWarehouseFlows();
    void loadOpnameSessions();
  }

  async function loadOpnameSessions() {
    try {
      const data = await garageApi.get<{
        sessions: Array<{
          id: string;
          code: string;
          status: string;
          totalItems: number;
          totalDelta: number;
          note: string | null;
          createdAt: string;
        }>;
      }>("/api/inventory/opname?limit=10");
      setOpnameSessions(data.sessions);
    } catch {
      setOpnameSessions([]);
    }
  }

  useEffect(() => {
    void loadOpnameSessions();
  }, []);

  async function runOpnameAction(id: string, action: "approve" | "reject" | "apply") {
    setOpnameActionId(`${id}:${action}`);
    setOpnameError(null);
    try {
      await garageApi.patch(`/api/inventory/opname/${id}/${action}`, {});
      await loadOpnameSessions();
    } catch (err) {
      setOpnameError(
        err instanceof Error ? err.message : "Aksi stok opname gagal.",
      );
    } finally {
      setOpnameActionId(null);
    }
  }

  async function submitOpname() {
    const entries = Object.entries(opnameDraft)
      .map(([sku, value]) => {
        const fisik = Number(value);
        const item = opnameStockItems.find((i) => i.sku === sku);
        if (!item || value === "" || !Number.isFinite(fisik) || fisik < 0) return null;
        return { item, fisik, delta: fisik - item.onHand };
      })
      .filter((entry): entry is { item: InventoryItem; fisik: number; delta: number } =>
        Boolean(entry),
      );

    if (!entries.length) {
      setOpnameError("Isi minimal 1 item sebelum submit.");
      return;
    }

    setOpnameSubmitting(true);
    setOpnameError(null);
    const baseNote = opnameNote.trim() || `Opname ${new Date().toLocaleDateString("id-ID")}`;
    try {
      const data = await garageApi.post<{
        session: {
          code: string;
          status: string;
          totalItems: number;
          totalDelta: number;
        };
      }>("/api/inventory/opname", {
        locationType: opnameLocationType,
        outletId: opnameLocationType === "outlet" ? opnameOutletId || cashierOutletId || undefined : null,
        note: baseNote,
        items: entries.map((entry) => ({
          sku: entry.item.sku,
          systemQty: entry.item.onHand,
          physicalQty: entry.fisik,
          note: entry.delta === 0 ? "Cocok" : `Selisih ${entry.delta}`,
        })),
      });
      setOpnameResult({
        code: data.session.code,
        status: data.session.status,
        totalItems: data.session.totalItems,
        totalDelta: data.session.totalDelta,
      });
      setOpnameDraft({});
      await loadOpnameSessions();
    } catch (err) {
      setOpnameError(
        err instanceof Error ? err.message : "Gagal submit stok opname batch.",
      );
    } finally {
      setOpnameSubmitting(false);
    }
    /*
    for (const entry of [] as typeof entries) {
      try {
        const patchRes = await fetch(
          `/api/inventory/${encodeURIComponent(entry.item.sku)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              onHand: entry.fisik,
              movement: `${baseNote} (selisih ${entry.delta >= 0 ? "+" : ""}${entry.delta})`,
            }),
          },
        );
        if (!patchRes.ok) {
          continue;
        }
        await fetch("/api/inventory/movements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemSku: entry.item.sku,
            type: entry.delta >= 0 ? "stock_in" : "stock_out",
            qty: entry.delta,
            note: `${baseNote}: sistem ${entry.item.onHand} → fisik ${entry.fisik} ${entry.item.unit}`,
          }),
        }).catch(() => {
          // movement gagal â€” onHand sudah update, jadi anggap success sebagian
        });
      } catch {
      }
    }
  }
    */
  }

  const activeProductItems = useMemo(
    () => productItems.filter((item) => (item.status ?? "active") === "active"),
    [productItems],
  );
  const archivedProductItems = useMemo(
    () => productItems.filter((item) => item.status === "archived"),
    [productItems],
  );
  const baseProductItems =
    productListMode === "active" ? activeProductItems : archivedProductItems;
  const visibleProductItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const lowestPrice = (item: ManagedProductItem) =>
      item.variants.length
        ? Math.min(...item.variants.map((variant) => variant.price))
        : 0;
    const filtered = baseProductItems.filter((item) => {
      if (productCategoryFilter !== "all" && item.category !== productCategoryFilter) {
        return false;
      }
      if (productStockFilter !== "all" && item.stock !== productStockFilter) {
        return false;
      }
      if (q) {
        const haystack = `${item.name} ${item.sku ?? ""} ${item.category} ${item.section}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (productSortBy) {
        case "name-desc":
          return b.name.localeCompare(a.name, "id");
        case "sku-asc":
          return (a.sku ?? "~").localeCompare(b.sku ?? "~", "id");
        case "price-asc":
          return lowestPrice(a) - lowestPrice(b);
        case "price-desc":
          return lowestPrice(b) - lowestPrice(a);
        case "name-asc":
        default:
          return a.name.localeCompare(b.name, "id");
      }
    });
    return sorted;
  }, [baseProductItems, productSearch, productCategoryFilter, productStockFilter, productSortBy]);
  const recipeCostPreview = useMemo(
    () =>
      productVariants[0]
        ? recipeCostForVariantDraft(
            productRecipes,
            inventoryItems,
            productVariantDraftId(productVariants[0], 0),
          )
        : 0,
    [inventoryItems, productRecipes, productVariants],
  );
  const marginPreview = useMemo(() => {
    const valid = productVariants
      .map((variant) => {
        const price = Number(variant.price);
        const baseCost = Number(variant.baseCost || recipeCostPreview || 0);
        if (!Number.isFinite(price) || price <= 0) return null;
        return {
          label: variant.label.trim() || "Regular",
          price,
          baseCost: Number.isFinite(baseCost) ? baseCost : 0,
        };
      })
      .filter((row): row is { label: string; price: number; baseCost: number } =>
        Boolean(row),
      );
    if (!valid.length) return null;
    const first = valid[0];
    const margin = first.price - first.baseCost;
    const marginPct = first.price > 0 ? Math.round((margin / first.price) * 100) : 0;
    return { ...first, margin, marginPct };
  }, [productVariants, recipeCostPreview]);

  useEffect(() => {
    if (!canManageMenuProducts) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync bootstrap menu into local owner/admin manager
    setProductItems(menuItems as ManagedProductItem[]);
    void loadProductItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProductItems stable, mount-only fetch
  }, [canManageMenuProducts, menuItems]);

  // Cross-module refresh: order/void di POS invalidate tag `inventory`
  // (recipe auto-deduct / stock reverse) → refetch produk & arus gudang.
  useEffect(() => {
    return subscribeGarageCache(GARAGE_TAGS.inventory, () => {
      void loadProductItems();
      void loadWarehouseFlows();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loader stabil, subscribe sekali
  }, []);

  async function loadProductItems() {
    if (!canManageMenuProducts) return;
    setProductLoading(true);
    try {
      const rows = await garageApi.get<ManagedProductItem[]>(
        `/api/menu?includeArchived=1&_=${Date.now()}`,
        { cache: "no-store" },
      );
      setProductItems(rows);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Gagal memuat produk.");
    } finally {
      setProductLoading(false);
    }
  }

  function resetProductForm() {
    setProductEditId("");
    setProductName("");
    setProductSku("");
    setProductPromoActive(false);
    setProductPromoPrice("");
    setProductCategory("Cemilan");
    setProductSection("Dapur");
    setProductPrep("10m");
    setProductStock("ready");
    setProductTags("");
    setProductVariants([{ key: "regular", label: "Regular", price: "", baseCost: "" }]);
    setProductRecipes([]);
    setProductImageFile(null);
    setProductImagePreview(null);
  }

  function onProductImageSelected(file: File | null) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setProductError("Format foto harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProductError("Ukuran foto maksimal 8 MB.");
      return;
    }
    setProductError(null);
    setProductImageFile(file);
    setProductImagePreview(URL.createObjectURL(file));
  }

  function clearProductImage() {
    setProductImageFile(null);
    setProductImagePreview(null);
    if (productImageInputRef.current) productImageInputRef.current.value = "";
  }

  function saveProductDraft() {
    if (typeof window === "undefined") return;
    const draft: ProductDraftState = {
      editId: productEditId,
      name: productName,
      sku: productSku,
      promoActive: productPromoActive,
      promoPrice: productPromoPrice,
      category: productCategory,
      section: productSection,
      prep: productPrep,
      stock: productStock,
      tags: productTags,
      variants: productVariants,
      recipes: productRecipes,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
    setProductNotice("Draft produk tersimpan di browser ini.");
  }

  function clearProductDraft() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY);
  }

  function restoreProductDraft() {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(GARAGE_ADD_PRODUCT_DRAFT_STORAGE_KEY);
    if (!raw) return false;

    try {
      const draft = JSON.parse(raw) as Partial<ProductDraftState>;
      const category = draft.category ?? "Cemilan";
      const validCategory: MenuCategory =
        category === "Makanan" ||
        category === "Cemilan" ||
        category === "Coffee" ||
        category === "Non-Coffee"
          ? category
          : "Cemilan";
      const validStock =
        draft.stock === "ready" ||
        draft.stock === "limited" ||
        draft.stock === "sold_out"
          ? draft.stock
          : "ready";

      setProductEditId(typeof draft.editId === "string" ? draft.editId : "");
      setProductName(typeof draft.name === "string" ? draft.name : "");
      setProductSku(typeof draft.sku === "string" ? draft.sku : "");
      setProductPromoActive(Boolean(draft.promoActive));
      setProductPromoPrice(typeof draft.promoPrice === "string" ? draft.promoPrice : "");
      setProductCategory(validCategory);
      setProductSection(typeof draft.section === "string" ? draft.section : "Dapur");
      setProductPrep(typeof draft.prep === "string" ? draft.prep : "10m");
      setProductStock(validStock);
      setProductTags(typeof draft.tags === "string" ? draft.tags : "");
      setProductVariants(
        Array.isArray(draft.variants) && draft.variants.length
          ? draft.variants
          : [{ key: "regular", label: "Regular", price: "", baseCost: "" }],
      );
      setProductRecipes(Array.isArray(draft.recipes) ? draft.recipes : []);
      setProductNotice("Draft terakhir dipulihkan.");
      return true;
    } catch {
      clearProductDraft();
      return false;
    }
  }

  function openAddProductDialog() {
    resetProductForm();
    setProductError(null);
    if (!restoreProductDraft()) {
      setProductNotice(null);
    }
    setProductDialogOpen(true);
  }

  function addProductVariant() {
    setProductVariants((current) => [
      ...current,
      { key: `variant-${Date.now()}`, label: "", price: "", baseCost: "" },
    ]);
  }

  function updateProductVariant(
    key: string,
    field: "label" | "price" | "baseCost",
    value: string,
  ) {
    setProductVariants((current) =>
      current.map((variant) =>
        variant.key === key ? { ...variant, [field]: value } : variant,
      ),
    );
  }

  function removeProductVariant(key: string) {
    setProductVariants((current) =>
      current.length <= 1 ? current : current.filter((variant) => variant.key !== key),
    );
  }

  function addProductRecipe() {
    const firstItem = inventoryItems[0];
    setProductRecipes((current) => [
      ...current,
      {
        key: `recipe-${Date.now()}`,
        variantId: "all",
        inventorySku: firstItem?.sku ?? "",
        qty: "",
        unit: firstItem?.unit ?? "unit",
        wastePct: "0",
      },
    ]);
  }

  function updateProductRecipe(
    key: string,
    field: "variantId" | "inventorySku" | "qty" | "unit" | "wastePct",
    value: string,
  ) {
    setProductRecipes((current) =>
      current.map((recipe) => {
        if (recipe.key !== key) return recipe;
        if (field === "inventorySku") {
          const item = inventoryItems.find((entry) => entry.sku === value);
          return { ...recipe, inventorySku: value, unit: item?.unit ?? recipe.unit };
        }
        return { ...recipe, [field]: value };
      }),
    );
  }

  function removeProductRecipe(key: string) {
    setProductRecipes((current) => current.filter((recipe) => recipe.key !== key));
  }

  async function uploadProductImage(itemId: string, file: File) {
    const imageForm = new FormData();
    imageForm.append("image", file);

    const imgRes = await fetch(`/api/menu/${encodeURIComponent(itemId)}/image`, {
      method: "POST",
      body: imageForm,
      credentials: "same-origin",
      cache: "no-store",
    });
    const imgPayload = (await imgRes.json().catch(() => ({}))) as {
      data?: { imageUrl?: string; product?: MenuItem | null };
      error?: { message?: string };
    };

    if (!imgRes.ok) {
      throw new Error(imgPayload.error?.message ?? "Upload foto gagal.");
    }

    const imageUrl = imgPayload.data?.imageUrl ?? imgPayload.data?.product?.imageUrl;
    if (!imageUrl) {
      throw new Error("Upload foto selesai, tapi server tidak mengembalikan URL foto.");
    }

    setProductItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...(imgPayload.data?.product ?? {}),
              imageUrl,
            }
          : item,
      ),
    );

    return imageUrl;
  }

  function buildProductVariantsPayload() {
    const variants = productVariants
      .map((variant, index) => {
        const label = variant.label.trim() || (index === 0 ? "Regular" : `Varian ${index + 1}`);
        const price = Number(variant.price);
        const variantId = productVariantDraftId(variant, index);
        const recipeBaseCost = recipeCostForVariantDraft(
          productRecipes,
          inventoryItems,
          variantId,
        );
        const baseCost = Number(variant.baseCost || recipeBaseCost || 0);
        if (!Number.isFinite(price) || price <= 0) return null;
        return {
          id: variantId,
          label,
          price: Math.round(price),
          baseCost: Number.isFinite(baseCost) ? Math.max(0, Math.round(baseCost)) : 0,
          sortOrder: index,
        };
      })
      .filter(
        (
          variant,
        ): variant is {
          id: string;
          label: string;
          price: number;
          baseCost: number;
          sortOrder: number;
        } => Boolean(variant),
      );
    return variants;
  }

  function buildProductRecipesPayload() {
    return productRecipes
      .map((recipe) => {
        const qty = Number(recipe.qty);
        const wastePct = Number(recipe.wastePct || 0);
        if (!recipe.inventorySku || !Number.isFinite(qty) || qty <= 0) return null;
        return {
          variantId: recipe.variantId || "all",
          inventorySku: recipe.inventorySku,
          qty,
          unit: recipe.unit.trim() || "unit",
          wastePct: Number.isFinite(wastePct) ? Math.max(0, Math.min(100, wastePct)) : 0,
        };
      })
      .filter(
        (
          recipe,
        ): recipe is {
          variantId: string;
          inventorySku: string;
          qty: number;
          unit: string;
          wastePct: number;
        } => Boolean(recipe),
      );
  }

  function beginEditProduct(product: ManagedProductItem) {
    setProductEditId(product.id);
    setProductName(product.name);
    setProductSku(product.sku ?? "");
    setProductPromoActive(Boolean(product.promoActive));
    setProductPromoPrice(product.promoPrice ? String(product.promoPrice) : "");
    setProductCategory(product.category);
    setProductSection(product.section || (product.category === "Coffee" || product.category === "Non-Coffee" ? "Bar" : "Dapur"));
    setProductPrep(product.prep || "10m");
    setProductStock(product.stock);
    setProductTags(product.tags.join(", "));
    setProductImageFile(null);
    setProductImagePreview(product.imageUrl ?? null);
    setProductVariants(
      product.variants.length
        ? product.variants.map((variant, index) => ({
            key: `${product.id}-${variant.id}-${index}`,
            id: variant.id,
            label: variant.label,
            price: String(variant.price),
            baseCost: String(variant.baseCost ?? ""),
          }))
        : [{ key: "regular", label: "Regular", price: "", baseCost: "" }],
    );
    setProductRecipes(
      product.recipes?.length
        ? product.recipes.map((recipe, index) => ({
            key: `${product.id}-recipe-${index}`,
            variantId: recipe.variantId || "all",
            inventorySku: recipe.inventorySku,
            qty: String(recipe.qty),
            unit: recipe.unit,
            wastePct: String(recipe.wastePct ?? 0),
          }))
        : [],
    );
    setProductError(null);
    setProductNotice(null);
    setProductDialogOpen(true);
  }

  async function createProduct() {
    if (!productName.trim()) {
      setProductError("Nama produk wajib diisi.");
      return;
    }

    // Cegah "varian hilang diam-diam": varian yang sudah diisi (punya label atau
    // harga) tapi harga jualnya kosong/invalid harus memunculkan pesan jelas,
    // bukan di-drop tanpa kabar. Hanya baris benar-benar kosong yang diabaikan.
    const invalidVariants = productVariants
      .map((variant, index) => ({ variant, index }))
      .filter(({ variant }) => {
        const touched =
          variant.label.trim() !== "" ||
          variant.price.trim() !== "" ||
          variant.baseCost.trim() !== "";
        const price = Number(variant.price);
        const priceValid = Number.isFinite(price) && price > 0;
        return touched && !priceValid;
      });
    if (invalidVariants.length) {
      const names = invalidVariants
        .map(
          ({ variant, index }) =>
            `"${variant.label.trim() || (index === 0 ? "Regular" : `Varian ${index + 1}`)}"`,
        )
        .join(", ");
      setProductError(
        `Harga jual varian ${names} belum valid. Isi harga jual (> 0) atau hapus varian itu sebelum simpan.`,
      );
      return;
    }

    const variants = buildProductVariantsPayload();
    if (!variants.length) {
      setProductError("Isi minimal 1 varian dengan harga jual yang valid.");
      return;
    }

    // Promo aktif wajib punya harga promo valid (> 0).
    if (productPromoActive) {
      const promoNum = Number(productPromoPrice);
      if (!Number.isFinite(promoNum) || promoNum <= 0) {
        setProductError("Promo aktif tapi harga promo belum diisi. Isi harga promo (> 0) atau matikan promo.");
        return;
      }
    }
    const recipes = buildProductRecipesPayload();

    setProductAction(productEditId ? "edit" : "create");
    setProductError(null);
    setProductNotice(null);
    try {
      const tags = productTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const promoPriceNum = Number(productPromoPrice);
      const payload = {
        name: productName.trim(),
        sku: productSku.trim() || undefined,
        promoActive: productPromoActive,
        promoPrice:
          productPromoActive && Number.isFinite(promoPriceNum) && promoPriceNum > 0
            ? Math.round(promoPriceNum)
            : null,
        category: productCategory,
        section: productSection.trim() || (productCategory === "Coffee" || productCategory === "Non-Coffee" ? "Bar" : "Dapur"),
        stock: productStock,
        status: "active" as const,
        prep: productPrep.trim() || "10m",
        tags,
        variants,
        recipes,
      };
      const response = productEditId
        ? await garageApi.patch<{ product: MenuItem | null }>(
            `/api/menu/${encodeURIComponent(productEditId)}`,
            payload,
          )
        : await garageApi.post<{ product: MenuItem | null }>("/api/menu", payload);

      // Upload foto produk bila owner memilih file (butuh id produk).
      const savedId = productEditId || response.product?.id;
      let uploadedImageUrl: string | null = null;
      if (productImageFile && savedId) {
        try {
          uploadedImageUrl = await uploadProductImage(savedId, productImageFile);
        } catch (imgErr) {
          // Produk tetap tersimpan; jangan tutup dialog supaya owner bisa upload ulang.
          setProductError(
            imgErr instanceof Error
              ? `Produk tersimpan, tapi foto gagal diupload: ${imgErr.message}`
              : "Produk tersimpan, tapi foto gagal diupload.",
          );
          setProductAction(null);
          return;
        }
      }

      setProductNotice(
        `${response.product?.name ?? productName.trim()} berhasil ${productEditId ? "diupdate" : "ditambahkan"} ke POS dan QR menu${uploadedImageUrl ? " dengan foto baru" : ""}.`,
      );
      clearProductDraft();
      resetProductForm();
      setProductDialogOpen(false);
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Produk gagal disimpan.");
    } finally {
      setProductAction(null);
    }
  }

  async function archiveProduct(product: ManagedProductItem) {
    if (!product) {
      setProductError("Pilih produk yang akan dihapus.");
      return;
    }

    const confirmed = window.confirm(
      `Hapus permanen produk "${product.name}" dari Produk Manajemen?\n\nProduk akan hilang dari POS/QR. Riwayat transaksi lama tetap aman karena order menyimpan snapshot nama, varian, harga, qty, dan total. Aksi ini tidak bisa restore.`,
    );
    if (!confirmed) return;

    setProductAction(`archive:${product.id}`);
    setProductError(null);
    setProductNotice(null);
    try {
      const response = await garageApi.delete<{
        deleted: { id: string; name: string; usedInOrders: number; status: string };
      }>(`/api/menu/${encodeURIComponent(product.id)}`);
      setProductNotice(
        `${response.deleted.name} dihapus permanen. Riwayat lama aman (${response.deleted.usedInOrders} transaksi terkait).`,
      );
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Produk gagal dihapus permanen.");
    } finally {
      setProductAction(null);
    }
  }

  async function restoreProduct(product: ManagedProductItem) {
    setProductAction(`restore:${product.id}`);
    setProductError(null);
    setProductNotice(null);
    try {
      const response = await garageApi.patch<{ product: MenuItem | null }>(
        `/api/menu/${encodeURIComponent(product.id)}`,
        { status: "active" },
      );
      setProductNotice(`${response.product?.name ?? product.name} aktif kembali di POS dan QR menu.`);
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Produk gagal direstore.");
    } finally {
      setProductAction(null);
    }
  }

  async function updateProductStock(product: ManagedProductItem, stock: "ready" | "limited" | "sold_out") {
    setProductAction(`stock:${product.id}`);
    setProductError(null);
    setProductNotice(null);
    try {
      await garageApi.patch(`/api/menu/${encodeURIComponent(product.id)}`, { stock });
      setProductNotice(`${product.name} sekarang ${stock === "sold_out" ? "habis" : stock}.`);
      await onMenuChanged();
      await loadProductItems();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Stok produk gagal diupdate.");
    } finally {
      setProductAction(null);
    }
  }

  async function openProductHistory(product: ManagedProductItem) {
    setProductHistoryProduct(product);
    setProductHistoryRows([]);
    setProductHistoryOpen(true);
    setProductHistoryLoading(true);
    setProductError(null);
    try {
      const response = await garageApi.get<{ rows: ProductHistoryRow[] }>(
        `/api/menu/${encodeURIComponent(product.id)}?history=1&limit=30`,
        { cache: "no-store" },
      );
      setProductHistoryRows(response.rows);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Riwayat produk gagal dimuat.");
    } finally {
      setProductHistoryLoading(false);
    }
  }

  function resetWarehouseForm() {
    setWarehouseSku("");
    setWarehouseName("");
    setWarehouseAlias("");
    setWarehouseCategoryInput("Bahan Baku");
    setWarehouseUsageArea("dapur");
    setWarehouseUnit("unit");
    setWarehousePackageSize("1 unit");
    setWarehouseUnitCost("");
    setWarehouseOnHand("0");
    setWarehouseMin("0");
    setWarehouseMovement("SKU gudang baru");
    setWarehouseError(null);
  }

  async function createWarehouseItem() {
    const onHand = Number(warehouseOnHand);
    const min = Number(warehouseMin);
    const unitCost = Number(warehouseUnitCost || 0);
    if (!warehouseSku.trim() || !warehouseName.trim()) {
      setWarehouseError("SKU dan nama item Gudang wajib diisi.");
      return;
    }
    if (!Number.isFinite(onHand) || onHand < 0 || !Number.isFinite(min) || min < 0) {
      setWarehouseError("Stok on hand dan minimum harus angka >= 0.");
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setWarehouseError("Unit cost harus angka valid.");
      return;
    }

    setWarehouseSaving(true);
    setWarehouseError(null);
    try {
      await garageApi.post("/api/inventory", {
        sku: warehouseSku.trim(),
        name: warehouseName.trim(),
        alternativeName: warehouseAlias.trim() || undefined,
        category: warehouseCategoryInput.trim() || "Bahan Baku",
        usageArea: warehouseUsageArea,
        unit: warehouseUnit.trim() || "unit",
        packageSize: warehousePackageSize.trim() || "1 unit",
        unitCost: Math.round(unitCost),
        onHand,
        min,
        movement: warehouseMovement.trim() || "SKU gudang baru",
      });
      setWarehouseDialogOpen(false);
      resetWarehouseForm();
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      setWarehouseError(err instanceof Error ? err.message : "SKU Gudang gagal dibuat.");
    } finally {
      setWarehouseSaving(false);
    }
  }

  async function downloadInventoryExport(format: "xlsx" | "pdf") {
    setExportingInventory(format);
    setProductError(null);
    try {
      const response = await fetch(`/api/inventory/export?format=${format}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Export Produk + Gudang gagal.");
      }
      const todayIso = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `garage-produk-gudang-${todayIso}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Export Produk + Gudang gagal.");
    } finally {
      setExportingInventory(null);
    }
  }

  function openOutletAdjust(stock: LocationStockRow, mode: "add" | "subtract" | "clear") {
    setOutletAdjustStock(stock);
    setOutletAdjustMode(mode);
    setOutletAdjustQty("");
    setOutletAdjustNote("");
    setOutletAdjustError(null);
  }

  async function submitOutletAdjust() {
    if (!outletAdjustStock) return;
    const qty = Number(outletAdjustQty);
    const note = outletAdjustNote.trim();
    if (outletAdjustMode !== "clear" && (!Number.isFinite(qty) || qty <= 0)) {
      setOutletAdjustError("Qty wajib angka lebih dari 0.");
      return;
    }
    if (note.length < 3) {
      setOutletAdjustError("Catatan wajib diisi minimal 3 karakter.");
      return;
    }
    setOutletAdjustSaving(true);
    setOutletAdjustError(null);
    try {
      await garageApi.patch("/api/inventory/location-stocks", {
        id: outletAdjustStock.id,
        mode: outletAdjustMode,
        qty: outletAdjustMode === "clear" ? undefined : qty,
        note,
      });
      setOutletAdjustStock(null);
      setOutletAdjustQty("");
      setOutletAdjustNote("");
      await loadWarehouseFlows();
    } catch (err) {
      setOutletAdjustError(err instanceof Error ? err.message : "Adjustment stok outlet gagal.");
    } finally {
      setOutletAdjustSaving(false);
    }
  }

  return (
    <section className="garage-finance-module min-w-0 space-y-4">
      {onNavigateModule ? (
        <GarageConnectedNav
          role={role}
          preset="inventory"
          activeModule="inventory"
          onNavigate={onNavigateModule}
        />
      ) : null}
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#f5a742]">
              Produk Manajemen
            </p>
            <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
              Produk Manajemen & Gudang
            </h1>
            <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
              Produk jualan, resep/BOM, HPP, stok bahan, opname, smart reorder, dan export tetap saling terhubung.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
              onClick={() => void downloadInventoryExport("xlsx")}
              disabled={Boolean(exportingInventory)}
            >
              <FileText className="size-3.5" />
              {exportingInventory === "xlsx" ? "Export..." : "Export Excel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
              onClick={() => void downloadInventoryExport("pdf")}
              disabled={Boolean(exportingInventory)}
            >
              <FileText className="size-3.5" />
              {exportingInventory === "pdf" ? "Export..." : "Export PDF"}
            </Button>
          </div>
        </div>
        {!productsOnly && (
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-md border border-[#34343c] bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setInventoryWorkspaceTab("products")}
              className={`garage-press rounded-md px-3 py-2 text-sm font-semibold transition ${
                effectiveWorkspaceTab === "products"
                  ? "bg-[#f5a742] text-black"
                  : "text-[#d6d6dc] hover:bg-white/[0.04]"
              }`}
            >
              Produk Manajemen
            </button>
            <button
              type="button"
              onClick={() => setInventoryWorkspaceTab("warehouse")}
              className={`garage-press rounded-md px-3 py-2 text-sm font-semibold transition ${
                effectiveWorkspaceTab === "warehouse"
                  ? "bg-[#f5a742] text-black"
                  : "text-[#d6d6dc] hover:bg-white/[0.04]"
              }`}
            >
              Gudang
              {outletLowCount > 0 ? (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    effectiveWorkspaceTab === "warehouse"
                      ? "bg-black text-[#ffc2c8]"
                      : "bg-[#d11a2a] text-white"
                  }`}
                >
                  {outletLowCount}
                </span>
              ) : smartOutletNeedCount > 0 || outletWatchCount > 0 ? (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    effectiveWorkspaceTab === "warehouse"
                      ? "bg-black text-[#f5a742]"
                      : "bg-[#f5a742] text-black"
                  }`}
                >
                  {Math.max(smartOutletNeedCount, outletWatchCount)}
                </span>
              ) : null}
            </button>
          </div>
        )}
      </div>

      {wmsWarehouseRedirect && (
        <div className="rounded-lg border border-[#34343c] bg-gradient-to-br from-[#111116] to-[#1a1b22] p-5">
          <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#f5a742]">Garage WMS</p>
          <h2 className="mt-1 text-lg font-black text-white sm:text-xl">Operasi gudang pindah ke Warehouse OS</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#b8b8bf]">
            Receiving, transfer, opname, cold chain, smart reorder, dan scan barcode sekarang dikelola di modul{" "}
            <span className="font-semibold text-white">/warehouse</span>. Tab gudang lama di Inventory hanya untuk request outlet bar/dapur.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="garage-press h-10 bg-[#d11a2a] px-4 text-sm font-bold text-white hover:bg-[#b01522]">
              <a href="/warehouse">Buka Garage WMS →</a>
            </Button>
            <Button asChild variant="outline" className="garage-press h-10 border-[#34343c] bg-white/[0.04] px-4 text-sm text-white hover:bg-white/[0.08]">
              <a href="/warehouse/receiving">Receiving</a>
            </Button>
            <Button asChild variant="outline" className="garage-press h-10 border-[#34343c] bg-white/[0.04] px-4 text-sm text-white hover:bg-white/[0.08]">
              <a href="/warehouse/reorder">Smart Reorder</a>
            </Button>
          </div>
        </div>
      )}

      {legacyWarehouseUi && (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["warehouse-dashboard", "Dashboard Gudang"],
              ["daily-report", "Laporan Harian"],
              ["kasir-pos", "Kasir Gudang POS"],
              ["warehouse-stock", "Stok Gudang"],
              ["outlet-stock", "Stok Outlet"],
              ["request-outlet", "Request Outlet"],
              ["supplier-pos", "Receiving Supplier"],
            ]
              .filter(([key]) =>
                canManageWarehouseFlow || (key !== "kasir-pos" && key !== "supplier-pos"),
              )
              .map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setWarehouseSubTab(key as typeof warehouseSubTab);
                  if (key === "daily-report") {
                    void loadWarehouseDailyReport(warehouseReportDate);
                  }
                }}
                className={`garage-press rounded-md px-3 py-2 text-xs font-black transition ${
                  warehouseSubTab === key
                    ? "bg-[#d11a2a] text-white"
                    : "bg-white/[0.04] text-[#d6d6dc] hover:bg-white/[0.08]"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {label}
                  {key === "warehouse-dashboard" && activeTransferRequestCount > 0 ? (
                    <span className="rounded-full bg-[#3b82f6] px-1.5 py-0.5 text-[9px] text-white">
                      {activeTransferRequestCount}
                    </span>
                  ) : null}
                  {key === "warehouse-dashboard" && outletLowCount > 0 ? (
                    <span className="rounded-full bg-[#d11a2a] px-1.5 py-0.5 text-[9px] text-white">
                      {outletLowCount}
                    </span>
                  ) : null}
                  {key === "daily-report" && (warehouseMonthlySummary?.missingDates.length ?? 0) > 0 ? (
                    <span className="rounded-full bg-[#f5a742] px-1.5 py-0.5 text-[9px] text-black">
                      {warehouseMonthlySummary?.missingDates.length}
                    </span>
                  ) : null}
                  {key === "outlet-stock" && outletLowCount > 0 ? (
                    <span className="rounded-full bg-[#d11a2a] px-1.5 py-0.5 text-[9px] text-white">
                      {outletLowCount}
                    </span>
                  ) : null}
                  {key === "outlet-stock" && outletWatchCount > 0 ? (
                    <span className="rounded-full bg-[#f5a742] px-1.5 py-0.5 text-[9px] text-black">
                      {outletWatchCount}
                    </span>
                  ) : null}
                  {key === "request-outlet" && smartOutletNeedCount > 0 ? (
                    <span className="rounded-full bg-[#f5a742] px-1.5 py-0.5 text-[9px] text-black">
                      {smartOutletNeedCount}
                    </span>
                  ) : null}
                  {key === "request-outlet" && activeTransferRequestCount > 0 ? (
                    <span className="rounded-full bg-[#3b82f6] px-1.5 py-0.5 text-[9px] text-white">
                      {activeTransferRequestCount}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[#34343c] bg-black/15 px-3 py-2">
            <span className="garage-mono text-[10px] uppercase text-[#888]">Legend Badge</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-[#d6d6dc]">
              <span className="size-2 rounded-full bg-[#d11a2a]" />
              Low
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-[#d6d6dc]">
              <span className="size-2 rounded-full bg-[#f5a742]" />
              Watch / Auto Request / Belum Kunci
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-[#d6d6dc]">
              <span className="size-2 rounded-full bg-[#3b82f6]" />
              Request Aktif
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
              <p className="garage-mono text-[10px] text-[#888]">Nilai Gudang</p>
              <p className="mt-1 text-lg font-black text-white">{currency.format(warehouseStockValue)}</p>
            </div>
            <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
              <p className="garage-mono text-[10px] text-[#888]">Nilai Outlet</p>
              <p className="mt-1 text-lg font-black text-white">{currency.format(outletStockValue)}</p>
            </div>
            <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
              <p className="garage-mono text-[10px] text-[#888]">Request Aktif</p>
              <p className="mt-1 text-lg font-black text-white">
                {transferRequests.filter((request) => request.status !== "issued" && request.status !== "rejected").length}
              </p>
            </div>
          </div>
          {warehouseFlowError && (
            <Alert className="mt-3 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Gudang</AlertTitle>
              <AlertDescription>{warehouseFlowError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {legacyWarehouseUi && warehouseSubTab === "warehouse-stock" && (
        <div className="garage-scroll-x flex gap-2 pb-1">
          {areaSummary.map((summary) => (
            <button
              key={summary.area}
              type="button"
              disabled={!canSwitchInventoryArea && summary.area !== restrictedInventoryArea}
              onClick={() => canSwitchInventoryArea && setInventoryUsageArea(summary.area)}
              className={`garage-press min-w-[160px] rounded-md border p-3 text-left transition ${
                effectiveInventoryUsageArea === summary.area
                  ? "border-[#3b82f6]/65 bg-[#3b82f6]/16 text-white shadow-[0_0_22px_rgba(59,130,246,0.16)]"
                  : !canSwitchInventoryArea
                    ? "border-[#34343c] bg-white/[0.02] text-[#666] opacity-45"
                    : "border-[#34343c] bg-white/[0.06] text-[#d4d4d8] hover:border-[#4a4a54]"
              }`}
            >
              <p className="garage-mono truncate">{inventoryUsageAreaLabels[summary.area]}</p>
              <p className="mt-2 text-lg font-semibold text-white">{summary.total} SKU</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.low} low - {summary.watch} watch
              </p>
            </button>
          ))}
          {inventorySummary.map((summary) => (
            <button
              key={summary.category}
              type="button"
              onClick={() => setInventoryCategory(summary.category)}
              className={`garage-press min-w-[190px] rounded-md border p-3 text-left transition ${
                inventoryCategory === summary.category
                  ? "border-[#d11a2a]/65 bg-[#d11a2a]/16 text-white shadow-[0_0_22px_rgba(209,26,42,0.18)]"
                  : "border-[#34343c] bg-white/[0.06] text-[#d4d4d8] hover:border-[#4a4a54]"
              }`}
            >
              <p className="garage-mono truncate">{summary.category}</p>
              <p className="mt-2 text-lg font-semibold text-white">{summary.total} item</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.low} low - {summary.watch} watch
              </p>
            </button>
          ))}
        </div>
      )}

      {effectiveWorkspaceTab === "products" && canManageMenuProducts && (
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Produk Manajemen</CardTitle>
                <CardDescription>
                  Produk F&B lengkap: harga jual, HPP, resep bahan dari Gudang, status POS/QR, dan delete permanen.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="garage-press h-8 gap-1.5 bg-[#d11a2a] px-3 text-xs text-white hover:bg-[#b91524]"
                  onClick={openAddProductDialog}
                >
                  <Plus className="size-3.5" />
                  Add Produk
                </Button>
                <Badge className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]">
                  {activeProductItems.length} aktif
                </Badge>
                <Badge className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]">
                  {archivedProductItems.length} arsip
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-8 gap-1.5 border-[#34343c] bg-white/[0.04] px-2 text-xs"
                  onClick={() => void loadProductItems()}
                  disabled={productLoading}
                >
                  <RefreshCw className={`size-3.5 ${productLoading ? "animate-spin" : ""}`} />
                  Sync
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {productError && (
              <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Produk</AlertTitle>
                <AlertDescription>{productError}</AlertDescription>
              </Alert>
            )}
            {productNotice && (
              <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
                <Check className="size-4" />
                <AlertTitle>Produk tersimpan</AlertTitle>
                <AlertDescription>{productNotice}</AlertDescription>
              </Alert>
            )}

            <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
              <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#0b0b0e] p-0 text-[#f4f4f5] shadow-2xl shadow-black/60 sm:max-w-6xl">
                <div className="flex flex-col gap-3 border-b border-[#34343c] bg-[#18181f] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <DialogHeader className="space-y-1 text-left">
                    <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
                      <Boxes className="size-5 text-[#f5a742]" />
                      {productEditId ? "Edit Produk" : "Add New Product"}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-[#d4d4d8]">
                      Setup produk F&B Garage: harga jual, HPP, dan resep bahan stok.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-9 gap-2 border-[#f5a742]/55 bg-[#f5a742]/10 px-3 text-xs text-[#ffd08a] hover:bg-[#f5a742]/18"
                      onClick={saveProductDraft}
                    >
                      <FileText className="size-3.5" />
                      Save Draft
                    </Button>
                    <Button
                      type="button"
                      className="garage-press h-9 gap-2 bg-[#d11a2a] px-4 text-xs text-white hover:bg-[#b91524]"
                      onClick={() => void createProduct()}
                      disabled={productAction === "create" || productAction === "edit"}
                    >
                      {productEditId ? <Check className="size-4" /> : <Plus className="size-4" />}
                      {productAction === "create" || productAction === "edit"
                        ? "Menyimpan..."
                        : productEditId
                          ? "Save Changes"
                          : "Add Product"}
                    </Button>
                  </div>
                </div>

                <ProductFormPanel
                  name={productName}
                  onNameChange={setProductName}
                  sku={productSku}
                  onSkuChange={setProductSku}
                  promoActive={productPromoActive}
                  onPromoActiveChange={setProductPromoActive}
                  promoPrice={productPromoPrice}
                  onPromoPriceChange={setProductPromoPrice}
                  category={productCategory}
                  onCategoryChange={(value) => {
                    setProductCategory(value);
                    setProductSection(value === "Coffee" || value === "Non-Coffee" ? "Bar" : "Dapur");
                  }}
                  section={productSection}
                  onSectionChange={setProductSection}
                  prep={productPrep}
                  onPrepChange={setProductPrep}
                  stock={productStock}
                  onStockChange={setProductStock}
                  tags={productTags}
                  onTagsChange={setProductTags}
                  onReset={() => {
                    resetProductForm();
                    clearProductDraft();
                    setProductNotice("Form produk direset.");
                  }}
                  variants={productVariants}
                  onAddVariant={addProductVariant}
                  onUpdateVariant={updateProductVariant}
                  onRemoveVariant={removeProductVariant}
                  recipes={productRecipes}
                  onAddRecipe={addProductRecipe}
                  onUpdateRecipe={updateProductRecipe}
                  onRemoveRecipe={removeProductRecipe}
                  inventoryItems={inventoryItems}
                  recipeCostPreview={recipeCostPreview}
                  marginPreview={marginPreview}
                  imagePreview={productImagePreview}
                  imageInputRef={productImageInputRef}
                  onImageSelected={onProductImageSelected}
                  onClearImage={clearProductImage}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={productHistoryOpen} onOpenChange={setProductHistoryOpen}>
              <DialogContent className="max-h-[86svh] overflow-hidden border-[#34343c] bg-[#0b0b0e] text-[#f4f4f5] sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <History className="size-5 text-[#f5a742]" />
                    Riwayat Produk
                  </DialogTitle>
                  <DialogDescription>
                    {productHistoryProduct?.name ?? "Produk"} - perubahan harga, HPP, resep, status, dan delete permanen.
                  </DialogDescription>
                </DialogHeader>
                <div className="garage-scrollbar max-h-[62svh] space-y-2 overflow-y-auto pr-1">
                  {productHistoryLoading ? (
                    <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4 text-sm text-[#d6d6dc]">
                      Memuat riwayat produk...
                    </div>
                  ) : productHistoryRows.length ? (
                    productHistoryRows.map((row) => {
                      const fields = Array.isArray(row.metadata?.fields)
                        ? row.metadata.fields.join(", ")
                        : null;
                      const variants = Array.isArray(row.metadata?.variants)
                        ? row.metadata.variants.length
                        : null;
                      const recipeLines =
                        typeof row.metadata?.recipeLines === "number"
                          ? row.metadata.recipeLines
                          : null;
                      return (
                        <div key={row.id} className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-black text-white">{row.action}</p>
                              <p className="mt-1 text-xs text-[#a1a1aa]">
                                {new Date(row.createdAt).toLocaleString("id-ID")} - {row.actor}
                              </p>
                            </div>
                            <Badge className="w-fit border-[#34343c] bg-black/20 text-[#d6d6dc]">
                              {row.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[#d6d6dc]">
                            {fields ? (
                              <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                                Field: {fields}
                              </span>
                            ) : null}
                            {variants !== null ? (
                              <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                                Varian: {variants}
                              </span>
                            ) : null}
                            {recipeLines !== null ? (
                              <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                                Resep: {recipeLines} bahan
                              </span>
                            ) : null}
                            <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                              Device: {row.device}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-md border border-dashed border-[#34343c] p-4 text-center text-sm text-[#888]">
                      Belum ada riwayat audit untuk produk ini.
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#34343c] bg-white/[0.04]"
                    onClick={() => setProductHistoryOpen(false)}
                  >
                    Tutup
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Separator className="bg-[#34343c]" />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-1 rounded-md border border-[#34343c] bg-white/[0.04] p-1">
                {(["active", "archived"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProductListMode(mode)}
                    className={`rounded px-3 py-1.5 text-xs font-black transition ${
                      productListMode === mode
                        ? "bg-[#d11a2a] text-white"
                        : "text-[#888] hover:text-white"
                    }`}
                  >
                    {mode === "active" ? "Produk Aktif" : "Produk Arsip"}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                onClick={() => void loadProductItems()}
                disabled={productLoading}
              >
                <RefreshCw className={`size-3.5 ${productLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Toolbar filter & sort produk (B2) */}
            <div className="grid gap-2 rounded-md border border-[#34343c] bg-white/[0.03] p-2 sm:grid-cols-2 lg:grid-cols-[1fr_150px_140px_160px]">
              <Input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Cari nama atau SKU produk…"
                className="h-9 border-[#34343c] bg-black/20 text-sm"
              />
              <Select
                value={productCategoryFilter}
                onValueChange={(value) => setProductCategoryFilter(value as "all" | MenuCategory)}
              >
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua kategori</SelectItem>
                  <SelectItem value="Makanan">Makanan</SelectItem>
                  <SelectItem value="Cemilan">Cemilan</SelectItem>
                  <SelectItem value="Coffee">Coffee</SelectItem>
                  <SelectItem value="Non-Coffee">Non-Coffee</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={productStockFilter}
                onValueChange={(value) =>
                  setProductStockFilter(value as "all" | "ready" | "limited" | "sold_out")
                }
              >
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Stok" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua stok</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                  <SelectItem value="sold_out">Habis</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={productSortBy}
                onValueChange={(value) =>
                  setProductSortBy(value as typeof productSortBy)
                }
              >
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Nama A → Z</SelectItem>
                  <SelectItem value="name-desc">Nama Z → A</SelectItem>
                  <SelectItem value="sku-asc">SKU A → Z</SelectItem>
                  <SelectItem value="price-asc">Harga termurah</SelectItem>
                  <SelectItem value="price-desc">Harga termahal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="px-1 text-xs text-[#888]">
              Menampilkan {visibleProductItems.length} produk
              {productSearch.trim() || productCategoryFilter !== "all" || productStockFilter !== "all"
                ? " (terfilter)"
                : ""}
              .
            </p>

            <div className="overflow-hidden rounded-md border border-[#34343c]">
              {visibleProductItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-[#888]">
                  {baseProductItems.length === 0
                    ? productListMode === "active"
                      ? "Belum ada produk aktif."
                      : "Belum ada produk arsip."
                    : "Tidak ada produk yang cocok dengan filter."}
                </div>
              ) : (
                <div className="divide-y divide-[#34343c]">
                  {visibleProductItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 bg-white/[0.03] p-3 lg:grid-cols-[1fr_140px_130px_260px] lg:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#34343c] bg-[#15151b]">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <ImageIcon className="size-5 text-[#5b5b66]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            {item.sku ? (
                              <span className="shrink-0 rounded border border-[#34343c] bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-[#d4d4d8]">
                                {item.sku}
                              </span>
                            ) : null}
                            <p className="truncate font-black text-white">{item.name}</p>
                            {item.promoActive && item.promoPrice ? (
                              <span className="shrink-0 rounded bg-[#d11a2a] px-1.5 py-0.5 text-[10px] font-black text-white">
                                PROMO
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-[#888]">
                            {item.category} · {item.section} · {item.prep} · {item.variants.length} varian
                            {item.promoActive && item.promoPrice ? (
                              <span className="ml-1 text-[#ffb4bd]">
                                · Promo {currency.format(item.promoPrice)}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={
                          item.stock === "sold_out"
                            ? "w-fit border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]"
                            : item.stock === "limited"
                              ? "w-fit border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]"
                              : "w-fit border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]"
                        }
                      >
                        {item.stock === "sold_out" ? "Habis" : item.stock}
                      </Badge>
                      <Select
                        value={item.stock}
                        onValueChange={(value) =>
                          void updateProductStock(
                            item,
                            value as "ready" | "limited" | "sold_out",
                          )
                        }
                        disabled={productAction === `stock:${item.id}` || item.status === "archived"}
                      >
                        <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ready">Ready</SelectItem>
                          <SelectItem value="limited">Limited</SelectItem>
                          <SelectItem value="sold_out">Habis</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {productListMode === "active" ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                              onClick={() => void openProductHistory(item)}
                            >
                              <History className="size-3.5" />
                              Riwayat
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                              onClick={() => beginEditProduct(item)}
                            >
                              <Settings className="size-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#d11a2a]/55 bg-[#d11a2a]/10 px-3 text-xs text-[#ffc2c8] hover:bg-[#d11a2a]/18"
                              onClick={() => void archiveProduct(item)}
                              disabled={productAction === `archive:${item.id}`}
                            >
                              <Archive className="size-3.5" />
                              Delete
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                              onClick={() => void openProductHistory(item)}
                            >
                              <History className="size-3.5" />
                              Riwayat
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-9 gap-1.5 border-[#22c55e]/45 bg-[#22c55e]/12 px-3 text-xs text-[#bbf7d0]"
                              onClick={() => void restoreProduct(item)}
                              disabled={productAction === `restore:${item.id}`}
                            >
                              <Check className="size-3.5" />
                              Restore
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {legacyWarehouseUi && warehouseSubTab === "outlet-stock" && (
        <>
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Audit Stok Outlet Terpusat</CardTitle>
                  <CardDescription>Stok Bar dan Dapur tetap satu pusat audit outlet, dengan pemisahan area untuk kontrol admin.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                  onClick={() => void loadWarehouseFlows()}
                  disabled={warehouseFlowLoading}
                >
                  <RefreshCw className={`size-3.5 ${warehouseFlowLoading ? "animate-spin" : ""}`} />
                  Sync
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-4">
              <button
                type="button"
                disabled={!canSwitchInventoryArea}
                onClick={() => canSwitchInventoryArea && setOutletAuditArea("all")}
                className={`garage-press rounded-md border p-3 text-left transition ${
                  effectiveOutletAuditArea === "all"
                    ? "border-[#f5a742]/65 bg-[#f5a742]/14 text-white"
                    : !canSwitchInventoryArea
                      ? "border-[#34343c] bg-black/10 text-[#666] opacity-45"
                      : "border-[#34343c] bg-black/20 text-[#d6d6dc] hover:bg-[#202027]"
                }`}
              >
                <p className="garage-mono text-[10px] text-[#a1a1aa]">Semua Area</p>
                <p className="mt-1 text-lg font-black text-white">{outletLocationStocks.length} SKU</p>
                <p className="mt-1 text-xs text-[#888]">{currency.format(outletStockValue)}</p>
              </button>
              {outletAuditSummary.map((summary) => (
                <button
                  key={summary.area}
                  type="button"
                  disabled={!canSwitchInventoryArea && summary.area !== restrictedInventoryArea}
                  onClick={() => canSwitchInventoryArea && setOutletAuditArea(summary.area)}
                  className={`garage-press rounded-md border p-3 text-left transition ${
                    effectiveOutletAuditArea === summary.area
                      ? "border-[#3b82f6]/65 bg-[#3b82f6]/14 text-white"
                      : !canSwitchInventoryArea
                        ? "border-[#34343c] bg-black/10 text-[#666] opacity-45"
                        : "border-[#34343c] bg-black/20 text-[#d6d6dc] hover:bg-[#202027]"
                  }`}
                >
                  <p className="garage-mono text-[10px] text-[#a1a1aa]">
                    {inventoryUsageAreaLabels[summary.area]}
                  </p>
                  <p className="mt-1 text-lg font-black text-white">{summary.total} SKU</p>
                  <p className="mt-1 text-xs text-[#888]">{currency.format(summary.value)}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Badge className={summary.low > 0 ? statusClass.low : statusClass.safe}>
                      {summary.low} low
                    </Badge>
                    <Badge className={summary.watch > 0 ? statusClass.watch : statusClass.safe}>
                      {summary.watch} watch
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#888]" />
                <Input
                  value={outletStockQuery}
                  onChange={(event) => setOutletStockQuery(event.target.value)}
                  className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
                  placeholder="Cari stok outlet, bahan, SKU, kategori"
                />
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-md border border-[#34343c] bg-black/20 p-1">
                {([
                  ["all", "Semua"],
                  ["dapur", "Dapur"],
                  ["bar", "Bar"],
                  ["general", "Umum"],
                ] as const).map(([area, label]) => (
                  <button
                    key={area}
                    type="button"
                    disabled={!canSwitchInventoryArea && area !== restrictedInventoryArea}
                    onClick={() => canSwitchInventoryArea && setOutletAuditArea(area)}
                    className={`rounded px-3 py-2 text-xs font-black transition ${
                      effectiveOutletAuditArea === area
                        ? "bg-[#d11a2a] text-white"
                        : !canSwitchInventoryArea
                          ? "text-[#666] opacity-45"
                          : "text-[#d6d6dc] hover:bg-[#202027]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {smartOutletNeedCount > 0 ? (
              <Alert className="border-[#f5a742]/45 bg-[#f5a742]/10 text-[#f4f4f5]">
                <AlertTriangle className="size-4 text-[#ffd08a]" />
                <AlertTitle>Notifikasi stok outlet low/watch</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {smartOutletAlertGroups
                      .filter((group) => group.suggestions.length > 0)
                      .map((group) => (
                        <div key={group.station} className="rounded-md border border-[#34343c] bg-black/20 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-black text-white">
                                {group.station === "bar" ? "Bar" : "Dapur"}: {group.suggestions.length} bahan perlu request
                              </p>
                              <p className="mt-1 text-[11px] text-[#c9c9cf]">
                                {group.suggestions.slice(0, 3).map((item) => item.stock.name).join(", ")}
                              </p>
                            </div>
                            <Button
                              type="button"
                              className="garage-press h-8 shrink-0 bg-[#d11a2a] px-2 text-[11px] text-white"
                              onClick={() => addSmartTransferSuggestionsToCartForStation(group.station)}
                            >
                              <Sparkles className="mr-1 size-3" />
                              Auto Request
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="garage-scroll max-h-[62vh] rounded-md border border-[#34343c]">
              <Table className="min-w-[1040px]">
                <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>On hand</TableHead>
                    <TableHead>Minimum</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Nilai</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOutletLocationStocks.map((stock) => (
                    <TableRow key={stock.id}>
                      <TableCell className="font-medium text-white">{stock.outletName ?? "Outlet"}</TableCell>
                      <TableCell>
                        <Badge className="border-[#3b82f6]/35 bg-[#3b82f6]/10 text-[#bfdbfe]">
                          {inventoryUsageAreaLabels[inventoryUsageAreaForItem(stock)]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-white">{stock.name}</p>
                        <p className="text-xs text-[#888]">{stock.itemSku} - {stock.category}</p>
                      </TableCell>
                      <TableCell>{stock.onHand} {stock.unit}</TableCell>
                      <TableCell>{stock.min} {stock.unit}</TableCell>
                      <TableCell><Badge className={statusClass[stock.status as keyof typeof statusClass] ?? statusClass.safe}>{stock.status}</Badge></TableCell>
                      <TableCell>{currency.format(stock.stockValue)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            className="garage-press h-8 border-[#22c55e]/45 bg-[#22c55e]/10 px-2 text-xs text-[#bbf7d0]"
                            onClick={() => openOutletAdjust(stock, "add")}
                          >
                            <Plus className="mr-1 size-3.5" />
                            Tambah
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-xs text-[#ffc2c8]"
                            onClick={() => openOutletAdjust(stock, "subtract")}
                          >
                            <Minus className="mr-1 size-3.5" />
                            Kurang
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-xs text-[#ffc2c8]"
                            onClick={() => openOutletAdjust(stock, "clear")}
                          >
                            <Trash2 className="mr-1 size-3.5" />
                            Hapus Stok
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredOutletLocationStocks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-[#888]">
                        Belum ada stok Outlet. Buat Request Outlet lalu issue dari Gudang.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          </Card>
          <Dialog open={Boolean(outletAdjustStock)} onOpenChange={(open) => !open && setOutletAdjustStock(null)}>
            <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {outletAdjustMode === "add" ? (
                    <Plus className="size-5 text-[#22c55e]" />
                  ) : outletAdjustMode === "clear" ? (
                    <Trash2 className="size-5 text-[#d11a2a]" />
                  ) : (
                    <Minus className="size-5 text-[#d11a2a]" />
                  )}
                  {outletAdjustMode === "add"
                    ? "Tambah Stok"
                    : outletAdjustMode === "clear"
                      ? "Hapus Stok"
                      : "Kurangi Stok"}
                </DialogTitle>
                <DialogDescription>
                  {outletAdjustStock?.name} / {outletAdjustStock?.locationType === "warehouse" ? "Gudang" : "Outlet"} / {outletAdjustStock ? inventoryUsageAreaLabels[inventoryUsageAreaForItem(outletAdjustStock)] : "Area"}
                </DialogDescription>
              </DialogHeader>
              {outletAdjustStock ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3 text-xs text-[#d6d6dc]">
                    Stok sekarang:{" "}
                    <span className="font-black text-white">
                      {outletAdjustStock.onHand} {outletAdjustStock.unit}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-md border border-[#34343c] bg-black/20 p-1">
                    {([
                      ["add", "Tambah"],
                      ["subtract", "Kurang"],
                      ["clear", "Hapus"],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setOutletAdjustMode(mode)}
                        className={`rounded px-3 py-2 text-xs font-black transition ${
                          outletAdjustMode === mode
                            ? mode === "add"
                              ? "bg-[#22c55e] text-black"
                              : "bg-[#d11a2a] text-white"
                            : "text-[#d6d6dc] hover:bg-[#202027]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {outletAdjustMode === "clear" ? (
                    <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/10 p-3 text-xs text-[#ffc2c8]">
                      Hapus stok akan mengosongkan stok lokasi ini menjadi 0, SKU bahan tetap tersimpan.
                    </div>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={outletAdjustQty}
                      onChange={(event) => setOutletAdjustQty(event.target.value)}
                      className="h-10 border-[#34343c] bg-white/[0.06]"
                      placeholder={`Qty (${outletAdjustStock.unit})`}
                    />
                  )}
                  <Input
                    value={outletAdjustNote}
                    onChange={(event) => setOutletAdjustNote(event.target.value)}
                    className="h-10 border-[#34343c] bg-white/[0.06]"
                    placeholder="Catatan wajib, mis. audit shift / bahan rusak"
                  />
                  {outletAdjustMode === "clear" || (outletAdjustQty && Number.isFinite(Number(outletAdjustQty))) ? (
                    <p className="garage-mono text-[11px] text-[#a1a1aa]">
                      Stok setelah simpan:{" "}
                      {outletAdjustMode === "clear"
                        ? 0
                        : Math.max(
                            0,
                            outletAdjustStock.onHand +
                              (outletAdjustMode === "add" ? Number(outletAdjustQty) : -Number(outletAdjustQty)),
                          )}{" "}
                      {outletAdjustStock.unit}
                    </p>
                  ) : null}
                  {outletAdjustError ? (
                    <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                      <AlertTriangle className="size-4" />
                      <AlertTitle>Adjustment</AlertTitle>
                      <AlertDescription>{outletAdjustError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press border-[#34343c] bg-white/[0.04]"
                      onClick={() => setOutletAdjustStock(null)}
                      disabled={outletAdjustSaving}
                    >
                      Batal
                    </Button>
                    <Button
                      type="button"
                      className="garage-press bg-[#d11a2a] text-white"
                      onClick={() => void submitOutletAdjust()}
                      disabled={outletAdjustSaving}
                    >
                      {outletAdjustSaving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
                      Simpan
                    </Button>
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      )}

      {legacyWarehouseUi && warehouseSubTab === "request-outlet" && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Request Outlet</CardTitle>
              <CardDescription>Kasir/outlet minta barang dari Gudang pusat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-1 rounded-md border border-[#34343c] bg-black/20 p-1">
                {(["dapur", "bar"] as const).map((station) => (
                  <button
                    key={station}
                    type="button"
                    disabled={!canSwitchInventoryArea && station !== restrictedInventoryArea}
                    onClick={() => {
                      if (!canSwitchInventoryArea && station !== restrictedInventoryArea) return;
                      setTransferStation(station);
                      setTransferSku("");
                      setTransferQuery("");
                      setTransferCart([]);
                    }}
                    className={`rounded px-3 py-2 text-xs font-black transition ${
                      effectiveTransferStation === station
                        ? "bg-[#d11a2a] text-white"
                        : !canSwitchInventoryArea
                          ? "text-[#666] opacity-45"
                          : "text-[#d6d6dc] hover:bg-[#202027]"
                    }`}
                  >
                    {station === "bar" ? "Request Bar" : "Request Dapur"}
                  </button>
                ))}
              </div>
              <div className="rounded-md border border-[#3b82f6]/35 bg-[#3b82f6]/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="garage-mono text-[10px] uppercase tracking-wide text-[#bfdbfe]">
                      Smart Auto Order {effectiveTransferStation === "bar" ? "Bar" : "Dapur"}
                    </p>
                    <p className="mt-1 text-xs text-[#d6d6dc]">
                    {smartTransferSuggestions.length
                        ? `${smartTransferSuggestions.length} bahan perlu request seperlunya dari Gudang.`
                        : "Semua bahan area ini masih aman atau stok Gudang belum cukup."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-8 shrink-0 border-[#3b82f6]/45 bg-[#3b82f6]/10 px-2 text-xs text-[#bfdbfe]"
                    onClick={addSmartTransferSuggestionsToCart}
                    disabled={warehouseFlowLoading || smartTransferSuggestions.length === 0}
                  >
                    <Sparkles className="mr-1.5 size-3.5" />
                    Auto isi
                  </Button>
                </div>
                {smartTransferSuggestions.length ? (
                  <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
                    {smartTransferSuggestions.slice(0, 6).map((suggestion) => (
                      <div key={suggestion.stock.id} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px]">
                        <span className="min-w-0 truncate text-white">{suggestion.stock.name}</span>
                        <span className="shrink-0 font-mono text-[#bfdbfe]">
                          +{suggestion.suggestedQty} {suggestion.stock.unit}
                        </span>
                        <span className="shrink-0 font-mono text-[#888]">
                          sisa gudang minimal {suggestion.warehouseBuffer} {suggestion.stock.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#888]" />
                  <Input
                    value={transferQuery}
                    onChange={(event) => setTransferQuery(event.target.value)}
                    className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
                    placeholder={`Cari bahan ${effectiveTransferStation === "bar" ? "Bar" : "Dapur"}`}
                  />
                </div>
                <div className="garage-scroll grid max-h-72 gap-2 pr-1">
                  {filteredTransferSelectableItems.map((item) => {
                    const stock = warehouseStockBySku.get(item.sku);
                    const available = Number(stock?.onHand ?? item.onHand ?? 0);
                    const selected = transferSku === item.sku;
                    return (
                      <button
                        key={item.sku}
                        type="button"
                        onClick={() => {
                          setTransferSku(item.sku);
                          setSupplierUnitCost(item.unitCost ? String(item.unitCost) : "");
                        }}
                        className={`garage-press rounded-md border p-3 text-left transition ${
                          selected
                            ? "border-[#d11a2a]/70 bg-[#d11a2a]/16"
                            : "border-[#34343c] bg-white/[0.04] hover:border-[#4a4a54]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-white">{item.name}</p>
                            <p className="mt-1 text-[11px] text-[#888]">
                              {item.sku} - {item.category} - {inventoryUsageAreaLabels[inventoryUsageAreaForItem(item)]}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="garage-mono text-sm font-black text-[#bbf7d0]">
                              {available} {item.unit}
                            </p>
                            <p className="text-[10px] text-[#888]">Gudang</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredTransferSelectableItems.length === 0 ? (
                    <p className="rounded-md border border-dashed border-[#34343c] py-5 text-center text-xs text-[#888]">
                      Tidak ada bahan cocok atau stok Gudang kosong.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-md border border-[#34343c] bg-black/20 p-3 text-xs text-[#d6d6dc]">
                Stok Gudang tersedia:{" "}
                <span className="font-black text-white">
                  {selectedTransferAvailable}{" "}
                  {transferSelectableItems.find((item) => item.sku === transferSku)?.unit ?? ""}
                </span>
              </div>
              <Input value={transferQty} onChange={(event) => setTransferQty(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Qty request" inputMode="decimal" />
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="garage-press h-9 border-[#34343c] bg-white/[0.04] text-xs" onClick={() => addTransferCartItem()} disabled={warehouseFlowLoading}>
                  <Plus className="mr-2 size-3.5" />
                  Add Item
                </Button>
                <Button type="button" variant="outline" className="garage-press h-9 border-[#f5a742]/45 bg-[#f5a742]/10 text-xs text-[#ffd08a]" onClick={() => addTransferCartItem(selectedTransferAvailable)} disabled={warehouseFlowLoading || selectedTransferAvailable <= 0}>
                  <ArrowDown className="mr-2 size-3.5" />
                  Max
                </Button>
              </div>
              <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-2">
                {transferCart.length === 0 ? (
                  <p className="py-3 text-center text-xs text-[#888]">Cart request masih kosong.</p>
                ) : (
                  transferCart.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2 rounded border border-[#34343c] bg-white/[0.04] p-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">{item.name}</p>
                      <p className="text-[#888]">{item.qty} {item.unit} / stok {item.available} / {effectiveTransferStation === "bar" ? "Bar" : "Dapur"}</p>
                      </div>
                      <Button type="button" variant="outline" className="h-8 border-[#34343c] bg-black/20 px-2" onClick={() => removeTransferCartItem(item.key)} aria-label="Hapus item request">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <Input value={transferNote} onChange={(event) => setTransferNote(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Catatan" />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-9 border-[#34343c] bg-white/[0.04] text-xs"
                  onClick={printTransferCartReceipt}
                  disabled={!transferCart.length}
                >
                  <Printer className="mr-2 size-3.5" />
                  Cetak Struk
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-9 border-[#34343c] bg-white/[0.04] text-xs"
                  onClick={() => void downloadTransferCartPdf()}
                  disabled={!transferCart.length || transferPdfLoading}
                >
                  {transferPdfLoading ? <RefreshCw className="mr-2 size-3.5 animate-spin" /> : <FileText className="mr-2 size-3.5" />}
                  Export PDF
                </Button>
              </div>
              <Button className="garage-press h-10 w-full bg-[#d11a2a] text-white" onClick={() => void submitTransferRequest()} disabled={warehouseFlowLoading}>
                <Plus className="mr-2 size-4" />
                Submit Request {effectiveTransferStation === "bar" ? "Bar" : "Dapur"} ({transferCart.length})
              </Button>
            </CardContent>
          </Card>
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Daftar Request</CardTitle>
              <CardDescription>Gudang approve lalu issue. Issue mengurangi Gudang dan menambah Outlet.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-1 rounded-md border border-[#34343c] bg-black/20 p-1 lg:grid-cols-6">
                {[
                  ["active", "Aktif"],
                  ["requested", "Requested"],
                  ["approved", "Approved"],
                  ["partial", "Partial"],
                  ["issued", "Issued"],
                  ["all", "Semua"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTransferRequestStatusFilter(value)}
                    className={`rounded px-2 py-1.5 text-[11px] font-black transition ${
                      transferRequestStatusFilter === value
                        ? "bg-[#d11a2a] text-white"
                        : "text-[#d6d6dc] hover:bg-[#202027]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {filteredTransferRequests.map((request) => (
                <div key={request.id} className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-white">{request.requestNo}</p>
                      <p className="text-xs text-[#888]">
                        {request.outletName ?? "Outlet"} - {request.station === "bar" ? "Bar" : "Dapur"} - {new Date(request.createdAt).toLocaleString("id-ID")}
                      </p>
                    </div>
                    <Badge className={request.status === "issued" ? statusClass.safe : request.status === "rejected" ? statusClass.low : request.status === "partial" ? statusClass.info : statusClass.watch}>{request.status}</Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-[#d6d6dc]">
                    {request.items.map((item) => {
                      const remainingQty = remainingTransferQty(item);
                      return (
                        <div key={item.id} className="grid gap-2 rounded border border-[#34343c] bg-black/15 p-2 sm:grid-cols-[1fr_84px] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white">{item.itemName}</p>
                            <p className="text-[#888]">
                              Request {item.requestedQty} {item.unit} - Issue {item.issuedQty} {item.unit} - Sisa {remainingQty} {item.unit}
                            </p>
                            {remainingQty > 0 ? (
                              <Badge className="mt-1 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]">
                                Sisa {remainingQty} {item.unit}
                              </Badge>
                            ) : null}
                          </div>
                          {canManageWarehouseFlow && ["approved", "partial"].includes(request.status) && remainingQty > 0 ? (
                            <Input
                              type="number"
                              min={0}
                              max={remainingQty}
                              step="any"
                              value={issueDraftValue(request, item)}
                              onChange={(event) => setIssueDraftValue(request.id, item.id, event.target.value)}
                              className="h-8 border-[#34343c] bg-white/[0.06] text-xs"
                              placeholder="Qty"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" className="h-8 border-[#34343c] bg-white/[0.04] px-3 text-xs" onClick={() => printTransferRequestReceipt(request)}>
                      <Printer className="mr-1.5 size-3.5" />
                      Cetak
                    </Button>
                    <Button variant="outline" className="h-8 border-[#34343c] bg-white/[0.04] px-3 text-xs" onClick={() => void downloadTransferRequestPdf(request)} disabled={transferRequestPdfId === request.id}>
                      {transferRequestPdfId === request.id ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <FileText className="mr-1.5 size-3.5" />}
                      PDF
                    </Button>
                    {canManageWarehouseFlow && request.status === "requested" && (
                      <Button variant="outline" className="h-8 border-[#22c55e]/45 bg-[#22c55e]/10 px-3 text-xs text-[#bbf7d0]" onClick={() => void runTransferAction(request.id, "approve")} disabled={warehouseFlowLoading}>Approve</Button>
                    )}
                    {canManageWarehouseFlow && ["approved", "partial"].includes(request.status) && (
                      <Button variant="outline" className="h-8 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-xs text-[#ffd08a]" onClick={() => void runTransferAction(request.id, "issue")} disabled={warehouseFlowLoading}>Issue Qty</Button>
                    )}
                    {canManageWarehouseFlow && ["requested", "approved", "partial"].includes(request.status) && (
                      <Button variant="outline" className="h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-3 text-xs text-[#ffc2c8]" onClick={() => void runTransferAction(request.id, "reject")} disabled={warehouseFlowLoading}>Reject</Button>
                    )}
                  </div>
                </div>
              ))}
              {filteredTransferRequests.length === 0 && <p className="py-8 text-center text-sm text-[#888]">Belum ada request outlet di filter ini.</p>}
            </CardContent>
          </Card>
        </section>
      )}

      {legacyWarehouseUi && warehouseSubTab === "supplier-pos" && (
        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Supplier POS</CardTitle>
              <CardDescription>Receiving barang dari supplier masuk ke Gudang pusat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={supplierSku} onValueChange={(value) => {
                setSupplierSku(value);
                const item = inventoryItems.find((entry) => entry.sku === value);
                setSupplierUnitCost(item?.unitCost ? String(item.unitCost) : "");
              }}>
                <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                  <SelectValue placeholder="Pilih SKU" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.sku} value={item.sku}>{item.name} ({item.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input value={supplierQty} onChange={(event) => setSupplierQty(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Qty" inputMode="decimal" />
                <Input value={supplierUnitCost} onChange={(event) => setSupplierUnitCost(event.target.value.replace(/[^\d]/g, ""))} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Harga input" inputMode="numeric" />
              </div>
              <Button type="button" variant="outline" className="garage-press h-9 w-full border-[#34343c] bg-white/[0.04] text-xs" onClick={addSupplierCartItem} disabled={warehouseFlowLoading}>
                <Plus className="mr-2 size-3.5" />
                Add Item ke Cart
              </Button>
              <div className="space-y-2 rounded-md border border-[#34343c] bg-black/15 p-2">
                {supplierCart.length === 0 ? (
                  <p className="py-3 text-center text-xs text-[#888]">Cart receiving masih kosong.</p>
                ) : (
                  supplierCart.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2 rounded border border-[#34343c] bg-white/[0.04] p-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">{item.name}</p>
                        <p className="text-[#888]">
                          {item.qty} {item.unit} x {currency.format(item.unitCost)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-black text-[#bbf7d0]">{currency.format(item.qty * item.unitCost)}</p>
                        <Button type="button" variant="outline" className="h-8 border-[#34343c] bg-black/20 px-2" onClick={() => removeSupplierCartItem(item.key)} aria-label="Hapus item receiving">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <div className="flex justify-between border-t border-[#34343c] pt-2 text-xs">
                  <span className="font-bold text-[#a1a1aa]">Total</span>
                  <span className="font-black text-white">{currency.format(supplierCartTotal)}</span>
                </div>
              </div>
              <Input value={supplierInvoiceNo} onChange={(event) => setSupplierInvoiceNo(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Invoice no opsional" />
              <Input value={supplierNote} onChange={(event) => setSupplierNote(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Catatan" />
              <Button className="garage-press h-10 w-full bg-[#d11a2a] text-white" onClick={() => void submitSupplierReceiving()} disabled={warehouseFlowLoading}>
                <ReceiptText className="mr-2 size-4" />
                Posting Receiving ({supplierCart.length})
              </Button>
            </CardContent>
          </Card>
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Receiving Terakhir</CardTitle>
              <CardDescription>Riwayat barang masuk dari supplier.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {supplierReceivings.map((receiving) => (
                <div key={receiving.id} className="grid gap-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3 sm:grid-cols-[1fr_150px]">
                  <div>
                    <p className="font-black text-white">{receiving.code}</p>
                    <p className="text-xs text-[#888]">{receiving.invoiceNo ?? "Tanpa invoice"} - {new Date(receiving.receivedAt).toLocaleString("id-ID")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button type="button" variant="outline" className="h-7 border-[#34343c] bg-black/20 px-2 text-[10px]" onClick={() => printSupplierReceivingReceipt(receiving)}>
                        <Printer className="mr-1 size-3" />
                        Cetak
                      </Button>
                      <Button type="button" variant="outline" className="h-7 border-[#34343c] bg-black/20 px-2 text-[10px]" onClick={() => void downloadSupplierReceivingPdf(receiving)} disabled={supplierReceivingPdfId === receiving.id}>
                        {supplierReceivingPdfId === receiving.id ? <RefreshCw className="mr-1 size-3 animate-spin" /> : <FileText className="mr-1 size-3" />}
                        PDF
                      </Button>
                    </div>
                  </div>
                  <p className="text-right font-black text-[#bbf7d0]">{currency.format(receiving.totalAmount)}</p>
                </div>
              ))}
              {supplierReceivings.length === 0 && <p className="py-8 text-center text-sm text-[#888]">Belum ada supplier receiving.</p>}
            </CardContent>
          </Card>
        </section>
      )}

      {legacyWarehouseUi && warehouseSubTab === "kasir-pos" && (
        <WarehouseCashierPos inventoryItems={inventoryItems} />
      )}

      {legacyWarehouseUi && warehouseSubTab === "warehouse-dashboard" && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Dashboard Gudang</CardTitle>
              <CardDescription>Ringkasan kerja Gudang hari ini untuk receiving, request, stok low, dan audit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                  <p className="garage-mono text-[10px] text-[#888]">Nilai Gudang</p>
                  <p className="mt-1 text-lg font-black text-white">{currency.format(warehouseStockValue)}</p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                  <p className="garage-mono text-[10px] text-[#888]">Request Aktif</p>
                  <p className="mt-1 text-lg font-black text-white">{activeTransferRequestCount}</p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                  <p className="garage-mono text-[10px] text-[#888]">Need Auto Request</p>
                  <p className="mt-1 text-lg font-black text-[#ffd08a]">{smartOutletNeedCount}</p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                  <p className="garage-mono text-[10px] text-[#888]">Audit Hari Ini</p>
                  <p className="mt-1 text-lg font-black text-white">{warehouseDailyAudit?.movementCount ?? 0}</p>
                </div>
              </div>

              {yesterdayWarehouseReportMissing ? (
                <div className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">Tutup hari belum lengkap</p>
                      <p className="mt-1 text-sm font-black text-white">
                        Laporan Gudang kemarin belum dikunci.
                      </p>
                      <p className="mt-1 text-xs text-[#d6d6dc]">
                        Tanggal {yesterdayWarehouseReportDate} perlu dicek lalu dikunci agar rekap bulanan tidak bolong.
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="garage-press h-9 bg-[#d11a2a] text-white"
                      onClick={() => {
                        setWarehouseReportDate(yesterdayWarehouseReportDate);
                        setWarehouseReportLock(null);
                        setWarehouseDailyReport(null);
                        setWarehouseSubTab("daily-report");
                        void loadWarehouseDailyReport(yesterdayWarehouseReportDate);
                      }}
                    >
                      <LockKeyhole className="mr-2 size-4" />
                      Buka Laporan Kemarin
                    </Button>
                  </div>
                </div>
              ) : null}

              {smartOutletNeedCount > 0 ? (
                <div className="rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">Smart notif outlet</p>
                      <p className="mt-1 text-sm text-white">
                        {smartOutletNeedCount} bahan Dapur/Bar perlu request seperlunya ke Gudang. Sistem menjaga stok Gudang tidak dihabiskan.
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {smartOutletAlertGroups
                          .filter((group) => group.suggestions.length > 0)
                          .map((group) => (
                            <button
                              key={group.station}
                              type="button"
                              className="garage-press rounded-md border border-[#f5a742]/35 bg-black/20 p-2 text-left transition hover:bg-[#f5a742]/12"
                              onClick={() => addSmartTransferSuggestionsToCartForStation(group.station)}
                            >
                              <p className="text-xs font-black text-white">
                                Auto Request {group.station === "bar" ? "Bar" : "Dapur"}
                              </p>
                              <p className="mt-1 text-[11px] text-[#ffd08a]">
                                {group.suggestions.length} bahan, top: {group.suggestions[0]?.stock.name}
                              </p>
                            </button>
                          ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="garage-press h-9 bg-[#d11a2a] text-white"
                      onClick={() => setWarehouseSubTab("request-outlet")}
                    >
                      <Sparkles className="mr-2 size-4" />
                      Buka Request Outlet
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
                <Button type="button" variant="outline" className="garage-press h-10 border-[#34343c] bg-white/[0.04]" onClick={() => setWarehouseSubTab("kasir-pos")} disabled={!canManageWarehouseFlow}>
                  <ReceiptText className="mr-2 size-4" />
                  Kasir Gudang
                </Button>
                <Button type="button" variant="outline" className="garage-press h-10 border-[#34343c] bg-white/[0.04]" onClick={() => setWarehouseSubTab("warehouse-stock")}>
                  <Boxes className="mr-2 size-4" />
                  Cek Stok Gudang
                </Button>
                <Button type="button" variant="outline" className="garage-press h-10 border-[#34343c] bg-white/[0.04]" onClick={() => void downloadWarehouseAuditPdf()} disabled={warehouseAuditPdfLoading}>
                  {warehouseAuditPdfLoading ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}
                  PDF Audit Harian
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Agenda Gudang</CardTitle>
              <CardDescription>Fokus kerja yang perlu dibereskan dulu.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {warehouseDailyAudit ? (
                <>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="garage-mono text-[10px] text-[#888]">Receiving</p>
                    <p className="mt-1 text-sm font-bold text-white">{warehouseDailyAudit.receivingCount} dokumen / {currency.format(warehouseDailyAudit.receivingValue)}</p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="garage-mono text-[10px] text-[#888]">Issue Outlet</p>
                    <p className="mt-1 text-sm font-bold text-white">{warehouseDailyAudit.issuedRequestCount} request / {warehouseDailyAudit.issuedItemCount} item</p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="garage-mono text-[10px] text-[#888]">Low / Watch</p>
                    <p className="mt-1 text-sm font-bold text-white">{warehouseDailyAudit.lowCount} low / {warehouseDailyAudit.watchCount} watch</p>
                  </div>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-[#888]">Audit harian belum dimuat.</p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {legacyWarehouseUi && warehouseSubTab === "daily-report" && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Laporan Harian Gudang</CardTitle>
                  <CardDescription>
                    Rekap tutup hari: receiving, issue outlet, movement, request pending, dan stok low/watch.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="date"
                    value={warehouseReportDate}
                    onChange={(event) => {
                      setWarehouseReportDate(event.target.value);
                      setWarehouseReportLock(null);
                      setWarehouseDailyReport(null);
                    }}
                    className="h-9 w-[150px] border-[#34343c] bg-white/[0.06] text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                    onClick={() => void loadWarehouseDailyReport()}
                    disabled={warehouseReportLoading}
                  >
                    {warehouseReportLoading ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#22c55e]/45 bg-[#22c55e]/10 px-3 text-xs text-[#bbf7d0] hover:bg-[#22c55e]/18"
                    onClick={() => void lockWarehouseDailyReportUi(warehouseReportDate)}
                    disabled={Boolean(warehouseReportLock) || warehouseReportLocking || !warehouseDailyReport}
                  >
                    {warehouseReportLocking ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <LockKeyhole className="mr-1.5 size-3.5" />}
                    {warehouseReportLock ? "Terkunci" : "Kunci Laporan"}
                  </Button>
                  <Button
                    type="button"
                    className="garage-press h-9 bg-[#d11a2a] px-3 text-xs text-white"
                    onClick={() => void downloadWarehouseAuditPdf(warehouseReportDate)}
                    disabled={warehouseAuditPdfLoading}
                  >
                    {warehouseAuditPdfLoading ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <FileText className="mr-1.5 size-3.5" />}
                    PDF Tutup Hari
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#34343c] bg-white/[0.04] px-3 text-xs"
                    onClick={() => void downloadWarehouseAuditXlsx(warehouseReportDate)}
                    disabled={warehouseAuditXlsxLoading}
                  >
                    {warehouseAuditXlsxLoading ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <FileText className="mr-1.5 size-3.5" />}
                    Excel Audit
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {warehouseDailyReport ? (
                <>
                  <div
                    className={`rounded-md border p-3 ${
                      warehouseReportLock
                        ? "border-[#22c55e]/35 bg-[#22c55e]/10"
                        : "border-[#34343c] bg-black/20"
                    }`}
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="garage-mono text-[10px] text-[#888]">Status Laporan</p>
                        <p className="mt-1 text-sm font-black text-white">
                          {warehouseReportLock ? "Terkunci sebagai arsip final" : "Live / belum dikunci"}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#a1a1aa]">
                          {warehouseReportLock?.documentNo ?? `WH-DAY-${warehouseDailyReport.date.replaceAll("-", "")}`}
                        </p>
                      </div>
                      <p className="text-xs text-[#a1a1aa]">
                        {warehouseReportLock
                          ? `${new Date(warehouseReportLock.lockedAt).toLocaleString("id-ID")} oleh ${warehouseReportLock.lockedBy.name}`
                          : `Generated ${new Date(warehouseDailyReport.generatedAt).toLocaleString("id-ID")}`}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="garage-mono text-[10px] text-[#888]">Receiving</p>
                      <p className="mt-1 text-lg font-black text-[#bbf7d0]">{warehouseDailyReport.receivingCount}</p>
                      <p className="text-xs text-[#888]">{currency.format(warehouseDailyReport.receivingValue)}</p>
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="garage-mono text-[10px] text-[#888]">Issue Outlet</p>
                      <p className="mt-1 text-lg font-black text-[#bfdbfe]">{warehouseDailyReport.issuedRequestCount}</p>
                      <p className="text-xs text-[#888]">{warehouseDailyReport.issuedItemCount} item keluar</p>
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="garage-mono text-[10px] text-[#888]">Request Pending</p>
                      <p className="mt-1 text-lg font-black text-[#ffd08a]">{activeTransferRequestCount}</p>
                      <p className="text-xs text-[#888]">Belum final issued/rejected</p>
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="garage-mono text-[10px] text-[#888]">Low / Watch</p>
                      <p className="mt-1 text-lg font-black text-[#ffc2c8]">
                        {warehouseDailyReport.lowCount} / {warehouseDailyReport.watchCount}
                      </p>
                      <p className="text-xs text-[#888]">Stok Gudang</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="garage-mono text-[10px] text-[#888]">Nilai Stok Gudang</p>
                      <p className="mt-1 text-lg font-black text-white">{currency.format(warehouseDailyReport.warehouseStockValue)}</p>
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="garage-mono text-[10px] text-[#888]">Movement Hari Ini</p>
                      <p className="mt-1 text-lg font-black text-white">{warehouseDailyReport.movementCount}</p>
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="garage-mono text-[10px] text-[#888]">Auto Request Needed</p>
                      <p className="mt-1 text-lg font-black text-[#ffd08a]">{smartOutletNeedCount}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="mb-2 text-sm font-black text-white">Issue Per Area</p>
                      {warehouseDailyReport.byStation.length ? (
                        <div className="space-y-2">
                          {warehouseDailyReport.byStation.map((row) => (
                            <div key={row.station} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                              <span className="font-bold text-white">{row.station === "bar" ? "Bar" : "Dapur"}</span>
                              <span className="text-[#bfdbfe]">{row.requestCount} request / {row.totalQty} qty</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-4 text-sm text-[#888]">Belum ada issue outlet pada tanggal ini.</p>
                      )}
                    </div>
                    <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                      <p className="mb-2 text-sm font-black text-white">Top Movement</p>
                      {warehouseDailyReport.topMovementItems.length ? (
                        <div className="space-y-2">
                          {warehouseDailyReport.topMovementItems.map((item) => (
                            <div key={item.sku} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <p className="truncate font-bold text-white">{item.name}</p>
                                <p className="font-mono text-[10px] text-[#888]">{item.sku}</p>
                              </div>
                              <span className="shrink-0 text-[#ffd08a]">{item.totalAbsQty} {item.unit}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-4 text-sm text-[#888]">Belum ada movement besar pada tanggal ini.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="mb-2 text-sm font-black text-white">Movement Type</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {warehouseDailyReport.byMovementType.slice(0, 8).map((row) => (
                        <div key={row.type} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                          <span className="font-mono text-white">{row.type}</span>
                          <span className="text-[#d6d6dc]">{row.count} event / {row.totalQty} qty</span>
                        </div>
                      ))}
                      {warehouseDailyReport.byMovementType.length === 0 ? (
                        <p className="py-4 text-sm text-[#888]">Tidak ada movement pada tanggal ini.</p>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <p className="rounded-md border border-dashed border-[#34343c] py-10 text-center text-sm text-[#888]">
                  Pilih tanggal lalu refresh laporan.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Checklist Tutup Hari</CardTitle>
              <CardDescription>Ringkasan keputusan sebelum Gudang ditutup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                ["Status laporan", warehouseReportLock ? "Terkunci" : "Live"],
                ["Receiving posted", `${warehouseDailyReport?.receivingCount ?? 0} dokumen`],
                ["Issue outlet selesai", `${warehouseDailyReport?.issuedRequestCount ?? 0} request`],
                ["Request pending", `${activeTransferRequestCount} aktif`],
                ["Stok low Gudang", `${warehouseDailyReport?.lowCount ?? 0} SKU`],
                ["Auto request outlet", `${smartOutletNeedCount} bahan`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-md border border-[#34343c] bg-black/20 px-3 py-2 text-sm">
                  <span className="text-[#d6d6dc]">{label}</span>
                  <span className="font-black text-white">{value}</span>
                </div>
              ))}
              <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-white">Rekap Bulanan</p>
                    <p className="garage-mono text-[10px] text-[#888]">{warehouseReportDate.slice(0, 7)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-8 border-[#34343c] bg-white/[0.04] px-2 text-[11px]"
                    onClick={() => void downloadWarehouseMonthlyAuditXlsx(warehouseReportDate.slice(0, 7))}
                    disabled={warehouseAuditXlsxLoading || !warehouseMonthlySummary}
                  >
                    {warehouseAuditXlsxLoading ? <RefreshCw className="mr-1.5 size-3 animate-spin" /> : <FileText className="mr-1.5 size-3" />}
                    Excel Bulanan
                  </Button>
                </div>
                {warehouseMonthlySummary ? (
                  <div className="space-y-2 text-xs">
                    <div
                      className={`rounded border p-3 ${
                        warehouseMonthlySummary.isComplete
                          ? "border-[#22c55e]/40 bg-[#22c55e]/10"
                          : "border-[#f5a742]/40 bg-[#f5a742]/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="garage-mono text-[10px] text-[#888]">Kelengkapan bulan</p>
                          <p className="mt-1 font-black text-white">
                            {warehouseMonthlySummary.lockedDays}/{warehouseMonthlySummary.expectedLockedDays} hari terkunci
                          </p>
                        </div>
                        <span className="text-lg font-black text-white">{warehouseMonthlySummary.completionPct}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
                        <div
                          className={`h-full rounded-full ${
                            warehouseMonthlySummary.isComplete ? "bg-[#22c55e]" : "bg-[#f5a742]"
                          }`}
                          style={{ width: `${warehouseMonthlySummary.completionPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-white/10 bg-white/[0.03] p-2">
                      <p className="garage-mono text-[10px] text-[#888]">Hari terkunci</p>
                        <p className="mt-1 font-black text-white">{warehouseMonthlySummary.lockedDays}</p>
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] p-2">
                        <p className="garage-mono text-[10px] text-[#888]">Receiving</p>
                        <p className="mt-1 font-black text-[#bbf7d0]">{currency.format(warehouseMonthlySummary.receivingValue)}</p>
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] p-2">
                        <p className="garage-mono text-[10px] text-[#888]">Issue outlet</p>
                        <p className="mt-1 font-black text-[#bfdbfe]">{warehouseMonthlySummary.issuedRequestCount} request</p>
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] p-2">
                        <p className="garage-mono text-[10px] text-[#888]">Movement</p>
                        <p className="mt-1 font-black text-white">{warehouseMonthlySummary.movementCount}</p>
                      </div>
                      <div className="col-span-2 rounded border border-white/10 bg-white/[0.03] p-2">
                        <p className="garage-mono text-[10px] text-[#888]">Rata-rata nilai stok</p>
                        <p className="mt-1 font-black text-white">{currency.format(warehouseMonthlySummary.averageWarehouseStockValue)}</p>
                      </div>
                    </div>
                    {warehouseMonthlySummary.missingDates.length ? (
                      <div className="rounded border border-[#f5a742]/30 bg-[#f5a742]/10 p-2">
                        <p className="mb-2 text-[11px] font-black text-[#ffd08a]">Tanggal belum dikunci</p>
                        <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                          {warehouseMonthlySummary.missingDates.slice(0, 18).map((date) => (
                            <button
                              key={date}
                              type="button"
                              className="rounded border border-[#f5a742]/30 bg-black/20 px-2 py-1 font-mono text-[10px] text-[#ffd08a] transition hover:bg-[#f5a742]/15"
                              onClick={() => {
                                setWarehouseReportDate(date);
                                setWarehouseReportLock(null);
                                setWarehouseDailyReport(null);
                                void loadWarehouseDailyReport(date);
                              }}
                            >
                              {date.slice(8)}
                            </button>
                          ))}
                          {warehouseMonthlySummary.missingDates.length > 18 ? (
                            <span className="px-2 py-1 text-[10px] text-[#a1a1aa]">
                              +{warehouseMonthlySummary.missingDates.length - 18}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded border border-[#22c55e]/30 bg-[#22c55e]/10 p-2 text-xs font-bold text-[#bbf7d0]">
                        Semua tanggal target sudah dikunci.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-4 text-center text-xs text-[#888]">Refresh laporan untuk memuat rekap bulanan.</p>
                )}
              </div>
              <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-white">Arsip Bulan Ini</p>
                  <span className="garage-mono text-[10px] text-[#888]">{warehouseReportDate.slice(0, 7)}</span>
                </div>
                {warehouseReportArchives.length ? (
                  <div className="max-h-56 space-y-2 overflow-auto pr-1">
                    {warehouseReportArchives.map((lock) => (
                      <button
                        key={lock.date}
                        type="button"
                        className={`w-full rounded border px-3 py-2 text-left text-xs transition ${
                          lock.date === warehouseReportDate
                            ? "border-[#22c55e]/45 bg-[#22c55e]/10"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                        onClick={() => {
                          setWarehouseReportDate(lock.date);
                          setWarehouseReportLock(lock);
                          setWarehouseDailyReport(lock.report);
                        }}
                      >
                        <span className="block font-black text-white">{lock.documentNo}</span>
                        <span className="block text-[#a1a1aa]">
                          {new Date(lock.lockedAt).toLocaleString("id-ID")} oleh {lock.lockedBy.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-xs text-[#888]">Belum ada laporan terkunci bulan ini.</p>
                )}
              </div>
              <Alert className="border-[#f5a742]/35 bg-[#f5a742]/10 text-[#f4f4f5]">
                <Info className="size-4" />
                <AlertTitle>Catatan Tutup Hari</AlertTitle>
                <AlertDescription>
                  Kunci laporan setelah semua receiving, issue, dan request pending selesai dicek. Setelah terkunci,
                  PDF memakai snapshot arsip agar tidak berubah oleh transaksi susulan.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </section>
      )}

      {legacyWarehouseUi && warehouseSubTab === "warehouse-stock" && (
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Gudang stok operasional</CardTitle>
                <CardDescription>
                  {inventoryItems.length} SKU bahan, packaging, dan barang operasional yang terhubung ke resep produk.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className={statusClass.low}>{lowCount} low</Badge>
                <Badge className={statusClass.watch}>{watchCount} watch</Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-9 gap-2 border-[#22c55e]/45 bg-[#22c55e]/10 px-3 text-xs text-[#bbf7d0] hover:bg-[#22c55e]/18"
                  onClick={() => {
                    resetWarehouseForm();
                    setWarehouseDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Tambah SKU
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-9 gap-2 border-[#f5a742]/45 bg-[#f5a742]/12 px-3 text-xs text-[#ffd08a] hover:bg-[#f5a742]/20"
                  onClick={startOpname}
                >
                  <ClipboardCheck className="size-4" />
                  Stok Opname
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-1 rounded-md border border-[#34343c] bg-black/20 p-1">
              {([
                ["all", "Semua"],
                ["dapur", "Dapur"],
                ["bar", "Bar"],
                ["general", "Umum"],
              ] as const).map(([area, label]) => (
                <button
                  key={area}
                  type="button"
                  disabled={!canSwitchInventoryArea && area !== restrictedInventoryArea}
                  onClick={() => canSwitchInventoryArea && setInventoryUsageArea(area)}
                  className={`rounded px-3 py-2 text-xs font-black transition ${
                    effectiveInventoryUsageArea === area
                      ? "bg-[#d11a2a] text-white"
                      : !canSwitchInventoryArea
                        ? "text-[#666] opacity-45"
                        : "text-[#d6d6dc] hover:bg-[#202027]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_160px_150px_150px]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={inventoryQuery}
                  onChange={(event) => setInventoryQuery(event.target.value)}
                  className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
                  placeholder="Cari bahan, SKU, kategori, ukuran kemasan"
                />
              </div>
              <Select value={inventoryCategory} onValueChange={setInventoryCategory}>
                <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={effectiveInventoryUsageArea}
                onValueChange={(value) => canSwitchInventoryArea && setInventoryUsageArea(value as typeof inventoryUsageArea)}
                disabled={!canSwitchInventoryArea}
              >
                <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                  <SelectValue placeholder="Area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua area</SelectItem>
                  <SelectItem value="dapur">Dapur</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="general">Umum</SelectItem>
                </SelectContent>
              </Select>
              <Select value={inventoryStatus} onValueChange={setInventoryStatus}>
                <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="low">âš  Low only</SelectItem>
                  <SelectItem value="watch">👁 Watch only</SelectItem>
                  <SelectItem value="safe">âœ“ Safe only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="garage-scroll max-h-[62vh] rounded-md border border-[#34343c] bg-black/10">
              <Table className="min-w-[980px]">
                <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>On hand</TableHead>
                    <TableHead>Minimum</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => {
                    const value = Math.min(
                      100,
                      Math.round((item.onHand / item.min) * 100),
                    );
                    return (
                      <TableRow
                        key={item.sku}
                        className="cursor-pointer transition-colors hover:bg-white/[0.04]"
                        onClick={() => setSelectedSku(item.sku)}
                      >
                        <TableCell className="min-w-[240px]">
                          <div>
                            <p className="font-medium text-white">{item.name}</p>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {item.sku} - {item.alternativeName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-zinc-200">{item.category}</TableCell>
                        <TableCell>
                          <Badge className="border-[#3b82f6]/35 bg-[#3b82f6]/10 text-[#bfdbfe]">
                            {inventoryUsageAreaLabels[inventoryUsageAreaForItem(item)]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.onHand} {item.unit}
                          <Progress value={value} className="mt-2 h-2" />
                        </TableCell>
                        <TableCell>
                          {item.min} {item.unit}
                        </TableCell>
                        <TableCell className="text-zinc-200">{item.packageSize}</TableCell>
                        <TableCell>
                          <Badge className={statusClass[item.status]}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] whitespace-normal text-sm leading-5 text-zinc-200">
                          {item.movement}
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <div className="flex flex-wrap gap-1.5">
                            {warehouseStockBySku.get(item.sku) ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="garage-press h-8 border-[#22c55e]/45 bg-[#22c55e]/10 px-2 text-xs text-[#bbf7d0]"
                                  onClick={() => openOutletAdjust(warehouseStockBySku.get(item.sku)!, "add")}
                                >
                                  <Plus className="mr-1 size-3.5" />
                                  Tambah
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="garage-press h-8 border-[#f5a742]/45 bg-[#f5a742]/10 px-2 text-xs text-[#ffd08a]"
                                  onClick={() => openOutletAdjust(warehouseStockBySku.get(item.sku)!, "subtract")}
                                >
                                  <Minus className="mr-1 size-3.5" />
                                  Kurang
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-xs text-[#ffc2c8]"
                                  onClick={() => openOutletAdjust(warehouseStockBySku.get(item.sku)!, "clear")}
                                >
                                  <Trash2 className="mr-1 size-3.5" />
                                  Hapus Stok
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredInventory.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-8 text-center text-sm text-[#8f8f99]"
                      >
                        Tidak ada item ditemukan di filter ini.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <InventorySmartReorderPanel
          onAddSupplierOrder={canManageWarehouseFlow ? addSmartSupplierOrdersToCart : undefined}
        />

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[#bbf7d0]" />
                  Audit harian Gudang
                </CardTitle>
                <CardDescription>Ringkasan barang masuk, issue outlet, dan nilai stok hari ini.</CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="garage-press h-8 border-[#34343c] bg-white/[0.04] px-2 text-[10px]"
                onClick={() => void downloadWarehouseAuditPdf()}
                disabled={warehouseAuditPdfLoading}
              >
                {warehouseAuditPdfLoading ? <RefreshCw className="mr-1 size-3 animate-spin" /> : <FileText className="mr-1 size-3" />}
                PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouseDailyAudit ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="garage-mono text-[9px] uppercase text-[#8f8f99]">Receiving</p>
                    <p className="mt-1 text-lg font-black text-white">{warehouseDailyAudit.receivingCount}</p>
                    <p className="text-[10px] text-[#bbf7d0]">{currency.format(warehouseDailyAudit.receivingValue)}</p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="garage-mono text-[9px] uppercase text-[#8f8f99]">Issue outlet</p>
                    <p className="mt-1 text-lg font-black text-white">{warehouseDailyAudit.issuedRequestCount}</p>
                    <p className="text-[10px] text-[#b8b8bf]">{warehouseDailyAudit.issuedItemCount} item</p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="garage-mono text-[9px] uppercase text-[#8f8f99]">Mutasi</p>
                    <p className="mt-1 text-lg font-black text-white">{warehouseDailyAudit.movementCount}</p>
                    <p className="text-[10px] text-[#b8b8bf]">{warehouseDailyAudit.date}</p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-black/20 p-3">
                    <p className="garage-mono text-[9px] uppercase text-[#8f8f99]">Nilai stok</p>
                    <p className="mt-1 text-lg font-black text-white">{currency.format(warehouseDailyAudit.warehouseStockValue)}</p>
                    <p className="text-[10px] text-[#ffd08a]">{warehouseDailyAudit.lowCount} low / {warehouseDailyAudit.watchCount} watch</p>
                  </div>
                </div>
                {warehouseDailyAudit.byStation.length ? (
                  <div className="rounded-md border border-[#34343c] bg-[#0f0f14] p-3">
                    <p className="garage-mono mb-2 text-[10px] uppercase text-[#8f8f99]">Issue per area</p>
                    <div className="space-y-1.5">
                      {warehouseDailyAudit.byStation.map((row) => (
                        <div key={row.station} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white">
                            {row.station === "bar" ? "Bar" : "Dapur"}
                          </span>
                          <span className="garage-mono text-[#bfdbfe]">
                            {row.requestCount} req / {row.totalQty} qty
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {warehouseDailyAudit.topMovementItems.length ? (
                  <div className="rounded-md border border-[#34343c] bg-[#0f0f14] p-3">
                    <p className="garage-mono mb-2 text-[10px] uppercase text-[#8f8f99]">Top mutasi hari ini</p>
                    <div className="space-y-1.5">
                      {warehouseDailyAudit.topMovementItems.map((item) => (
                        <div key={item.sku} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-white">{item.name}</span>
                          <span className="garage-mono shrink-0 text-[#ffd08a]">
                            {item.totalAbsQty} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="rounded-md border border-dashed border-[#34343c] py-6 text-center text-xs text-[#8f8f99]">
                Audit harian belum dimuat.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Stock movement</CardTitle>
            <CardDescription>Mutasi bahan Garage dari POS dan gudang.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Movement summary 7 hari â€” chart kecil per type + top items */}
            {movementSummary ? (
              <div className="rounded-md border border-[#34343c] bg-[#0f0f14] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
                    {movementSummary.rangeDays} hari · {movementSummary.totalEvents} event
                  </p>
                </div>
                <div className="space-y-1.5">
                  {movementSummary.byType.slice(0, 5).map((row) => {
                    const max = Math.max(
                      1,
                      ...movementSummary.byType.map((r) => r.count),
                    );
                    const pct = Math.round((row.count / max) * 100);
                    const color =
                      row.type === "recipe_deduct"
                        ? "bg-[#d11a2a]"
                        : row.type === "void_reverse"
                          ? "bg-[#f5a742]"
                          : row.type === "stock_in"
                            ? "bg-[#22c55e]"
                            : row.type === "stock_out"
                              ? "bg-[#ef4444]"
                              : "bg-[#3b82f6]";
                    return (
                      <div key={row.type} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px] text-[#d6d6dc]">
                          <span className="garage-mono">{row.type}</span>
                          <span className="garage-mono">{row.count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className={`h-full ${color}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {movementSummary.topItems.length > 0 ? (
                  <div className="mt-3 border-t border-[#34343c] pt-2">
                    <p className="garage-mono mb-1.5 text-[10px] uppercase tracking-wide text-[#b8b8bf]">
                      Top item bergerak
                    </p>
                    <div className="space-y-1">
                      {movementSummary.topItems.slice(0, 5).map((item) => (
                        <div
                          key={item.sku}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="truncate text-white">{item.name}</span>
                          <span className="garage-mono shrink-0 text-[#ffd08a]">
                            {item.totalAbsQty.toFixed(1)} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="garage-scroll max-h-[420px] space-y-3 pr-1">
              {stockMovements.map((movement) => (
                <div
                  key={movement}
                  className="garage-surface rounded-md p-3 text-sm leading-5 text-zinc-100"
                >
                  {movement}
                </div>
              ))}
            </div>
            <div className="rounded-md border border-[#f5a742]/30 bg-[#f5a742]/10 p-3">
              <p className="garage-mono">Gudang mode</p>
              <p className="mt-1 text-sm text-white">
                Peralatan minimal dari PDF tidak masuk stok harian; cocok jadi modul
                asset/equipment berikutnya.
              </p>
            </div>
            <div className="rounded-md border border-[#34343c] bg-black/15 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="garage-mono">Riwayat opname</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="garage-press h-7 border-[#4a4a54] px-2 text-[10px]"
                  onClick={() => void loadOpnameSessions()}
                >
                  Refresh
                </Button>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                <div className="rounded-md border border-[#2b2b33] bg-[#111116] p-2">
                  <p className="garage-mono text-[9px] text-[#8f8f99]">Pending</p>
                  <p className="mt-1 text-lg font-black text-[#ffd08a]">
                    {
                      opnameSessions.filter((row) =>
                        ["draft", "pending_approval"].includes(row.status),
                      ).length
                    }
                  </p>
                </div>
                <div className="rounded-md border border-[#2b2b33] bg-[#111116] p-2">
                  <p className="garage-mono text-[9px] text-[#8f8f99]">Approved</p>
                  <p className="mt-1 text-lg font-black text-white">
                    {opnameSessions.filter((row) => row.status === "approved").length}
                  </p>
                </div>
                <div className="rounded-md border border-[#2b2b33] bg-[#111116] p-2">
                  <p className="garage-mono text-[9px] text-[#8f8f99]">Applied</p>
                  <p className="mt-1 text-lg font-black text-[#dcfce7]">
                    {opnameSessions.filter((row) => row.status === "applied").length}
                  </p>
                </div>
              </div>
              <div className="garage-scroll max-h-[320px] space-y-2 pr-1">
                {opnameSessions.length ? (
                  opnameSessions.map((session) => (
                    <div key={session.id} className="rounded-md border border-[#2b2b33] bg-[#111116] p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-white">{session.code}</p>
                          <p className="text-[10px] text-[#8f8f99]">
                            {new Date(session.createdAt).toLocaleString("id-ID", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}{" "}
                            - {session.totalItems} item
                          </p>
                        </div>
                        <Badge className={`${statusClass[session.status] ?? statusClass.info} px-2 text-[10px]`}>
                          {session.status}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-[#ffd79a]">
                        Selisih total: {session.totalDelta}
                      </p>
                      {session.note ? (
                        <p className="mt-1 text-[10px] text-[#b8b8bf]">{session.note}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {["draft", "pending_approval"].includes(session.status) ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              className="garage-press h-7 px-2 text-[10px]"
                              disabled={Boolean(opnameActionId)}
                              onClick={() => void runOpnameAction(session.id, "approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="garage-press h-7 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-[10px] text-[#ffc2c8]"
                              disabled={Boolean(opnameActionId)}
                              onClick={() => void runOpnameAction(session.id, "reject")}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {session.status === "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            className="garage-press h-7 px-2 text-[10px]"
                            disabled={Boolean(opnameActionId)}
                            onClick={() => void runOpnameAction(session.id, "apply")}
                          >
                            Apply stok
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-[#8f8f99]">
                    Belum ada batch opname.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
      )}

      <Dialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="size-5 text-[#f5a742]" />
              Tambah SKU Gudang
            </DialogTitle>
            <DialogDescription>
              SKU Gudang dipakai oleh resep/BOM produk, HPP, smart reorder, dan export Produk + Gudang.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={warehouseSku}
              onChange={(event) => setWarehouseSku(event.target.value.toUpperCase())}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="SKU, contoh: KOPI-001"
            />
            <Input
              value={warehouseName}
              onChange={(event) => setWarehouseName(event.target.value)}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Nama item Gudang"
            />
            <Input
              value={warehouseAlias}
              onChange={(event) => setWarehouseAlias(event.target.value)}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Alias / nama alternatif"
            />
            <Input
              value={warehouseCategoryInput}
              onChange={(event) => setWarehouseCategoryInput(event.target.value)}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Kategori"
            />
            <Select value={warehouseUsageArea} onValueChange={(value) => setWarehouseUsageArea(value as "bar" | "dapur" | "general")}>
              <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                <SelectValue placeholder="Area pemakaian" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dapur">Dapur</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="general">Umum</SelectItem>
              </SelectContent>
            </Select>
            <select
              value={warehouseUnit}
              onChange={(event) => setWarehouseUnit(event.target.value)}
              className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
            >
              {["unit","kg","gr","liter","ml","pcs","bks","pack","box","btl","sachet","porsi","roll","lembar"].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <Input
              value={warehousePackageSize}
              onChange={(event) => setWarehousePackageSize(event.target.value)}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Package size, contoh: 1 kg"
            />
            <Input
              inputMode="numeric"
              value={warehouseUnitCost}
              onChange={(event) => setWarehouseUnitCost(event.target.value.replace(/[^\d]/g, ""))}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Unit cost / HPP per unit"
            />
            <Input
              type="number"
              step="any"
              min={0}
              value={warehouseOnHand}
              onChange={(event) => setWarehouseOnHand(event.target.value)}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Stok on hand"
            />
            <Input
              type="number"
              step="any"
              min={0}
              value={warehouseMin}
              onChange={(event) => setWarehouseMin(event.target.value)}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Minimum stok"
            />
            <Input
              value={warehouseMovement}
              onChange={(event) => setWarehouseMovement(event.target.value)}
              className="h-10 border-[#34343c] bg-white/[0.06]"
              placeholder="Catatan awal"
            />
          </div>
          {warehouseError ? (
            <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Gudang</AlertTitle>
              <AlertDescription>{warehouseError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54]"
              onClick={() => setWarehouseDialogOpen(false)}
              disabled={warehouseSaving}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press h-10"
              onClick={() => void createWarehouseItem()}
              disabled={warehouseSaving}
            >
              {warehouseSaving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Simpan SKU
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InventoryDetailModal
        key={selectedSku ?? "none"}
        sku={selectedSku}
        onClose={() => setSelectedSku(null)}
      />

      {/* Dialog: Stok Opname (batch update onHand + log movement) */}
      <Dialog
        open={opnameOpen}
        onOpenChange={(open) => {
          setOpnameOpen(open);
          if (!open) {
            setOpnameError(null);
            setOpnameResult(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Stok Opname</DialogTitle>
            <DialogDescription>
              Input qty fisik per item. Sistem membuat batch audit; stok berubah
              hanya setelah approved dan applied.
            </DialogDescription>
          </DialogHeader>

          {opnameResult ? (
            <div className="space-y-3">
              <Alert
                className={
                  opnameResult.status === "pending_approval"
                    ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]"
                    : "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]"
                }
              >
                {opnameResult.status === "pending_approval" ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
                <AlertTitle>Opname tersimpan</AlertTitle>
                <AlertDescription>
                  {opnameResult.code} berisi {opnameResult.totalItems} item,
                  total selisih {opnameResult.totalDelta}. Status: {opnameResult.status}.
                  Stok belum berubah sebelum approve dan apply final.
                </AlertDescription>
              </Alert>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                  onClick={() => {
                    setOpnameResult(null);
                    setOpnameDraft({});
                  }}
                >
                  Opname lagi
                </Button>
                <Button
                  type="button"
                  className="garage-press h-10"
                  onClick={() => {
                    setOpnameOpen(false);
                    // Reload page untuk refresh inventory data dari server
                    if (typeof window !== "undefined") window.location.reload();
                  }}
                >
                  Tutup & refresh
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <Select
                  value={opnameLocationType}
                  onValueChange={(value) => {
                    setOpnameLocationType(value as "warehouse" | "outlet");
                    setOpnameDraft({});
                  }}
                >
                  <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                    <SelectValue placeholder="Lokasi opname" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Gudang pusat</SelectItem>
                    <SelectItem value="outlet">Outlet/Dapur</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={opnameOutletId}
                  onValueChange={(value) => {
                    setOpnameOutletId(value);
                    setOpnameDraft({});
                  }}
                  disabled={opnameLocationType === "warehouse"}
                >
                  <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                    <SelectValue placeholder="Outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    {outletOptions.map((outlet) => (
                      <SelectItem key={outlet.id} value={outlet.id}>
                        {outlet.code} - {outlet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={opnameQuery}
                    onChange={(event) => setOpnameQuery(event.target.value)}
                    className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
                    placeholder="Cari item untuk opname..."
                  />
                </div>
                <Select value={opnameCategory} onValueChange={setOpnameCategory}>
                  <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="garage-scroll min-h-0 flex-1 overflow-auto rounded-md border border-[#34343c] bg-black/10">
                {/* Mobile (sm-) â€” card list per item dengan input besar */}
                <div className="space-y-1.5 p-1.5 sm:hidden">
                  {opnameFilteredItems.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[#8f8f99]">
                      Tidak ada item di filter ini.
                    </p>
                  ) : (
                    opnameFilteredItems.map((item) => {
                      const draftStr = opnameDraft[item.sku] ?? "";
                      const draftNum = Number(draftStr);
                      const hasInput = draftStr !== "" && Number.isFinite(draftNum);
                      const delta = hasInput ? draftNum - item.onHand : 0;
                      return (
                        <div
                          key={item.sku}
                          className="rounded-md border border-[#34343c] bg-white/[0.04] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">
                                {item.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {item.sku} · {item.category}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="garage-mono text-[10px] uppercase text-[#8f8f99]">
                                sistem
                              </p>
                              <p className="garage-mono text-sm font-semibold text-zinc-200">
                                {item.onHand} {item.unit}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={draftStr}
                              onChange={(event) =>
                                setOpnameDraft((current) => ({
                                  ...current,
                                  [item.sku]: event.target.value,
                                }))
                              }
                              placeholder={`Fisik (${item.unit})`}
                              className="h-12 flex-1 border-[#34343c] bg-white/[0.06] text-base"
                            />
                            <div className="min-w-[60px] text-right">
                              {hasInput ? (
                                <span
                                  className={`garage-mono text-base font-extrabold ${
                                    delta === 0
                                      ? "text-[#86efac]"
                                      : delta > 0
                                        ? "text-[#7dd3fc]"
                                        : "text-[#ffc2c8]"
                                  }`}
                                >
                                  {delta > 0 ? "+" : ""}
                                  {delta}
                                </span>
                              ) : (
                                <span className="text-[11px] text-[#8f8f99]">
                                  Î”
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {/* Desktop (sm+) â€” table layout existing */}
                <Table className="hidden min-w-[680px] sm:table">
                  <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Sistem</TableHead>
                      <TableHead className="text-right">Fisik</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opnameFilteredItems.map((item) => {
                      const draftStr = opnameDraft[item.sku] ?? "";
                      const draftNum = Number(draftStr);
                      const hasInput = draftStr !== "" && Number.isFinite(draftNum);
                      const delta = hasInput ? draftNum - item.onHand : 0;
                      return (
                        <TableRow key={item.sku}>
                          <TableCell className="min-w-[220px]">
                            <p className="font-medium text-white">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.sku} · {item.category}
                            </p>
                          </TableCell>
                          <TableCell className="text-right text-zinc-200">
                            {item.onHand} {item.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={draftStr}
                              onChange={(event) =>
                                setOpnameDraft((current) => ({
                                  ...current,
                                  [item.sku]: event.target.value,
                                }))
                              }
                              placeholder="â€”"
                              className="ml-auto h-9 w-24 border-[#34343c] bg-white/[0.06] text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {hasInput ? (
                              <span
                                className={`garage-mono text-sm font-semibold ${
                                  delta === 0
                                    ? "text-[#86efac]"
                                    : delta > 0
                                      ? "text-[#7dd3fc]"
                                      : "text-[#ffc2c8]"
                                }`}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#8f8f99]">â€”</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {opnameFilteredItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-[#8f8f99]"
                        >
                          Tidak ada item di filter ini.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Catatan opname (opsional)
                </p>
                <Input
                  value={opnameNote}
                  onChange={(event) => setOpnameNote(event.target.value.slice(0, 120))}
                  placeholder="mis. Opname pagi shift, audit gudang"
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                  maxLength={120}
                />
              </div>

              {opnameError ? (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Opname</AlertTitle>
                  <AlertDescription>{opnameError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs text-[#b8b8bf]">
                  <span className="garage-mono text-[#ffd08a]">
                    {opnameDraftCount}
                  </span>{" "}
                  item siap di-submit
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                    onClick={() => setOpnameOpen(false)}
                    disabled={opnameSubmitting}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    className="garage-press h-10"
                    onClick={() => void submitOpname()}
                    disabled={opnameSubmitting || opnameDraftCount === 0}
                  >
                    {opnameSubmitting ? (
                      <>
                        <RefreshCw className="mr-2 size-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 size-4" />
                        Submit Opname ({opnameDraftCount})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// â”€â”€â”€ INVENTORY DETAIL MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Modal dengan: profil item, stats, history stock movement (live fetch),
// dan form quick adjust onHand. Reuse pattern modal-detail dari CRM/Finance.
function InventoryDetailModal({
  sku,
  onClose,
}: {
  sku: string | null;
  onClose: () => void;
}) {
  type InventoryDetail = {
    item: InventoryItem;
    movements: Array<{
      id: string;
      type: string;
      note: string;
      qty: number | null;
      actor: string;
      createdAt: string;
    }>;
    timeline?: {
      locations: Array<{
        id: string;
        locationType: string;
        locationKey: string;
        outletName: string | null;
        onHand: number;
        min: number;
        status: string;
        movement: string;
        updatedAt: string;
      }>;
      receivings: Array<{
        id: string;
        code: string;
        invoiceNo: string | null;
        qty: number;
        unit: string;
        unitCost: number;
        lineTotal: number;
        receivedAt: string;
      }>;
      transfers: Array<{
        id: string;
        requestNo: string;
        outletName: string | null;
        station: string;
        status: string;
        requestedQty: number;
        issuedQty: number;
        unit: string;
        createdAt: string;
        issuedAt: string | null;
      }>;
    };
  };

  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustOnHand, setAdjustOnHand] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustMovementType, setAdjustMovementType] = useState("adjustment");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAlias, setEditAlias] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editUsageArea, setEditUsageArea] = useState<"bar" | "dapur" | "general">("dapur");
  const [editUnit, setEditUnit] = useState("");
  const [editPackageSize, setEditPackageSize] = useState("");
  const [editUnitCost, setEditUnitCost] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (!sku) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch detail on open
    setLoading(true);
    setError(null);
    fetch(`/api/inventory/${encodeURIComponent(sku)}`)
      .then((res) => res.json().then((j) => ({ ok: res.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j.data) throw new Error(j.error?.message || "Gagal memuat detail");
        setDetail(j.data);
        setAdjustOnHand(String(j.data.item.onHand));
        setEditName(j.data.item.name);
        setEditAlias(j.data.item.alternativeName);
        setEditCategory(j.data.item.category);
        setEditUsageArea(inventoryUsageAreaForItem(j.data.item));
        setEditUnit(j.data.item.unit);
        setEditPackageSize(j.data.item.packageSize);
        setEditUnitCost(String(j.data.item.unitCost ?? 0));
        setEditMin(String(j.data.item.min));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sku]);

  const handleAdjust = async () => {
    if (!detail) return;
    const onHandValue = Number(adjustOnHand);
    if (!Number.isFinite(onHandValue) || onHandValue < 0) {
      setError("On hand harus angka >= 0");
      return;
    }
    if (!adjustNote.trim() || adjustNote.trim().length < 3) {
      setError("Catatan adjust wajib minimal 3 karakter");
      return;
    }
    setAdjustSaving(true);
    setError(null);
    try {
      // 1. Update onHand
      const patchRes = await fetch(`/api/inventory/${encodeURIComponent(detail.item.sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onHand: onHandValue,
          movement: adjustNote.trim(),
        }),
      });
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => ({}));
        throw new Error(j.error?.message || "Gagal update inventory");
      }
      // 2. Log stock movement
      const delta = onHandValue - detail.item.onHand;
      await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemSku: detail.item.sku,
          type: adjustMovementType,
          qty: delta,
          note: `Adjust manual: ${adjustNote.trim()} (${detail.item.onHand} → ${onHandValue} ${detail.item.unit})`,
        }),
      });
      // Re-fetch detail
      const refetch = await fetch(`/api/inventory/${encodeURIComponent(detail.item.sku)}`);
      const json = await refetch.json();
      if (json.data) setDetail(json.data);
      setAdjustOpen(false);
      setAdjustNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjust gagal");
    } finally {
      setAdjustSaving(false);
    }
  };

  const handleEditWarehouseItem = async () => {
    if (!detail) return;
    const unitCost = Number(editUnitCost || 0);
    const min = Number(editMin);
    if (!editName.trim() || !editCategory.trim() || !editUnit.trim() || !editPackageSize.trim()) {
      setError("Nama, kategori, unit, dan package size wajib diisi.");
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(min) || min < 0) {
      setError("Unit cost dan minimum stok harus angka >= 0.");
      return;
    }
    setEditSaving(true);
    setError(null);
    try {
      const patchRes = await fetch(`/api/inventory/${encodeURIComponent(detail.item.sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          alternativeName: editAlias.trim(),
          category: editCategory.trim(),
          usageArea: editUsageArea,
          unit: editUnit.trim(),
          packageSize: editPackageSize.trim(),
          unitCost: Math.round(unitCost),
          min,
          movement: detail.item.movement,
        }),
      });
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => ({}));
        throw new Error(j.error?.message || "Gagal update detail SKU Gudang");
      }
      const refetch = await fetch(`/api/inventory/${encodeURIComponent(detail.item.sku)}`);
      const json = await refetch.json();
      if (json.data) setDetail(json.data);
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update SKU Gudang gagal");
    } finally {
      setEditSaving(false);
    }
  };

  if (!sku) return null;
  const item = detail?.item;
  const stockPercent = item
    ? Math.min(100, Math.round((item.onHand / Math.max(1, item.min)) * 100))
    : 0;
  const statusTone =
    item?.status === "low"
      ? "border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffc2c8]"
      : item?.status === "watch"
        ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd79a]"
        : "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]";

  return (
    <Dialog open={Boolean(sku)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="size-5 text-[#f5a742]" />
            {item?.name ?? "Detail SKU Gudang"}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {item?.sku} {item?.alternativeName ? `· ${item.alternativeName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="garage-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center justify-center py-6 text-sm text-[#8f8f99]">
              <RefreshCw className="mr-2 size-4 animate-spin text-[#f5a742]" />
              Memuat detailâ€¦
            </div>
          )}

          {error && (
            <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
              {error}
            </div>
          )}

          {item && (
            <>
              <div className="rounded-md border border-[#34343c] bg-[#17171c] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                      Stock On Hand
                    </p>
                    <p className="mt-1 garage-display text-3xl font-bold text-white">
                      {item.onHand}{" "}
                      <span className="text-base text-[#8f8f99]">{item.unit}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-[#8f8f99]">
                      Min: {item.min} {item.unit} · {item.packageSize}
                    </p>
                  </div>
                  <Badge className={`text-[11px] ${statusTone}`}>
                    {item.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#34343c]">
                  <div
                    className={`h-full transition-all ${
                      item.status === "low"
                        ? "bg-[#d11a2a]"
                        : item.status === "watch"
                          ? "bg-[#f5a742]"
                          : "bg-[#22c55e]"
                    }`}
                    style={{ width: `${stockPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-[#8f8f99]">
                  {stockPercent}% dari minimum stock
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                    Kategori
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {item.category} / {inventoryUsageAreaLabels[inventoryUsageAreaForItem(item)]}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                    Movement terakhir
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-[#d6d6dc]">
                    {item.movement || "â€”"}
                  </p>
                </div>
              </div>

              {!adjustOpen && !editOpen && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-10 w-full gap-2 border-[#34343c] bg-white/[0.04]"
                    onClick={() => setEditOpen(true)}
                  >
                    <Settings className="size-4" />
                    Edit Detail SKU
                  </Button>
                  <Button
                    type="button"
                    className="garage-press h-10 w-full gap-2"
                    onClick={() => {
                      setAdjustOnHand(String(item.onHand));
                      setAdjustOpen(true);
                    }}
                  >
                    <Plus className="size-4" />
                    Tambah/Kurangi Stok
                  </Button>
                </div>
              )}

              {editOpen && (
                <div className="rounded-md border border-[#3b82f6]/45 bg-[#3b82f6]/10 p-3">
                  <p className="garage-mono mb-2 text-[11px] uppercase tracking-wide text-[#bfdbfe]">
                    Edit Detail SKU Gudang
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={editName} onChange={(event) => setEditName(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Nama item" />
                    <Input value={editAlias} onChange={(event) => setEditAlias(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Alias" />
                    <Input value={editCategory} onChange={(event) => setEditCategory(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Kategori" />
                    <Select value={editUsageArea} onValueChange={(value) => setEditUsageArea(value as "bar" | "dapur" | "general")}>
                      <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                        <SelectValue placeholder="Area pemakaian" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dapur">Dapur</SelectItem>
                        <SelectItem value="bar">Bar</SelectItem>
                        <SelectItem value="general">Umum</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={editUnit} onChange={(event) => setEditUnit(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Unit" />
                    <Input value={editPackageSize} onChange={(event) => setEditPackageSize(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Package size" />
                    <Input inputMode="numeric" value={editUnitCost} onChange={(event) => setEditUnitCost(event.target.value.replace(/[^\d]/g, ""))} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Unit cost" />
                    <Input type="number" step="any" min={0} value={editMin} onChange={(event) => setEditMin(event.target.value)} className="h-10 border-[#34343c] bg-white/[0.06]" placeholder="Minimum stok" />
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" className="garage-press h-8 border-[#4a4a54]" onClick={() => setEditOpen(false)} disabled={editSaving}>
                      Batal
                    </Button>
                    <Button type="button" size="sm" className="garage-press h-8" onClick={() => void handleEditWarehouseItem()} disabled={editSaving}>
                      {editSaving ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Simpan Detail
                    </Button>
                  </div>
                </div>
              )}

              {adjustOpen && (
                <div className="rounded-md border border-[#f5a742]/55 bg-[#f5a742]/8 p-3">
                  <p className="garage-mono mb-2 text-[11px] uppercase tracking-wide text-[#ffd79a]">
                    Adjust Stock
                  </p>
                  <div className="space-y-2">
                    <Select value={adjustMovementType} onValueChange={setAdjustMovementType}>
                      <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                        <SelectValue placeholder="Tipe movement" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stock_in">Tambah stok</SelectItem>
                        <SelectItem value="stock_out">Kurangi stok</SelectItem>
                        <SelectItem value="adjustment">Adjustment</SelectItem>
                        <SelectItem value="waste">Waste / rusak</SelectItem>
                        <SelectItem value="purchase">Pembelian masuk</SelectItem>
                      </SelectContent>
                    </Select>
                    <div>
                      <p className="text-[10px] text-[#8f8f99]">
                        On hand baru ({item.unit})
                      </p>
                      <Input
                        type="number"
                        step="any"
                        value={adjustOnHand}
                        onChange={(event) => setAdjustOnHand(event.target.value)}
                        className="mt-1 h-10 border-[#34343c] bg-white/[0.06] font-mono"
                      />
                      {adjustOnHand && !Number.isNaN(Number(adjustOnHand)) && (
                        <p className="mt-1 font-mono text-[10px] text-[#8f8f99]">
                          Delta: {Number(adjustOnHand) - item.onHand >= 0 ? "+" : ""}
                          {Number(adjustOnHand) - item.onHand} {item.unit}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[#8f8f99]">Catatan (wajib)</p>
                      <Input
                        type="text"
                        value={adjustNote}
                        onChange={(event) => setAdjustNote(event.target.value)}
                        placeholder="Misal: opname pagi, terima dari supplier, expired"
                        maxLength={200}
                        className="mt-1 h-10 border-[#34343c] bg-white/[0.06]"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="garage-press h-8 border-[#4a4a54]"
                        onClick={() => {
                          setAdjustOpen(false);
                          setAdjustNote("");
                          setError(null);
                        }}
                        disabled={adjustSaving}
                      >
                        Batal
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="garage-press h-8"
                        onClick={() => void handleAdjust()}
                        disabled={adjustSaving}
                      >
                        {adjustSaving ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        Simpan Adjust
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                <p className="garage-mono mb-2 text-[10px] uppercase tracking-wide text-[#bfdbfe]">
                  Stok per lokasi
                </p>
                {detail?.timeline?.locations?.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detail.timeline.locations.map((row) => (
                      <div key={row.id} className="rounded-md border border-[#23232a] bg-black/20 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-white">
                              {row.locationType === "warehouse" ? "Gudang pusat" : row.outletName ?? row.locationKey}
                            </p>
                            <p className="mt-0.5 text-[10px] text-[#8f8f99]">
                              Min {row.min} / {new Date(row.updatedAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                            </p>
                          </div>
                          <Badge className={statusClass[row.status] ?? statusClass.info}>{row.status}</Badge>
                        </div>
                        <p className="mt-2 garage-mono text-sm font-black text-white">
                          {row.onHand} {item.unit}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[10px] text-[#8f8f99]">{row.movement || "-"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8f8f99]">Belum ada stok lokasi untuk SKU ini.</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <p className="garage-mono mb-2 text-[10px] uppercase tracking-wide text-[#bbf7d0]">
                    Receiving supplier
                  </p>
                  {detail?.timeline?.receivings?.length ? (
                    <div className="garage-scroll max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {detail.timeline.receivings.map((row) => (
                        <div key={row.id} className="rounded border border-[#23232a] bg-black/20 p-2 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="truncate font-semibold text-white">{row.code}</span>
                            <span className="garage-mono text-[#bbf7d0]">{currency.format(row.lineTotal)}</span>
                          </div>
                          <p className="mt-0.5 text-[#8f8f99]">
                            {row.qty} {row.unit} x {currency.format(row.unitCost)} / {new Date(row.receivedAt).toLocaleDateString("id-ID")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8f8f99]">Belum ada receiving supplier.</p>
                  )}
                </div>
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                  <p className="garage-mono mb-2 text-[10px] uppercase tracking-wide text-[#ffd08a]">
                    Request outlet
                  </p>
                  {detail?.timeline?.transfers?.length ? (
                    <div className="garage-scroll max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {detail.timeline.transfers.map((row) => (
                        <div key={row.id} className="rounded border border-[#23232a] bg-black/20 p-2 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="truncate font-semibold text-white">{row.requestNo}</span>
                            <Badge className={row.status === "issued" ? statusClass.safe : row.status === "rejected" ? statusClass.low : statusClass.watch}>{row.status}</Badge>
                          </div>
                          <p className="mt-0.5 text-[#8f8f99]">
                            {row.outletName ?? "Outlet"} / {row.station === "bar" ? "Bar" : "Dapur"} / request {row.requestedQty} {row.unit}, issue {row.issuedQty} {row.unit}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8f8f99]">Belum ada transfer request.</p>
                  )}
                </div>
              </div>

              {/* Movement history */}
              <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
                <p className="garage-mono mb-2 text-[10px] uppercase tracking-wide text-[#f5a742]">
                  Riwayat Stock Movement ({detail?.movements.length ?? 0})
                </p>
                {detail?.movements.length === 0 ? (
                  <p className="text-xs text-[#8f8f99]">
                    Belum ada movement tercatat untuk item ini.
                  </p>
                ) : (
                  <ul className="garage-scroll max-h-64 space-y-1.5 overflow-y-auto">
                    {detail?.movements.map((mv) => (
                      <li
                        key={mv.id}
                        className="rounded-md border border-[#23232a] bg-black/20 p-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-relaxed text-[#d6d6dc]">
                              {mv.note}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                              {mv.actor} ·{" "}
                              {new Intl.DateTimeFormat("id-ID", {
                                dateStyle: "short",
                                timeStyle: "short",
                              }).format(new Date(mv.createdAt))}
                            </p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
                                mv.type === "stock_in"
                                  ? "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]"
                                  : mv.type === "stock_out"
                                    ? "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]"
                                    : "border-[#34343c] bg-white/[0.04] text-[#d6d6dc]"
                              }`}
                            >
                              {mv.type}
                            </span>
                            {mv.qty != null && (
                              <p className="mt-1 font-mono text-[10px] text-[#ffd79a]">
                                {mv.qty > 0 ? "+" : ""}
                                {mv.qty}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ SETTINGS VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Central pengaturan untuk semua fitur Garage OS. Tabbed UI:
// POS Billing, Approval, Branding, Notifikasi, Printer, Loyalty.
// Setiap field punya default dari server (DEFAULT_APP_SETTINGS) supaya
// kosong terisi fallback yang masuk akal.
// Alias ke AppSettings canonical â€” sebelumnya duplikat yang sering ketinggalan
// saat key baru ditambah. Sekarang tipe sinkron otomatis.
