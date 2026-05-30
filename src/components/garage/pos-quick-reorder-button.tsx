"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { garageApi, GarageApiError } from "@/lib/api-client";

export type QuickReorderItem = {
  menuItemId: string | null;
  variantId: string;
  itemName: string;
  variantLabel: string;
  unitPrice: number;
  qty: number;
};

type QuickReorderResponse = {
  order: { id: string; orderNo: string; total: number; createdAt: string } | null;
  items: QuickReorderItem[];
};

export function PosQuickReorderButton({
  customerId,
  phone,
  onLoaded,
}: {
  customerId?: string;
  phone?: string;
  onLoaded?: (items: QuickReorderItem[], orderNo: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOrderNo, setLastOrderNo] = useState<string | null>(null);

  const handleClick = async () => {
    if (!customerId && !phone) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (customerId) qs.set("customerId", customerId);
      else if (phone) qs.set("phone", phone);
      const res = await garageApi.get<QuickReorderResponse>(
        `/api/pos/quick-reorder?${qs.toString()}`,
        { cache: "no-store" },
      );
      if (!res.order || res.items.length === 0) {
        setError("Tidak ada order terakhir.");
        return;
      }
      setLastOrderNo(res.order.orderNo);
      onLoaded?.(res.items, res.order.orderNo);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat order terakhir.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="garage-press h-8 w-full border-[#ffd08a]/40 bg-[#ffd08a]/10 text-[11px] font-bold text-[#ffd08a] hover:bg-[#ffd08a]/20"
        onClick={() => void handleClick()}
        disabled={loading || (!customerId && !phone)}
      >
        <Repeat className="mr-1 h-3 w-3" />
        {loading ? "Memuat…" : "Ulangi pesanan terakhir"}
      </Button>
      {error ? <p className="text-[10px] text-[#ff8a93]">{error}</p> : null}
      {lastOrderNo && !error ? (
        <p className="garage-mono text-[10px] text-[#8f8f99]">Dimuat dari {lastOrderNo}.</p>
      ) : null}
    </div>
  );
}
