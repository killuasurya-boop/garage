"use client";

import { Ban, Loader2, PackageX } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import type { MenuItem } from "@/lib/garage-api-types";
import { productionStationFor, type ProductionStation } from "@/lib/garage-production-rules";

/**
 * Bar/Dapur menandai menu HABIS langsung dari Production Hub (dulu hanya kasir
 * lewat POS). Hanya menu di station akun ini; terkunci di POS & menu digital.
 */
export function ProductionSoldOutDialog({
  menuItems,
  stations,
}: {
  menuItems: MenuItem[];
  /** Station yang boleh diatur akun ini (Owner/Manajer: semua). */
  stations: ProductionStation[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menuItems
      .filter((item) => item.status !== "archived")
      .filter((item) => stations.includes(productionStationFor({ station: item.station ?? null, category: item.category })))
      .filter((item) => (q ? item.name.toLowerCase().includes(q) : true));
  }, [menuItems, query, stations]);

  const isSoldOut = (item: MenuItem) => overrides[item.id] ?? item.stock === "sold_out";
  const soldOutCount = items.filter(isSoldOut).length;

  async function toggle(item: MenuItem) {
    const next = !isSoldOut(item);
    setPendingId(item.id);
    setError(null);
    try {
      await garageApi.patch(`/api/menu/${encodeURIComponent(item.id)}`, { stock: next ? "sold_out" : "ready" });
      setOverrides((current) => ({ ...current, [item.id]: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah stok menu.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="garage-press h-10 border-[#d11a2a]/50 bg-[#d11a2a]/10 px-3 text-xs font-bold text-[#ffc2c8]"
        onClick={() => setOpen(true)}
      >
        <PackageX className="mr-1.5 size-4" />
        Stok Habis{soldOutCount ? ` (${soldOutCount})` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Atur Stok Habis</DialogTitle>
            <DialogDescription className="text-[#c4c4cc]">
              Ketuk menu yang bahannya habis. Menu HABIS terkunci di POS kasir &amp; menu digital QR sampai
              ditandai tersedia lagi.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari menu..."
            aria-label="Cari menu"
            className="h-10 border-[#34343c] bg-white/[0.06]"
          />
          {error ? (
            <p role="alert" className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc9cb]">
              {error}
            </p>
          ) : null}
          <div className="garage-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {items.length ? (
              items.map((item) => {
                const soldOut = isSoldOut(item);
                const pending = pendingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={pending}
                    onClick={() => void toggle(item)}
                    className={`garage-press flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition disabled:opacity-70 ${
                      soldOut ? "border-[#d11a2a]/55 bg-[#d11a2a]/14" : "border-[#34343c] bg-white/[0.04] hover:bg-white/[0.07]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{item.name}</span>
                      <span className="block truncate text-[11px] text-[#b8b8bf]">{item.category}</span>
                    </span>
                    {pending ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-[#ffd08a]" />
                    ) : soldOut ? (
                      <Badge className="shrink-0 border-[#d11a2a]/55 bg-[#d11a2a]/22 px-2 text-[10px] font-extrabold text-[#ffe1e5]">
                        <Ban className="mr-1 size-3" />
                        HABIS
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 border-[#4a4a54] bg-white/[0.08] px-2 text-[10px] text-[#d6d6dc]">
                        Tersedia
                      </Badge>
                    )}
                  </button>
                );
              })
            ) : (
              <p className="py-6 text-center text-sm text-[#a1a1aa]">Tidak ada menu di station ini.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
