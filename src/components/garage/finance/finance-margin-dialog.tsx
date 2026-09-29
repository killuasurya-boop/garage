"use client";

import { useCallback, useEffect, useState } from "react";
import { ChefHat, RefreshCw } from "lucide-react";
import { currency } from "@/lib/garage-data";
import { garageApi } from "@/lib/api-client";
import { GarageEmpty } from "@/components/garage/garage-state-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MarginRow = {
  menuItemId: string;
  menuName: string;
  category: string;
  variantId: string;
  variantLabel: string;
  price: number;
  recipeCost: number;
  margin: number;
  marginPct: number;
  ingredients: number;
};

/**
 * Dialog laporan margin per varian (recipe cost vs sale price). Mengelola fetch
 * sendiri; parent hanya mengontrol `open`.
 */
export function FinanceMarginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<MarginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refresh manual (tombol) — boleh setState sinkron karena dipanggil dari onClick.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<{ rows: MarginRow[] }>(
        "/api/finance/recipes/margin",
      );
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat margin report.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch saat dibuka — inline, setState hanya setelah await (hindari cascading render).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await garageApi.get<{ rows: MarginRow[] }>(
          "/api/finance/recipes/margin",
        );
        if (!cancelled) {
          setRows(data.rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Gagal memuat margin report.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const avgMargin = rows.length
    ? Math.round(rows.reduce((sum, r) => sum + r.marginPct, 0) / rows.length)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Margin Menu</DialogTitle>
          <DialogDescription>
            Recipe cost vs sale price per varian. Diurutkan dari margin terkecil
            (rugi/tipis di atas) supaya cepat spot item yang perlu kenaikan harga
            atau pengganti bahan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[#b8b8bf]">
            {rows.length} varian · margin avg{" "}
            <span className="garage-mono text-[#ffd08a]">{avgMargin}%</span>
          </p>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error ? (
          <p className="text-xs text-[#ffc2c8]">{error}</p>
        ) : null}

        <div className="garage-scroll min-h-0 flex-1 overflow-auto rounded-md border border-[#34343c] bg-black/10">
          {loading && rows.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#8f8f99]">
              Menghitung margin...
            </p>
          ) : rows.length === 0 ? (
            <GarageEmpty
              icon={ChefHat}
              title="Belum ada recipe"
              description="Tambah recipe (BOM) di menu engineering supaya margin per item bisa dihitung."
              compact
            />
          ) : (
            <Table className="min-w-[680px]">
              <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                <TableRow>
                  <TableHead>Menu / Varian</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isNegative = row.margin < 0;
                  const isTight = row.marginPct >= 0 && row.marginPct < 30;
                  const colorClass = isNegative
                    ? "text-[#ffc2c8]"
                    : isTight
                      ? "text-[#ffd08a]"
                      : "text-[#86efac]";
                  return (
                    <TableRow key={`${row.menuItemId}-${row.variantId}`}>
                      <TableCell className="min-w-[220px]">
                        <p className="text-sm font-medium text-white">
                          {row.menuName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.variantLabel} · {row.category} · {row.ingredients}{" "}
                          bahan
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-zinc-200">
                        {currency.format(row.price)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-300">
                        {currency.format(row.recipeCost)}
                      </TableCell>
                      <TableCell
                        className={`garage-mono text-right font-semibold ${colorClass}`}
                      >
                        {currency.format(row.margin)}
                      </TableCell>
                      <TableCell
                        className={`garage-mono text-right text-sm font-extrabold ${colorClass}`}
                      >
                        {row.marginPct}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            className="garage-press h-10"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
