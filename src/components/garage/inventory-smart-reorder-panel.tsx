"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, PackageCheck, RefreshCw, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

type Suggestion = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  packageSize: string;
  onHand: number;
  min: number;
  status: string;
  dailyConsumption: number;
  daysUntilEmpty: number | null;
  suggestedReorderQty: number;
  supplierOrderQty: number;
  supplierOrderValue: number;
  reorderTarget: number;
  warehouseBufferQty: number;
  riskLevel: "critical" | "watch" | "safe";
  reason: string;
};

type SmartReorderResponse = {
  windowDays: number;
  generatedAt: string;
  totalItems: number;
  criticalCount: number;
  watchCount: number;
  suggestions: Suggestion[];
};

const RISK_STYLE: Record<Suggestion["riskLevel"], { badge: string; dot: string; label: string }> = {
  critical: {
    badge: "border-[#d11a2a]/40 bg-[#d11a2a]/15 text-[#ff8a93]",
    dot: "bg-[#d11a2a]",
    label: "Critical",
  },
  watch: {
    badge: "border-[#f5a742]/40 bg-[#f5a742]/15 text-[#ffd08a]",
    dot: "bg-[#f5a742]",
    label: "Watch",
  },
  safe: {
    badge: "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#bbf7d0]",
    dot: "bg-[#22c55e]",
    label: "Safe",
  },
};

function formatQty(qty: number) {
  if (Number.isInteger(qty)) return qty.toString();
  return qty.toFixed(qty < 1 ? 3 : 2);
}

export function InventorySmartReorderPanel({
  onAddSupplierOrder,
}: {
  onAddSupplierOrder?: (items: Suggestion[]) => void;
}) {
  const [data, setData] = useState<SmartReorderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSafe, setShowSafe] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<SmartReorderResponse>(
        "/api/inventory/smart-reorder?days=14",
        { cache: "no-store" },
      );
      setData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat saran reorder.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const visible = data?.suggestions.filter((s) => showSafe || s.riskLevel !== "safe") ?? [];

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4 text-[#ffd08a]" />
              Smart reorder supplier
            </CardTitle>
            <CardDescription className="text-xs text-[#b8b8bf]">
              Saran belanja supplier untuk stok Gudang pusat dari konsumsi {data?.windowDays ?? 14} hari terakhir.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="garage-press h-7 border-[#4a4a54] px-2 text-[10px]"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data ? (
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-md border border-[#d11a2a]/30 bg-[#d11a2a]/10 p-2">
              <p className="garage-mono text-[9px] uppercase text-[#ff8a93]">Critical</p>
              <p className="mt-1 text-lg font-black text-white">{data.criticalCount}</p>
            </div>
            <div className="rounded-md border border-[#f5a742]/30 bg-[#f5a742]/10 p-2">
              <p className="garage-mono text-[9px] uppercase text-[#ffd08a]">Watch</p>
              <p className="mt-1 text-lg font-black text-white">{data.watchCount}</p>
            </div>
            <div className="rounded-md border border-[#34343c] bg-[#0f0f14] p-2">
              <p className="garage-mono text-[9px] uppercase text-[#b8b8bf]">Total SKU</p>
              <p className="mt-1 text-lg font-black text-white">{data.totalItems}</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 p-2 text-xs text-[#ff8a93]">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="garage-mono text-[10px] uppercase text-[#8f8f99]">
            {visible.length} item{visible.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            {onAddSupplierOrder ? (
              <button
                type="button"
                onClick={() => onAddSupplierOrder(visible.filter((s) => s.supplierOrderQty > 0))}
                className="garage-mono text-[10px] uppercase text-[#ffd08a] hover:text-white"
              >
                Masuk cart
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowSafe((v) => !v)}
              className="garage-mono text-[10px] uppercase text-[#b8b8bf] hover:text-white"
            >
              {showSafe ? "Sembunyikan aman" : "Tampilkan semua"}
            </button>
          </div>
        </div>

        <div className="garage-scroll max-h-[420px] space-y-2 pr-1">
          {visible.length === 0 && !loading ? (
            <div className="flex items-center gap-2 rounded-md border border-[#34343c] bg-black/20 p-3 text-xs text-[#b8b8bf]">
              <PackageCheck className="h-4 w-4 text-[#22c55e]" />
              Tidak ada item yang perlu reorder. Mantap.
            </div>
          ) : null}

          {visible.map((s) => {
            const style = RISK_STYLE[s.riskLevel];
            return (
              <div
                key={s.sku}
                className="rounded-md border border-[#34343c] bg-[#0f0f14] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      <p className="truncate text-sm font-semibold text-white">{s.name}</p>
                    </div>
                    <p className="garage-mono mt-0.5 text-[10px] text-[#8f8f99]">
                      {s.sku} - {s.category} - {s.packageSize}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="garage-mono text-[9px] uppercase text-[#8f8f99]">On-hand</p>
                    <p className="garage-mono mt-0.5 text-white">
                      {formatQty(s.onHand)} {s.unit}
                    </p>
                  </div>
                  <div>
                    <p className="garage-mono text-[9px] uppercase text-[#8f8f99]">Pakai/hari</p>
                    <p className="garage-mono mt-0.5 text-white">
                      {formatQty(s.dailyConsumption)} {s.unit}
                    </p>
                  </div>
                  <div>
                    <p className="garage-mono text-[9px] uppercase text-[#8f8f99]">Habis</p>
                    <p className="garage-mono mt-0.5 text-white">
                      {s.daysUntilEmpty === null ? "-" : `${s.daysUntilEmpty}h`}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-start gap-2 rounded-md border border-[#34343c] bg-black/30 p-2 text-[11px] text-[#d6d6dc]">
                  {s.riskLevel === "critical" ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ff8a93]" />
                  ) : null}
                  <span className="flex-1">{s.reason}</span>
                </div>

                {s.supplierOrderQty > 0 ? (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-[#ffd08a]/30 bg-[#ffd08a]/10 p-2">
                    <div>
                      <span className="garage-mono text-[10px] uppercase text-[#ffd08a]">
                        Order supplier
                      </span>
                      <p className="mt-0.5 text-[10px] text-[#b8b8bf]">
                        Target {formatQty(s.reorderTarget)} {s.unit}, buffer {formatQty(s.warehouseBufferQty)} {s.unit}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="garage-mono text-sm font-black text-white">
                        {formatQty(s.supplierOrderQty)} {s.unit}
                      </span>
                      <p className="mt-0.5 text-[10px] text-[#bbf7d0]">
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          maximumFractionDigits: 0,
                        }).format(s.supplierOrderValue)}
                      </p>
                    </div>
                    {onAddSupplierOrder ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press h-8 shrink-0 border-[#ffd08a]/45 bg-[#ffd08a]/10 px-2 text-[10px] text-[#ffd08a]"
                        onClick={() => onAddSupplierOrder([s])}
                      >
                        <ShoppingCart className="mr-1 h-3 w-3" />
                        Cart
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
