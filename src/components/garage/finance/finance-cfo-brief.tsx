"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RefreshCw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currency } from "@/lib/garage-data";
import { garageApi } from "@/lib/api-client";
import type { FinanceBrief } from "@/lib/finance-types";

const statusClass: Record<string, string> = {
  healthy: "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#86efac]",
  watch: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd79a]",
  critical: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
};

export function FinanceCfoBrief() {
  const [brief, setBrief] = useState<FinanceBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<FinanceBrief>("/api/finance/brief", { cache: "no-store" });
      setBrief(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat finance brief.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await garageApi.get<FinanceBrief>("/api/finance/brief", { cache: "no-store" });
        if (!cancelled) setBrief(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat finance brief.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!brief && loading) {
    return (
      <Card className="garage-panel">
        <CardContent className="py-6 text-center text-sm text-[#8f8f99]">
          Memuat CFO brief…
        </CardContent>
      </Card>
    );
  }

  if (!brief) return null;

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-[#f5a742]" />
              Finance Brief Harian
            </CardTitle>
            <CardDescription>
              Ringkasan owner: omzet, laba, kas, guard score, dan aksi prioritas hari ini.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusClass[brief.guard.level] ?? statusClass.watch}>
              {brief.guard.level} · {brief.guard.healthScore}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="garage-press h-9 border-[#4a4a54] text-white"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-[#ffc2c8]">{error}</p> : null}
        <p className="text-sm text-[#d6d6dc]">{brief.guard.brief}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[#34343c] bg-[#17171d] p-3">
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">Omzet</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums text-white">
              {currency.format(brief.headline.revenue)}
            </p>
            <p className="text-[10px] text-[#8f8f99]">{brief.headline.orderCount} order</p>
          </div>
          <div className="rounded-md border border-[#34343c] bg-[#17171d] p-3">
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">Net profit</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums text-white">
              {currency.format(brief.headline.netProfit)}
            </p>
            <p className="text-[10px] text-[#8f8f99]">
              Gross {currency.format(brief.headline.grossProfit)}
            </p>
          </div>
          <div className="rounded-md border border-[#34343c] bg-[#17171d] p-3">
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">Kas cash</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums text-[#86efac]">
              {currency.format(brief.headline.cashCollected)}
            </p>
            <p className="text-[10px] text-[#8f8f99]">
              Non-cash {currency.format(brief.headline.nonCashCollected)}
            </p>
          </div>
          <div className="rounded-md border border-[#34343c] bg-[#17171d] p-3">
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">Closing</p>
            <p className="mt-1 text-lg font-bold text-white">{brief.closingProgress}%</p>
            <p className="text-[10px] text-[#8f8f99]">
              Food cost {brief.headline.foodCostRatio}%
              {brief.bomCoverage ? ` · BOM ${brief.bomCoverage.coveragePct}%` : ""}
            </p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="garage-surface rounded-md p-3">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="size-4 text-[#f5a742]" />
              <p className="text-sm font-semibold text-white">Risiko utama</p>
            </div>
            <ul className="space-y-2">
              {(brief.risks.length ? brief.risks : [{ area: "—", level: "healthy", message: "Tidak ada risiko kritis." }]).map(
                (risk) => (
                  <li key={`${risk.area}-${risk.message}`} className="text-xs text-[#b8b8bf]">
                    <span className="font-semibold text-white">{risk.area}:</span> {risk.message}
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="garage-surface rounded-md p-3">
            <p className="mb-2 text-sm font-semibold text-white">Aksi prioritas</p>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-[#d6d6dc]">
              {brief.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
