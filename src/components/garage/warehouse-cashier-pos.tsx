"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  CheckCheck,
  Minus,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/lib/garage-api-types";

type CashierMode = "supplier_receive" | "request_issue";
type CartStatus = "draft" | "posting" | "posted" | "failed" | "cancelled";

type SupplierCartLine = {
  key: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  onHand: number;
  qty: number;
  unitCost: number;
};

type TransferRequestRow = {
  id: string;
  requestNo: string;
  outletName: string | null;
  station: "bar" | "dapur";
  status: string;
  note: string | null;
  createdAt: string;
  approvedAt?: string | null;
  issuedAt?: string | null;
  items: Array<{
    id: string;
    itemName: string;
    unit: string;
    requestedQty: number;
    issuedQty: number;
  }>;
};

type SupplierReceivingRow = {
  id: string;
  code: string;
  invoiceNo: string | null;
  totalAmount: number;
  receivedAt: string;
  supplierName: string | null;
};

type WarehouseDailyAudit = {
  date: string;
  movementCount: number;
  receivingCount: number;
  receivingValue: number;
  issuedRequestCount: number;
  issuedItemCount: number;
  warehouseStockValue: number;
  lowCount: number;
  watchCount: number;
  byStation: Array<{ station: string; requestCount: number; totalQty: number }>;
};

type StatusMessage = {
  type: "success" | "error" | "info";
  text: string;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" });

const DRAFT_KEY = "garage-warehouse-cashier-pos-draft-v2";

function formatQty(qty: number) {
  if (Number.isInteger(qty)) return qty.toString();
  return qty.toFixed(qty < 1 ? 3 : 2);
}

function remainingQty(item: { requestedQty: number; issuedQty: number }) {
  return Math.max(0, Number((item.requestedQty - item.issuedQty).toFixed(4)));
}

function statusLabel(status: CartStatus | string) {
  const map: Record<string, string> = {
    draft: "Draft",
    posting: "Posting",
    posted: "Posted",
    failed: "Failed",
    cancelled: "Cancelled",
    requested: "Requested",
    approved: "Approved",
    partial: "Partial",
    issued: "Issued",
  };
  return map[status] ?? status;
}

function dateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function saveDraft(mode: CashierMode, cart: SupplierCartLine[], note: string, invoiceNo: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, cart, note, invoiceNo }));
  } catch {
    // Draft cache is optional.
  }
}

function loadDraft(): {
  mode?: CashierMode;
  cart?: SupplierCartLine[];
  note?: string;
  invoiceNo?: string;
} {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function WarehouseCashierPos({ inventoryItems }: { inventoryItems: InventoryItem[] }) {
  const draft = useMemo(() => loadDraft(), []);
  const [mode, setMode] = useState<CashierMode>(draft.mode ?? "supplier_receive");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [supplierCart, setSupplierCart] = useState<SupplierCartLine[]>(draft.cart ?? []);
  const [invoiceNo, setInvoiceNo] = useState(draft.invoiceNo ?? "");
  const [note, setNote] = useState(draft.note ?? "");
  const [cartStatus, setCartStatus] = useState<CartStatus>((draft.cart?.length ?? 0) > 0 ? "draft" : "cancelled");
  const [lastDocumentNo, setLastDocumentNo] = useState("-");
  const [failedCount, setFailedCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [posting, setPosting] = useState(false);
  const [transferRequests, setTransferRequests] = useState<TransferRequestRow[]>([]);
  const [requestedRequests, setRequestedRequests] = useState<TransferRequestRow[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [issueDrafts, setIssueDrafts] = useState<Record<string, Record<string, string>>>({});
  const [supplierReceivings, setSupplierReceivings] = useState<SupplierReceivingRow[]>([]);
  const [issuedRequests, setIssuedRequests] = useState<TransferRequestRow[]>([]);
  const [dailyAudit, setDailyAudit] = useState<WarehouseDailyAudit | null>(null);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [receivingPdfId, setReceivingPdfId] = useState<string | null>(null);
  const [transferPdfId, setTransferPdfId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "requested" | "approved" | "partial" | "issued">("all");
  const [historyStation, setHistoryStation] = useState<"all" | "bar" | "dapur">("all");

  useEffect(() => {
    saveDraft(mode, supplierCart, note, invoiceNo);
  }, [invoiceNo, mode, note, supplierCart]);

  const categories = useMemo(() => {
    const set = new Set<string>(["Semua"]);
    inventoryItems.forEach((item) => set.add(item.category));
    return Array.from(set);
  }, [inventoryItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      if (category !== "Semua" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.alternativeName.toLowerCase().includes(q)
      );
    });
  }, [category, inventoryItems, query]);

  const selectedRequest = transferRequests.find((request) => request.id === selectedRequestId) ?? null;

  const supplierCartTotal = supplierCart.reduce(
    (sum, item) => sum + item.qty * item.unitCost,
    0,
  );

  const todayKey = dateKey(new Date());
  const todayReceivingValue = supplierReceivings
    .filter((receiving) => dateKey(receiving.receivedAt) === todayKey)
    .reduce((sum, receiving) => sum + receiving.totalAmount, 0);
  const todayReceivingCount = dailyAudit?.receivingCount ?? supplierReceivings.filter((receiving) => dateKey(receiving.receivedAt) === todayKey).length;
  const todayIssuedCount = dailyAudit?.issuedRequestCount ?? issuedRequests.filter((request) => request.issuedAt && dateKey(request.issuedAt) === todayKey).length;
  const activeIssueCount = transferRequests.filter((request) => request.status === "approved" || request.status === "partial").length;

  const filteredReceivings = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return supplierReceivings.filter((receiving) => {
      if (!q) return true;
      return (
        receiving.code.toLowerCase().includes(q) ||
        (receiving.invoiceNo ?? "").toLowerCase().includes(q) ||
        (receiving.supplierName ?? "").toLowerCase().includes(q)
      );
    });
  }, [historyQuery, supplierReceivings]);

  const filteredRequestHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return [...requestedRequests, ...transferRequests, ...issuedRequests]
      .filter((request) => {
        if (historyStatus !== "all" && request.status !== historyStatus) return false;
        if (historyStation !== "all" && request.station !== historyStation) return false;
        if (!q) return true;
        return (
          request.requestNo.toLowerCase().includes(q) ||
          (request.outletName ?? "").toLowerCase().includes(q) ||
          request.items.some((item) => item.itemName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [historyQuery, historyStation, historyStatus, issuedRequests, requestedRequests, transferRequests]);

  const loadServerHistory = useCallback(async () => {
    setLoadingFlows(true);
    try {
      const [approvedRes, partialRes, issuedRes, receivingRes, auditRes] = await Promise.all([
        fetch("/api/inventory/transfers?status=approved&limit=50", { cache: "no-store" }),
        fetch("/api/inventory/transfers?status=partial&limit=50", { cache: "no-store" }),
        fetch("/api/inventory/transfers?status=issued&limit=30", { cache: "no-store" }),
        fetch("/api/inventory/supplier-receivings?limit=30", { cache: "no-store" }),
        fetch("/api/inventory/audit-daily", { cache: "no-store" }),
      ]);
      const requestedRes = await fetch("/api/inventory/transfers?status=requested&limit=30", { cache: "no-store" });
      const [approvedJson, partialJson, issuedJson, receivingJson, auditJson, requestedJson] = await Promise.all([
        approvedRes.json(),
        partialRes.json(),
        issuedRes.json(),
        receivingRes.json(),
        auditRes.json(),
        requestedRes.json(),
      ]);
      if (!approvedRes.ok) throw new Error(approvedJson?.error?.message ?? "Gagal memuat request approved.");
      if (!partialRes.ok) throw new Error(partialJson?.error?.message ?? "Gagal memuat request partial.");
      if (!issuedRes.ok) throw new Error(issuedJson?.error?.message ?? "Gagal memuat request issued.");
      if (!requestedRes.ok) throw new Error(requestedJson?.error?.message ?? "Gagal memuat request pending approval.");
      if (!receivingRes.ok) throw new Error(receivingJson?.error?.message ?? "Gagal memuat receiving.");
      if (!auditRes.ok) throw new Error(auditJson?.error?.message ?? "Gagal memuat audit harian.");
      const merged = [
        ...(approvedJson?.data?.requests ?? []),
        ...(partialJson?.data?.requests ?? []),
      ] as TransferRequestRow[];
      const unique = new Map<string, TransferRequestRow>();
      merged.forEach((request) => unique.set(request.id, request));
      const requests = Array.from(unique.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setTransferRequests(requests);
      setSelectedRequestId((current) => current || requests[0]?.id || "");
      setRequestedRequests(requestedJson?.data?.requests ?? []);
      setIssuedRequests(issuedJson?.data?.requests ?? []);
      setSupplierReceivings(receivingJson?.data?.receivings ?? []);
      setDailyAudit(auditJson?.data ?? null);
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Data Kasir Gudang gagal dimuat.",
      });
    } finally {
      setLoadingFlows(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadServerHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadServerHistory]);

  function addToSupplierCart(item: InventoryItem) {
    setCartStatus("draft");
    setSupplierCart((current) => {
      const existing = current.find((line) => line.sku === item.sku);
      if (existing) {
        return current.map((line) =>
          line.sku === item.sku ? { ...line, qty: Number((line.qty + 1).toFixed(4)) } : line,
        );
      }
      return [
        ...current,
        {
          key: `${item.sku}-${Date.now()}`,
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          category: item.category,
          onHand: item.onHand,
          qty: 1,
          unitCost: Number(item.unitCost ?? 0),
        },
      ];
    });
  }

  function updateSupplierLine(key: string, patch: Partial<SupplierCartLine>) {
    setCartStatus("draft");
    setSupplierCart((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeSupplierLine(key: string) {
    setSupplierCart((current) => current.filter((line) => line.key !== key));
  }

  function resetSupplierCart() {
    setSupplierCart([]);
    setInvoiceNo("");
    setNote("");
    setCartStatus("cancelled");
    clearDraft();
  }

  function issueDraftValue(request: TransferRequestRow, item: TransferRequestRow["items"][number]) {
    return issueDrafts[request.id]?.[item.id] ?? String(remainingQty(item));
  }

  function setIssueDraftValue(requestId: string, itemId: string, value: string) {
    setCartStatus("draft");
    setIssueDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? {}),
        [itemId]: value,
      },
    }));
  }

  async function postSupplierReceiving() {
    if (!supplierCart.length) {
      setStatusMessage({ type: "error", text: "Cart receiving masih kosong." });
      return;
    }
    setPosting(true);
    setCartStatus("posting");
    setStatusMessage({ type: "info", text: "Posting receiving supplier..." });
    try {
      const response = await fetch("/api/inventory/supplier-receivings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo: invoiceNo.trim() || undefined,
          note: note.trim() || "Kasir Gudang POS - barang masuk",
          items: supplierCart.map((line) => ({
            sku: line.sku,
            qty: line.qty,
            unitCost: Math.max(0, Math.round(line.unitCost || 0)),
          })),
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Posting receiving gagal.");
      const refNo = json?.data?.receiving?.code ?? "RCV";
      setLastDocumentNo(refNo);
      setCartStatus("posted");
      setStatusMessage({ type: "success", text: `Posted: ${refNo}. Stok Gudang sudah bertambah.` });
      resetSupplierCart();
      setCartStatus("posted");
      setLastDocumentNo(refNo);
      await loadServerHistory();
    } catch (err) {
      setFailedCount((count) => count + 1);
      setCartStatus("failed");
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Posting receiving gagal.",
      });
    } finally {
      setPosting(false);
    }
  }

  async function postRequestIssue() {
    if (!selectedRequest) {
      setStatusMessage({ type: "error", text: "Pilih request approved/partial dulu." });
      return;
    }
    const items = selectedRequest.items
      .map((item) => ({
        itemId: item.id,
        issuedQty: Number(issueDraftValue(selectedRequest, item)),
      }))
      .filter((item) => Number.isFinite(item.issuedQty) && item.issuedQty > 0);
    if (!items.length) {
      setStatusMessage({ type: "error", text: "Isi minimal 1 qty issue." });
      return;
    }
    setPosting(true);
    setCartStatus("posting");
    setStatusMessage({ type: "info", text: `Posting issue ${selectedRequest.requestNo}...` });
    try {
      const response = await fetch(`/api/inventory/transfers/${selectedRequest.id}/issue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Posting issue gagal.");
      const status = json?.data?.status ?? "posted";
      setLastDocumentNo(selectedRequest.requestNo);
      setCartStatus("posted");
      setStatusMessage({
        type: "success",
        text: `Posted: ${selectedRequest.requestNo}. Status request sekarang ${statusLabel(status)}.`,
      });
      setIssueDrafts((current) => {
        const next = { ...current };
        delete next[selectedRequest.id];
        return next;
      });
      await loadServerHistory();
    } catch (err) {
      setFailedCount((count) => count + 1);
      setCartStatus("failed");
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Posting issue gagal.",
      });
    } finally {
      setPosting(false);
    }
  }

  async function approveAndIssueRequest(request: TransferRequestRow) {
    const items = request.items
      .map((item) => ({
        itemId: item.id,
        issuedQty: remainingQty(item),
      }))
      .filter((item) => item.issuedQty > 0);
    if (!items.length) {
      setStatusMessage({ type: "error", text: "Request ini tidak punya sisa qty untuk issue." });
      return;
    }

    setPosting(true);
    setCartStatus("posting");
    setMode("request_issue");
    setStatusMessage({ type: "info", text: `Approve & issue ${request.requestNo}...` });
    try {
      const approveResponse = await fetch(`/api/inventory/transfers/${request.id}/approve`, {
        method: "PATCH",
      });
      const approveJson = await approveResponse.json().catch(() => null);
      if (!approveResponse.ok) {
        throw new Error(approveJson?.error?.message ?? "Approve request gagal.");
      }

      const issueResponse = await fetch(`/api/inventory/transfers/${request.id}/issue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const issueJson = await issueResponse.json().catch(() => null);
      if (!issueResponse.ok) {
        throw new Error(issueJson?.error?.message ?? "Issue request gagal setelah approve.");
      }

      const status = issueJson?.data?.status ?? "issued";
      setLastDocumentNo(request.requestNo);
      setCartStatus("posted");
      setStatusMessage({
        type: "success",
        text: `Posted: ${request.requestNo}. Approve & issue selesai, status ${statusLabel(status)}.`,
      });
      await loadServerHistory();
    } catch (err) {
      setFailedCount((count) => count + 1);
      setCartStatus("failed");
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Approve & issue gagal.",
      });
    } finally {
      setPosting(false);
    }
  }

  function printReceiving(receiving: SupplierReceivingRow) {
    const popup = window.open("", "_blank", "width=420,height=680");
    if (!popup) {
      setStatusMessage({ type: "error", text: "Popup print diblokir browser." });
      return;
    }
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(receiving.code)}</title><style>
      @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}
      body{font-family:ui-monospace,Consolas,monospace;margin:0 auto;padding:0;width:72mm;color:#111}
      h1{font-size:15px;margin:0 0 4px;text-align:center} p{margin:3px 0;font-size:11px;line-height:1.35}
      .line{border-top:1px dashed #888;margin:8px 0}.total{font-weight:800;font-size:14px;text-align:right}.center{text-align:center}
    </style></head><body>
      <h1>GARAGE</h1>
      <p class="center">STRUK BARANG MASUK</p>
      <div class="line"></div>
      <p>No: ${escapeHtml(receiving.code)}</p>
      <p>Invoice: ${escapeHtml(receiving.invoiceNo ?? "-")}</p>
      <p>Supplier: ${escapeHtml(receiving.supplierName ?? "-")}</p>
      <p>Waktu: ${new Date(receiving.receivedAt).toLocaleString("id-ID")}</p>
      <div class="line"></div><p class="total">${rupiah.format(receiving.totalAmount)}</p>
      <div class="line"></div><p>Paraf Supplier:</p><br><p>Paraf Gudang:</p><br>
    </body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function printTransfer(request: TransferRequestRow) {
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup) {
      setStatusMessage({ type: "error", text: "Popup print diblokir browser." });
      return;
    }
    const itemRows = request.items
      .map((item) => {
        const qty = request.status === "issued" ? item.issuedQty : remainingQty(item);
        return `<tr><td>${escapeHtml(item.itemName)}</td><td style="text-align:right">${formatQty(qty)} ${escapeHtml(item.unit)}</td></tr>`;
      })
      .join("");
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(request.requestNo)}</title><style>
      @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}
      body{font-family:ui-monospace,Consolas,monospace;margin:0 auto;padding:0;width:72mm;color:#111}
      h1{font-size:15px;margin:0 0 4px;text-align:center} p{margin:3px 0;font-size:11px;line-height:1.35}
      table{width:100%;border-collapse:collapse;font-size:11px}td{padding:4px 0;border-bottom:1px dashed #ccc;vertical-align:top}
      .line{border-top:1px dashed #888;margin:8px 0}.badge{font-weight:800;text-transform:uppercase}.center{text-align:center}
    </style></head><body>
      <h1>GARAGE</h1>
      <p class="center">STRUK ISSUE OUTLET</p>
      <div class="line"></div>
      <p>No: ${escapeHtml(request.requestNo)}</p>
      <p>Status: <span class="badge">${statusLabel(request.status)}</span></p>
      <p>Outlet: ${escapeHtml(request.outletName ?? "-")}</p>
      <p>Area: ${request.station === "bar" ? "Bar" : "Dapur"}</p>
      <p>Waktu: ${new Date(request.issuedAt ?? request.createdAt).toLocaleString("id-ID")}</p>
      <div class="line"></div><table>${itemRows}</table>
      <div class="line"></div><p>Paraf Gudang:</p><br><p>Paraf Penerima:</p><br>
    </body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function downloadReceivingPdf(receiving: SupplierReceivingRow) {
    setReceivingPdfId(receiving.id);
    try {
      const response = await fetch(`/api/inventory/supplier-receivings/${receiving.id}/pdf`, { cache: "no-store" });
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
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Export PDF receiving gagal.",
      });
    } finally {
      setReceivingPdfId(null);
    }
  }

  async function downloadTransferPdf(request: TransferRequestRow) {
    setTransferPdfId(request.id);
    try {
      const response = await fetch(`/api/inventory/transfers/${request.id}/pdf`, { cache: "no-store" });
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
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Export PDF request gagal.",
      });
    } finally {
      setTransferPdfId(null);
    }
  }

  const modeLabel = mode === "supplier_receive" ? "Barang Masuk Supplier" : "Issue Request Outlet";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#34343c] bg-black/30 p-2">
        <button
          type="button"
          onClick={() => setMode("supplier_receive")}
          className={cn(
            "flex items-center gap-2 rounded px-3 py-2 text-xs font-bold transition",
            mode === "supplier_receive"
              ? "bg-[#22c55e] text-white"
              : "text-white/60 hover:bg-white/[0.05] hover:text-white",
          )}
        >
          <ShoppingCart className="size-4" />
          Barang Masuk Supplier
        </button>
        <button
          type="button"
          onClick={() => setMode("request_issue")}
          className={cn(
            "flex items-center gap-2 rounded px-3 py-2 text-xs font-bold transition",
            mode === "request_issue"
              ? "bg-[#3b82f6] text-white"
              : "text-white/60 hover:bg-white/[0.05] hover:text-white",
          )}
        >
          <Send className="size-4" />
          Issue Request Outlet
        </button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadServerHistory()}
          disabled={loadingFlows}
          className="ml-auto h-8 border-[#34343c] bg-black/20 text-xs"
        >
          <RefreshCw className={cn("mr-1 size-3.5", loadingFlows && "animate-spin")} />
          Sync
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded-md border border-[#34343c] bg-black/25 p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Mode aktif</p>
          <p className="mt-1 text-sm font-black text-white">{modeLabel}</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-black/25 p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Cart status</p>
          <p className={cn(
            "mt-1 text-sm font-black",
            cartStatus === "failed" ? "text-[#ffc2c8]" : cartStatus === "posted" ? "text-[#bbf7d0]" : "text-white",
          )}>
            {statusLabel(cartStatus)}
          </p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-black/25 p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Dokumen terakhir</p>
          <p className="mt-1 text-sm font-black text-[#bbf7d0]">{lastDocumentNo}</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-black/25 p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Posting gagal</p>
          <p className="mt-1 text-sm font-black text-[#ffc2c8]">{failedCount}</p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        <div className="rounded-md border border-[#34343c] bg-[#111318] p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Barang masuk hari ini</p>
          <p className="mt-1 text-lg font-black text-[#bbf7d0]">{todayReceivingCount}</p>
          <p className="text-[11px] text-white/45">{rupiah.format(dailyAudit?.receivingValue ?? todayReceivingValue)}</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-[#111318] p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Issue outlet hari ini</p>
          <p className="mt-1 text-lg font-black text-[#bfdbfe]">{todayIssuedCount}</p>
          <p className="text-[11px] text-white/45">{dailyAudit?.issuedItemCount ?? 0} item keluar</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-[#111318] p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Request aktif</p>
          <p className="mt-1 text-lg font-black text-[#ffd08a]">{activeIssueCount}</p>
          <p className="text-[11px] text-white/45">Approved / Partial</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-[#111318] p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Nilai stok Gudang</p>
          <p className="mt-1 text-lg font-black text-white">{rupiah.format(dailyAudit?.warehouseStockValue ?? 0)}</p>
          <p className="text-[11px] text-white/45">Audit hari ini</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-[#111318] p-3">
          <p className="garage-mono text-[10px] uppercase text-white/45">Low / Watch</p>
          <p className="mt-1 text-lg font-black text-[#ffc2c8]">{dailyAudit?.lowCount ?? 0} / {dailyAudit?.watchCount ?? 0}</p>
          <p className="text-[11px] text-white/45">Perlu dicek</p>
        </div>
      </div>

      {statusMessage ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border p-3 text-sm",
            statusMessage.type === "success" && "border-[#22c55e]/45 bg-[#22c55e]/10 text-[#bbf7d0]",
            statusMessage.type === "error" && "border-[#d11a2a]/45 bg-[#d11a2a]/10 text-[#ffc2c8]",
            statusMessage.type === "info" && "border-[#3b82f6]/45 bg-[#3b82f6]/10 text-[#bfdbfe]",
          )}
        >
          {statusMessage.type === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : null}
          {statusMessage.type === "error" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : null}
          {statusMessage.type === "info" ? <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin" /> : null}
          <span>{statusMessage.text}</span>
        </div>
      ) : null}

      {mode === "supplier_receive" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <Card className="garage-panel garage-animate-in">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <CardTitle>Pilih Bahan Baku</CardTitle>
                <CardDescription>Klik kartu untuk masukkan ke cart receiving supplier.</CardDescription>
              </div>
              <div className="relative w-64 max-w-full">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-white/40" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari nama / SKU"
                  className="h-9 border-[#34343c] bg-black/30 pl-7 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {categories.map((itemCategory) => (
                  <button
                    key={itemCategory}
                    type="button"
                    onClick={() => setCategory(itemCategory)}
                    className={cn(
                      "rounded px-2.5 py-1 text-[11px] font-semibold transition",
                      category === itemCategory
                        ? "bg-red-500/20 text-red-200 ring-1 ring-red-400/40"
                        : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white",
                    )}
                  >
                    {itemCategory}
                  </button>
                ))}
              </div>

              <div className="max-h-[520px] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredItems.map((item) => (
                    <button
                      type="button"
                      key={item.sku}
                      onClick={() => addToSupplierCart(item)}
                      className="garage-press group flex flex-col gap-1 rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-left transition hover:border-red-400/40 hover:bg-white/[0.07]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-bold text-white">{item.name}</p>
                        <Badge className="shrink-0 bg-emerald-500/15 px-1.5 py-0 text-[10px] text-emerald-200 ring-1 ring-emerald-400/30">
                          {item.onHand} {item.unit}
                        </Badge>
                      </div>
                      <p className="font-mono text-[10px] text-white/40">{item.sku}</p>
                      <p className="text-[11px] text-white/60">{item.category} - {item.packageSize}</p>
                      <p className="text-[11px] font-semibold text-amber-200">{rupiah.format(item.unitCost || 0)} / {item.unit}</p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Cart Barang Masuk</CardTitle>
              <CardDescription>{supplierCart.length} item / total {rupiah.format(supplierCartTotal)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {supplierCart.length === 0 ? (
                  <p className="rounded-md border border-dashed border-[#34343c] py-10 text-center text-sm text-white/40">
                    Cart receiving kosong.
                  </p>
                ) : (
                  supplierCart.map((line) => (
                    <div key={line.key} className="space-y-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{line.name}</p>
                          <p className="font-mono text-[10px] text-white/40">{line.sku} / stok {line.onHand} {line.unit}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => removeSupplierLine(line.key)} className="h-7 border-[#34343c] bg-black/20 px-2" aria-label="Hapus item">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => updateSupplierLine(line.key, { qty: Math.max(0, Number((line.qty - 1).toFixed(4))) })} className="h-8 w-8 border-[#34343c] bg-black/30 p-0">
                          <Minus className="size-3.5" />
                        </Button>
                        <Input
                          value={String(line.qty)}
                          onChange={(event) => {
                            const value = Number(event.target.value.replace(",", "."));
                            updateSupplierLine(line.key, { qty: Number.isFinite(value) ? value : 0 });
                          }}
                          className="h-8 w-20 border-[#34343c] bg-black/30 text-center text-sm"
                          inputMode="decimal"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => updateSupplierLine(line.key, { qty: Number((line.qty + 1).toFixed(4)) })} className="h-8 w-8 border-[#34343c] bg-black/30 p-0">
                          <Plus className="size-3.5" />
                        </Button>
                        <span className="text-xs text-white/50">{line.unit}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-white/60">Harga/unit</span>
                        <Input
                          value={line.unitCost ? String(line.unitCost) : ""}
                          onChange={(event) => {
                            const value = Number(event.target.value.replace(/[^\d]/g, ""));
                            updateSupplierLine(line.key, { unitCost: Number.isFinite(value) ? value : 0 });
                          }}
                          className="h-8 flex-1 border-[#34343c] bg-black/30 text-sm"
                          inputMode="numeric"
                          placeholder="0"
                        />
                        <span className="text-xs font-bold text-emerald-200">{rupiah.format(line.qty * line.unitCost)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border border-[#34343c] bg-black/30 px-3 py-2 text-sm">
                <span className="font-bold text-white/70">Total receiving</span>
                <span className="font-black text-white">{rupiah.format(supplierCartTotal)}</span>
              </div>
              <Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="Invoice no opsional" className="h-9 border-[#34343c] bg-black/30 text-sm" />
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Catatan receiving" className="h-9 border-[#34343c] bg-black/30 text-sm" />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-10 flex-1 border-[#34343c]" onClick={resetSupplierCart} disabled={!supplierCart.length || posting}>
                  Cancel
                </Button>
                <Button type="button" className="garage-press h-10 flex-[2] bg-[#22c55e] text-white" onClick={() => void postSupplierReceiving()} disabled={!supplierCart.length || posting}>
                  {posting ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <PackageCheck className="mr-2 size-4" />}
                  Posting Receiving
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <CardTitle>Request Siap Issue</CardTitle>
              <CardDescription>Pending bisa Approve & Issue cepat; Approved/Partial bisa issue manual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {requestedRequests.length > 0 ? (
                <div className="space-y-2 rounded-md border border-[#f5a742]/25 bg-[#f5a742]/8 p-2">
                  <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">Pending Approval</p>
                  {requestedRequests.slice(0, 5).map((request) => (
                    <div key={request.id} className="rounded-md border border-[#34343c] bg-black/25 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">{request.requestNo}</p>
                          <p className="text-xs text-white/50">
                            {request.outletName ?? "Outlet"} / {request.station === "bar" ? "Bar" : "Dapur"} / {request.items.length} item
                          </p>
                        </div>
                        <Badge className="bg-[#f5a742]/20 text-[#ffd08a]">{statusLabel(request.status)}</Badge>
                      </div>
                      <Button
                        type="button"
                        className="garage-press mt-2 h-8 w-full bg-[#f5a742] text-xs font-black text-black hover:bg-[#ffd08a]"
                        onClick={() => void approveAndIssueRequest(request)}
                        disabled={posting}
                      >
                        {posting ? <RefreshCw className="mr-1 size-3 animate-spin" /> : <CheckCheck className="mr-1 size-3" />}
                        Approve & Issue
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {transferRequests.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#34343c] py-10 text-center text-sm text-white/40">
                  Belum ada request approved/partial.
                </p>
              ) : (
                transferRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => {
                      setSelectedRequestId(request.id);
                      setCartStatus("draft");
                    }}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition",
                      selectedRequestId === request.id
                        ? "border-[#3b82f6]/65 bg-[#3b82f6]/14"
                        : "border-[#34343c] bg-white/[0.04] hover:bg-white/[0.07]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-white">{request.requestNo}</p>
                        <p className="text-xs text-white/50">
                          {request.outletName ?? "Outlet"} / {request.station === "bar" ? "Bar" : "Dapur"}
                        </p>
                      </div>
                      <Badge className={request.status === "partial" ? "bg-[#3b82f6]/20 text-[#bfdbfe]" : "bg-[#f5a742]/20 text-[#ffd08a]"}>
                        {statusLabel(request.status)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-white/60">{request.items.length} item / {dateTimeFmt.format(new Date(request.createdAt))}</p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="garage-panel garage-animate-in">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Issue Request Outlet</CardTitle>
                  <CardDescription>
                    {selectedRequest ? `${selectedRequest.requestNo} / ${selectedRequest.outletName ?? "Outlet"}` : "Pilih request untuk issue."}
                  </CardDescription>
                </div>
                {selectedRequest ? (
                  <div className="flex gap-1.5">
                    <Button type="button" variant="outline" size="sm" className="h-8 border-[#34343c] bg-black/20 text-xs" onClick={() => printTransfer(selectedRequest)}>
                      <Printer className="mr-1 size-3" />
                      Cetak
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 border-[#34343c] bg-black/20 text-xs" onClick={() => void downloadTransferPdf(selectedRequest)} disabled={transferPdfId === selectedRequest.id}>
                      {transferPdfId === selectedRequest.id ? <RefreshCw className="mr-1 size-3 animate-spin" /> : <FileText className="mr-1 size-3" />}
                      PDF
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedRequest ? (
                <p className="rounded-md border border-dashed border-[#34343c] py-10 text-center text-sm text-white/40">
                  Pilih request approved/partial dari kiri.
                </p>
              ) : (
                <>
                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {selectedRequest.items.map((item) => {
                      const remaining = remainingQty(item);
                      return (
                        <div key={item.id} className="grid gap-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3 sm:grid-cols-[1fr_120px] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-white">{item.itemName}</p>
                            <p className="text-xs text-white/55">
                              Request {formatQty(item.requestedQty)} {item.unit} / Issued {formatQty(item.issuedQty)} {item.unit} / Sisa {formatQty(remaining)} {item.unit}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={remaining}
                            step="any"
                            value={issueDraftValue(selectedRequest, item)}
                            onChange={(event) => setIssueDraftValue(selectedRequest.id, item.id, event.target.value)}
                            className="h-9 border-[#34343c] bg-black/30 text-sm"
                            disabled={remaining <= 0 || posting}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Catatan issue opsional" className="h-9 border-[#34343c] bg-black/30 text-sm" />
                  <Button type="button" className="garage-press h-10 w-full bg-[#3b82f6] text-white" onClick={() => void postRequestIssue()} disabled={posting}>
                    {posting ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                    Posting Issue {selectedRequest.requestNo}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="garage-panel garage-animate-in">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle>Receiving Terakhir</CardTitle>
              <CardDescription>Riwayat final dari server, bukan localStorage.</CardDescription>
            </div>
            <div className="relative">
              <p className="mb-1 garage-mono text-[10px] uppercase text-white/45">Filter Audit</p>
              <Search className="pointer-events-none absolute left-2 top-[calc(50%+10px)] size-3.5 -translate-y-1/2 text-white/40" />
              <Input
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="Filter audit: dokumen / invoice / supplier / SKU"
                className="h-9 border-[#34343c] bg-black/30 pl-7 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredReceivings.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#34343c] py-8 text-center text-sm text-white/40">
                Tidak ada receiving yang cocok.
              </p>
            ) : (
              filteredReceivings.slice(0, 8).map((receiving) => (
                <div key={receiving.id} className="grid gap-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3 sm:grid-cols-[1fr_120px]">
                  <div>
                    <p className="font-black text-white">{receiving.code}</p>
                    <p className="text-xs text-white/50">{receiving.invoiceNo ?? "Tanpa invoice"} / {dateTimeFmt.format(new Date(receiving.receivedAt))}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button type="button" variant="outline" className="h-7 border-[#34343c] bg-black/20 px-2 text-[10px]" onClick={() => printReceiving(receiving)}>
                        <Printer className="mr-1 size-3" />
                        Cetak
                      </Button>
                      <Button type="button" variant="outline" className="h-7 border-[#34343c] bg-black/20 px-2 text-[10px]" onClick={() => void downloadReceivingPdf(receiving)} disabled={receivingPdfId === receiving.id}>
                        {receivingPdfId === receiving.id ? <RefreshCw className="mr-1 size-3 animate-spin" /> : <FileText className="mr-1 size-3" />}
                        PDF
                      </Button>
                    </div>
                  </div>
                  <p className="text-right font-black text-[#bbf7d0]">{rupiah.format(receiving.totalAmount)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="garage-panel garage-animate-in">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle>Request Outlet Terakhir</CardTitle>
              <CardDescription>Status server: Approved, Partial, Issued.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "requested", "approved", "partial", "issued"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setHistoryStatus(status)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-semibold transition",
                    historyStatus === status
                      ? "bg-[#3b82f6]/20 text-[#bfdbfe] ring-1 ring-[#3b82f6]/40"
                      : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white",
                  )}
                >
                  {status === "all" ? "Semua" : statusLabel(status)}
                </button>
              ))}
              {(["all", "dapur", "bar"] as const).map((station) => (
                <button
                  key={station}
                  type="button"
                  onClick={() => setHistoryStation(station)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-semibold transition",
                    historyStation === station
                      ? "bg-red-500/20 text-red-200 ring-1 ring-red-400/40"
                      : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white",
                  )}
                >
                  {station === "all" ? "Semua Area" : station === "bar" ? "Bar" : "Dapur"}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredRequestHistory.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#34343c] py-8 text-center text-sm text-white/40">
                Tidak ada request yang cocok.
              </p>
            ) : (
              filteredRequestHistory.slice(0, 8).map((request) => (
                <div key={request.id} className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-white">{request.requestNo}</p>
                      <p className="text-xs text-white/50">{request.outletName ?? "Outlet"} / {request.station === "bar" ? "Bar" : "Dapur"}</p>
                    </div>
                    <Badge className={request.status === "partial" ? "bg-[#3b82f6]/20 text-[#bfdbfe]" : "bg-[#f5a742]/20 text-[#ffd08a]"}>
                      {statusLabel(request.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button type="button" variant="outline" className="h-7 border-[#34343c] bg-black/20 px-2 text-[10px]" onClick={() => printTransfer(request)}>
                      <Printer className="mr-1 size-3" />
                      Cetak
                    </Button>
                    <Button type="button" variant="outline" className="h-7 border-[#34343c] bg-black/20 px-2 text-[10px]" onClick={() => void downloadTransferPdf(request)} disabled={transferPdfId === request.id}>
                      {transferPdfId === request.id ? <RefreshCw className="mr-1 size-3 animate-spin" /> : <FileText className="mr-1 size-3" />}
                      PDF
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </section>
  );
}
