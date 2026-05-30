"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCheck, RefreshCw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { garageApi } from "@/lib/api-client";
import type { FinanceClosingReadiness } from "@/lib/finance-types";

export function FinanceClosingPanel({ onRefreshOverview }: { onRefreshOverview?: () => void }) {
  const [data, setData] = useState<FinanceClosingReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<FinanceClosingReadiness>(
        "/api/finance/closing-readiness",
        { cache: "no-store" },
      );
      setData(res);
      onRefreshOverview?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat closing readiness.");
    } finally {
      setLoading(false);
    }
  }, [onRefreshOverview]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await garageApi.get<FinanceClosingReadiness>(
          "/api/finance/closing-readiness",
          { cache: "no-store" },
        );
        if (!cancelled) {
          setData(res);
          onRefreshOverview?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat closing readiness.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onRefreshOverview]);

  return (
    <Card className="garage-panel garage-animate-in border-[#f5a742]/35">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4 text-[#f5a742]" />
              Closing Hari Ini
            </CardTitle>
            <CardDescription>
              Checklist server-backed: shift, settlement, expense, export — sinkron dengan Finance Guard.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="garage-press h-9 border-[#4a4a54] text-white"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-[#ffc2c8]">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <Progress value={data?.progressPct ?? 0} className="h-2 flex-1 bg-[#25252d]" />
          <span className="font-mono text-sm font-bold text-white">
            {data?.completed ?? 0}/{data?.total ?? 4}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.steps ?? []).map((step) => (
            <div
              key={step.id}
              className={`rounded-md border p-3 ${
                step.done
                  ? "border-[#22c55e]/55 bg-[#22c55e]/12"
                  : "border-[#34343c] bg-[#111116]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{step.label}</p>
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-md border ${
                    step.done
                      ? "border-[#22c55e]/60 bg-[#22c55e] text-black"
                      : "border-[#4a4a54] text-[#888]"
                  }`}
                >
                  {step.done ? <Check className="size-3.5" /> : <Square className="size-3" />}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#b8b8bf]">{step.detail}</p>
            </div>
          ))}
        </div>
        {data?.ready ? (
          <p className="text-xs text-[#86efac]">
            Siap export final — semua langkah closing hari ini terpenuhi.
          </p>
        ) : data?.shiftNeedsClosing ? (
          <p className="text-xs text-[#ffd79a]">
            {data.openSessionCount} shift masih open — tutup shift kasir sebelum export final.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
