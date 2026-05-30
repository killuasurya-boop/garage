"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

type Suggestion = {
  menuItemId: string;
  itemName: string;
  pairCount: number;
  totalOrders: number;
  confidence: number;
};

type UpsellResponse = {
  menuItemId: string;
  anchorOrders: number;
  suggestions: Suggestion[];
};

export function PosUpsellPanel({ menuItemId }: { menuItemId: string | null }) {
  const [data, setData] = useState<UpsellResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<UpsellResponse>(
        `/api/pos/upsell?menuItemId=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      setData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat upsell.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!menuItemId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear on prop unset
      setData(null);
      return;
    }
    void load(menuItemId);
  }, [menuItemId, load]);

  if (!menuItemId) return null;

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-[#ffd08a]" />
          Sering dibeli bareng
        </CardTitle>
        <CardDescription className="text-[11px] text-[#b8b8bf]">
          Dari {data?.anchorOrders ?? 0} order 30 hari terakhir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <p className="garage-mono text-[10px] text-[#8f8f99]">Memuat…</p>
        ) : null}
        {error ? (
          <p className="text-[11px] text-[#ff8a93]">{error}</p>
        ) : null}
        {data && data.suggestions.length === 0 && !loading ? (
          <p className="garage-mono text-[10px] text-[#8f8f99]">
            Belum ada pola pairing untuk item ini.
          </p>
        ) : null}
        {data?.suggestions.map((s) => (
          <div
            key={s.menuItemId}
            className="flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#0f0f14] px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{s.itemName}</p>
              <p className="garage-mono text-[9px] text-[#8f8f99]">
                {s.pairCount}x · {s.confidence}% confidence
              </p>
            </div>
            <span className="garage-mono shrink-0 rounded-full border border-[#ffd08a]/30 bg-[#ffd08a]/10 px-2 py-0.5 text-[9px] font-bold uppercase text-[#ffd08a]">
              {s.confidence}%
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
