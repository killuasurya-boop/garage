"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

type Anomaly = {
  metric: "revenue" | "expense";
  todayValue: number;
  avg7dValue: number;
  deviationPct: number;
  severity: "info" | "watch" | "critical";
  message: string;
};

type Response = {
  generatedAt: string;
  anomalies: Anomaly[];
  criticalCount: number;
  watchCount: number;
};

const SEVERITY_STYLE = {
  critical: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ff8a93]",
  watch: "border-[#f5a742]/40 bg-[#f5a742]/12 text-[#ffd08a]",
  info: "border-[#34343c] bg-[#0f0f14] text-[#d6d6dc]",
} as const;

export function FinanceAnomalyPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<Response>("/api/finance/anomalies", { cache: "no-store" });
      setData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat anomali.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-[#ffd08a]" />
              Anomali harian
            </CardTitle>
            <CardDescription className="text-xs text-[#b8b8bf]">
              Deviasi revenue & expense hari ini vs rata-rata 7 hari.
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
      <CardContent className="space-y-2">
        {error ? (
          <div className="rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 p-2 text-xs text-[#ff8a93]">
            {error}
          </div>
        ) : null}
        {data?.anomalies.map((a) => {
          const positive = a.deviationPct >= 0;
          const Icon = positive ? TrendingUp : TrendingDown;
          return (
            <div
              key={a.metric}
              className={`rounded-md border p-3 ${SEVERITY_STYLE[a.severity]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="garage-mono text-[10px] uppercase text-[#b8b8bf]">
                    {a.metric === "revenue" ? "Revenue" : "Expense"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    Rp{a.todayValue.toLocaleString("id-ID")}
                  </p>
                  <p className="garage-mono text-[10px] text-[#8f8f99]">
                    Avg 7d: Rp{a.avg7dValue.toLocaleString("id-ID")}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="garage-mono text-sm font-black">
                    {a.deviationPct > 0 ? "+" : ""}
                    {a.deviationPct}%
                  </span>
                </div>
              </div>
              <p className="mt-1 text-[11px] leading-4">{a.message}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
