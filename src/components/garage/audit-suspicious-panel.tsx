"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

type Flag = {
  kind: "excess_void" | "excess_manual_discount" | "unmatched_stock_out";
  severity: "watch" | "critical";
  actor: string | null;
  count: number;
  details: string;
};

type Response = {
  generatedAt: string;
  windowHours: number;
  flags: Flag[];
  criticalCount: number;
};

const KIND_LABEL: Record<Flag["kind"], string> = {
  excess_void: "Void berlebihan",
  excess_manual_discount: "Diskon manual berlebihan",
  unmatched_stock_out: "Stok turun non-resep",
};

export function AuditSuspiciousPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<Response>("/api/audit/suspicious?hours=24", {
        cache: "no-store",
      });
      setData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat flag.");
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
              <ShieldAlert className="h-4 w-4 text-[#ff8a93]" />
              Suspicious activity
            </CardTitle>
            <CardDescription className="text-xs text-[#b8b8bf]">
              Auto-flag {data?.windowHours ?? 24} jam terakhir: void, diskon manual, stok manual.
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
        {data && data.flags.length === 0 && !loading ? (
          <div className="rounded-md border border-[#22c55e]/30 bg-[#22c55e]/10 p-3 text-xs text-[#bbf7d0]">
            Tidak ada aktivitas mencurigakan. Aman.
          </div>
        ) : null}
        {data?.flags.map((f, idx) => (
          <div
            key={`${f.kind}-${f.actor ?? "system"}-${idx}`}
            className={`rounded-md border p-3 ${
              f.severity === "critical"
                ? "border-[#d11a2a]/45 bg-[#d11a2a]/12"
                : "border-[#f5a742]/40 bg-[#f5a742]/12"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{KIND_LABEL[f.kind]}</p>
                <p className="garage-mono text-[10px] text-[#b8b8bf]">
                  {f.actor ?? "—"} · {f.count}x
                </p>
                <p className="mt-1 text-[11px] text-[#d6d6dc]">{f.details}</p>
              </div>
              <span
                className={`garage-mono shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                  f.severity === "critical"
                    ? "border-[#d11a2a]/50 bg-[#d11a2a]/20 text-[#ff8a93]"
                    : "border-[#f5a742]/50 bg-[#f5a742]/20 text-[#ffd08a]"
                }`}
              >
                {f.severity}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
