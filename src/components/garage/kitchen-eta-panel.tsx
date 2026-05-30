"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, RefreshCw, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

type EtaTicket = {
  id: string;
  ticketNo: string;
  station: string;
  status: string;
  channel: string;
  tableLabel: string;
  queuePosition: number;
  etaMinutes: number;
  etaAt: string;
  basis: "history" | "target";
};

type EtaStation = {
  station: string;
  avgMinutes: number;
  sampleSize: number;
  activeCount: number;
};

type KitchenEtaResponse = {
  windowDays: number;
  generatedAt: string;
  stations: EtaStation[];
  tickets: EtaTicket[];
};

function toneFor(minutes: number, status: string): string {
  if (status === "cooking" && minutes <= 2) return "text-[#bbf7d0]";
  if (minutes <= 5) return "text-[#bbf7d0]";
  if (minutes <= 12) return "text-[#ffd08a]";
  return "text-[#ff8a93]";
}

export function KitchenEtaPanel({ refreshKey }: { refreshKey?: unknown }) {
  const [data, setData] = useState<KitchenEtaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<KitchenEtaResponse>("/api/kitchen/eta?days=7", {
        cache: "no-store",
      });
      setData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat ETA dapur.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial + refresh-key fetch
    void load();
  }, [load, refreshKey]);

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4 text-[#ffd08a]" />
              Smart ETA dapur
            </CardTitle>
            <CardDescription className="text-xs text-[#b8b8bf]">
              Estimasi tiket siap berdasarkan rata-rata {data?.windowDays ?? 7} hari per station.
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

        {data && data.stations.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {data.stations.map((st) => (
              <div
                key={st.station}
                className="rounded-md border border-[#34343c] bg-[#0f0f14] p-2"
              >
                <p className="garage-mono text-[9px] uppercase text-[#b8b8bf]">{st.station}</p>
                <p className="mt-1 text-lg font-black text-white">
                  {st.avgMinutes}
                  <span className="ml-0.5 text-[10px] text-[#8f8f99]">m avg</span>
                </p>
                <p className="garage-mono mt-0.5 text-[9px] text-[#8f8f99]">
                  {st.activeCount} aktif · n={st.sampleSize}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="garage-scroll max-h-[360px] space-y-1.5 pr-1">
          {data && data.tickets.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-[#34343c] bg-black/20 p-3 text-xs text-[#b8b8bf]">
              <Clock className="h-4 w-4 text-[#22c55e]" />
              Antrian dapur kosong.
            </div>
          ) : null}

          {data?.tickets.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#0f0f14] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="garage-mono text-[11px] font-bold text-white">
                    {t.ticketNo}
                  </span>
                  <span className="garage-mono text-[9px] uppercase text-[#8f8f99]">
                    {t.station} · {t.tableLabel}
                  </span>
                </div>
                <p className="garage-mono mt-0.5 text-[9px] text-[#8f8f99]">
                  {t.status} · #{t.queuePosition + 1} antrian · basis {t.basis}
                </p>
              </div>
              <div className="text-right">
                <p className={`garage-mono text-base font-black ${toneFor(t.etaMinutes, t.status)}`}>
                  {t.etaMinutes}m
                </p>
                <p className="garage-mono text-[9px] text-[#8f8f99]">
                  {new Date(t.etaAt).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
