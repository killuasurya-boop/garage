"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

type Segment = "new" | "loyal" | "sleeping" | "active";

type Row = {
  customerId: string;
  name: string;
  phone: string;
  tier: string;
  visits: number;
  segment: Segment;
  lastOrderAt: string | null;
  daysSinceLast: number | null;
  spend60d: number;
};

type Response = {
  generatedAt: string;
  breakdown: Record<Segment, number>;
  rows: Row[];
};

const SEGMENT_STYLE: Record<Segment, { label: string; badge: string }> = {
  loyal: { label: "Loyal", badge: "border-[#ffd08a]/40 bg-[#ffd08a]/10 text-[#ffd08a]" },
  active: { label: "Aktif", badge: "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#bbf7d0]" },
  new: { label: "Baru", badge: "border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#bfdbfe]" },
  sleeping: { label: "Tidur", badge: "border-[#d11a2a]/40 bg-[#d11a2a]/15 text-[#ff8a93]" },
};

export function CrmAutoSegmentsPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Segment | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<Response>("/api/crm/segments-auto", { cache: "no-store" });
      setData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat segmen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const visible = data?.rows.filter((r) => filter === "all" || r.segment === filter) ?? [];

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-[#ffd08a]" />
              Auto-segmentasi pelanggan
            </CardTitle>
            <CardDescription className="text-xs text-[#b8b8bf]">
              Tag otomatis dari frekuensi & last order.
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
        {error ? (
          <div className="rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 p-2 text-xs text-[#ff8a93]">
            {error}
          </div>
        ) : null}

        {data ? (
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(SEGMENT_STYLE) as Segment[]).map((seg) => {
              const style = SEGMENT_STYLE[seg];
              const active = filter === seg;
              return (
                <button
                  key={seg}
                  type="button"
                  onClick={() => setFilter(active ? "all" : seg)}
                  className={`rounded-md border p-2 text-left transition ${
                    active ? style.badge : "border-[#34343c] bg-[#0f0f14] hover:border-[#4a4a54]"
                  }`}
                >
                  <p className="garage-mono text-[9px] uppercase text-[#b8b8bf]">{style.label}</p>
                  <p className="mt-1 text-lg font-black text-white">{data.breakdown[seg]}</p>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="garage-scroll max-h-[380px] space-y-1.5 pr-1">
          {visible.length === 0 && !loading ? (
            <p className="garage-mono text-[10px] text-[#8f8f99]">Tidak ada pelanggan di segmen ini.</p>
          ) : null}
          {visible.slice(0, 80).map((r) => {
            const style = SEGMENT_STYLE[r.segment];
            return (
              <div
                key={r.customerId}
                className="flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#0f0f14] px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12px] font-semibold text-white">{r.name}</p>
                    <span className="garage-mono text-[9px] text-[#8f8f99]">{r.tier}</span>
                  </div>
                  <p className="garage-mono text-[9px] text-[#8f8f99]">
                    {r.phone} · {r.visits} kunjungan ·{" "}
                    {r.daysSinceLast === null ? "—" : `${r.daysSinceLast}h lalu`} ·{" "}
                    Rp{r.spend60d.toLocaleString("id-ID")} (60d)
                  </p>
                </div>
                <span
                  className={`garage-mono shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${style.badge}`}
                >
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
