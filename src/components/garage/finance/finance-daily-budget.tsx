"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChefHat, Coffee, PackageSearch, PiggyBank, RefreshCw, Settings2, ShoppingCart } from "lucide-react";

import { currency } from "@/lib/garage-data";
import type { FinanceOverview } from "@/lib/finance-types";
import type { BudgetStatus, DailyCosts } from "@/lib/finance-daily-costs";
import { garageApi } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_STYLE: Record<BudgetStatus, { label: string; className: string }> = {
  kosong: { label: "Belum ada pemakaian", className: "border-[#4a4a54] bg-white/[0.06] text-[#d6d6dc]" },
  di_bawah: { label: "Di bawah anggaran", className: "border-[#c0c0c8]/40 bg-white/[0.08] text-[#e4e4e7]" },
  sesuai: { label: "Sesuai anggaran", className: "border-[#f5a742]/50 bg-[#f5a742]/14 text-[#ffd08a]" },
  melebihi: { label: "Melebihi anggaran", className: "border-[#d11a2a]/55 bg-[#d11a2a]/16 text-[#ffb3b3]" },
};

const shortRp = (value: number) =>
  value >= 1_000_000
    ? `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    : `Rp${Math.round(value / 1_000).toLocaleString("id-ID")} rb`;

function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone: "in" | "out" | "result" }) {
  const negative = tone === "result" && value < 0;
  const box =
    tone === "in"
      ? "border-[#c0c0c8]/30 bg-white/[0.06]"
      : tone === "out"
        ? "border-[#f5a742]/35 bg-[#f5a742]/10"
        : negative
          ? "border-[#d11a2a]/45 bg-[#d11a2a]/12"
          : "border-[#c0c0c8]/30 bg-white/[0.06]";
  return (
    <div className={`rounded-md border p-3 ${box}`}>
      <p className="garage-mono text-[10px] text-[#d6d6dc]">{label}</p>
      <p className={`mt-1 break-words text-lg font-black tabular-nums ${negative ? "text-[#ffc2c8]" : "text-white"}`}>
        {currency.format(value)}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-[#b8b8bf]">{hint}</p> : null}
    </div>
  );
}

/**
 * Biaya Harian & Belanja (Finance):
 * - biaya tetap dari master Pengaturan Keuangan (satu sumber, Owner);
 * - biaya tidak tetap OTOMATIS dari bahan baku yang terpakai penjualan hari ini
 *   (resep × harga beli), dipisah Bar/Dapur dan dibandingkan dengan anggaran;
 * - daftar belanja otomatis dari stok gudang yang habis/menipis.
 */
export function FinanceDailyBudget({ overview }: { overview: FinanceOverview | null }) {
  const [data, setData] = useState<DailyCosts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await garageApi.get<DailyCosts>("/api/finance/daily-costs", { cache: "no-store" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat biaya harian.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat biaya harian saat panel tampil
    void load();
  }, [load]);

  const omzet = overview?.today.revenue ?? 0;
  const fixedTotal = data?.fixed.total ?? 0;
  const variableTotal = data?.variable.total ?? 0;
  const sisa = omzet - fixedTotal - variableTotal;

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>Biaya Harian &amp; Belanja</CardTitle>
            <CardDescription>
              Biaya tetap dari Pengaturan Keuangan. Biaya bahan baku terhitung otomatis dari resep setiap
              penjualan lunas, dipisah Bar &amp; Dapur.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-9 border-[#4a4a54] text-white"
              onClick={() => void load()}
              aria-label="Muat ulang biaya harian"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button asChild variant="outline" className="garage-press h-9 border-[#4a4a54] text-white">
              <Link href="/control/financial/settings">
                <Settings2 className="mr-2 size-3.5" />
                Atur biaya
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc2c8]">
            {error}
          </p>
        ) : null}
        {loading && !data ? <p className="text-sm text-[#b8b8bf]">Memuat biaya harian…</p> : null}

        {data ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="Omzet hari ini" value={omzet} tone="in" />
              <Tile
                label="Biaya tetap / hari"
                value={fixedTotal}
                tone="out"
                hint={`Operasional ${shortRp(data.fixed.operational)} + Save Money ${shortRp(data.fixed.reserve)}`}
              />
              <Tile
                label="Bahan baku terpakai (otomatis)"
                value={variableTotal}
                tone="out"
                hint={`Anggaran ${shortRp(data.variable.budgetMin)}–${shortRp(data.variable.budgetMax)}`}
              />
              <Tile label="Sisa (omzet − biaya)" value={sisa} tone="result" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="garage-surface rounded-md p-3">
                <p className="text-sm font-semibold text-white">Biaya tetap / hari</p>
                <ul className="mt-2">
                  {data.fixed.items.map((item) => (
                    <li
                      key={item.code}
                      className="flex items-center justify-between gap-3 border-b border-[#23232a] py-2 text-sm last:border-0"
                    >
                      <span className="flex items-center gap-2 text-[#d6d6dc]">
                        {item.isReserve ? <PiggyBank className="size-3.5 text-[#ffd08a]" /> : null}
                        {item.name}
                        {item.isReserve ? <span className="text-[11px] text-[#b8b8bf]">(cadangan laba)</span> : null}
                      </span>
                      <span className="garage-mono font-semibold tabular-nums text-white">
                        {currency.format(item.dailyAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex items-center justify-between border-t border-[#34343c] pt-2 text-sm">
                  <span className="font-semibold text-white">Total</span>
                  <span className="garage-mono font-black tabular-nums text-[#ffd08a]">
                    {currency.format(data.fixed.total)}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[#b8b8bf]">
                  Save Money disisihkan dari laba — tidak mengurangi laba bersih maupun target BEP.
                </p>
              </div>

              <div className="garage-surface rounded-md p-3">
                <p className="text-sm font-semibold text-white">Biaya tidak tetap — bahan baku terpakai hari ini</p>
                <div className="mt-2 space-y-3">
                  {data.variable.areas.map((area) => {
                    const status = STATUS_STYLE[area.status];
                    const pct = area.budgetMax > 0 ? Math.min(100, (area.actual / area.budgetMax) * 100) : 0;
                    const Icon = area.area === "bar" ? Coffee : ChefHat;
                    return (
                      <div key={area.area} className="rounded-md border border-[#34343c] bg-white/[0.04] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Icon className="size-4 text-[#ffd08a]" /> {area.label}
                          </span>
                          <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="garage-mono mt-1 text-lg font-black tabular-nums text-white">
                          {currency.format(area.actual)}
                        </p>
                        <div className="mt-1.5 h-2 overflow-hidden rounded bg-white/10" aria-hidden>
                          <div
                            className={`h-full ${area.status === "melebihi" ? "bg-[#d11a2a]" : "bg-[#f5a742]"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-[#b8b8bf]">
                          Anggaran {currency.format(area.budgetMin)} – {currency.format(area.budgetMax)} / hari
                        </p>
                        {area.linesWithoutRecipe > 0 ? (
                          <p className="mt-1 text-[11px] text-[#ffd08a]">
                            {area.linesWithoutRecipe} item terjual belum punya resep — bahan bakunya belum
                            terhitung. Lengkapi resep di menu Produk.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="garage-surface rounded-md p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <ShoppingCart className="size-4 text-[#ffd08a]" /> Daftar belanja otomatis
                </p>
                <span className="garage-mono text-sm font-bold text-[#ffd08a]">
                  Estimasi {currency.format(data.shopping.totalEstimatedCost)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#b8b8bf]">
                Dari stok gudang yang habis/di bawah minimum, dihitung per kemasan beli bila tersedia.
              </p>
              {data.shopping.areas.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-3 text-sm text-[#d6d6dc]">
                  <PackageSearch className="size-4 text-[#b8b8bf]" />
                  Semua stok aman — belum ada bahan yang perlu dibeli.
                </p>
              ) : (
                <div className="garage-scroll mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {data.shopping.areas.map((group) => (
                    <div key={group.area}>
                      <div className="flex items-center justify-between gap-2 border-b border-[#34343c] pb-1">
                        <p className="text-sm font-semibold text-white">Belanja {group.label}</p>
                        <p className="garage-mono text-sm font-bold tabular-nums text-white">
                          {currency.format(group.estimatedCost)}
                        </p>
                      </div>
                      <ul>
                        {group.items.map((item) => (
                          <li
                            key={item.sku}
                            className="flex items-start justify-between gap-3 border-b border-[#23232a] py-2 last:border-0"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-white">
                                {item.name}
                                {item.urgency === "critical" ? (
                                  <span className="ml-2 rounded border border-[#d11a2a]/55 bg-[#d11a2a]/16 px-1.5 py-0.5 text-[10px] font-bold text-[#ffb3b3]">
                                    HABIS
                                  </span>
                                ) : item.urgency === "low" ? (
                                  <span className="ml-2 rounded border border-[#f5a742]/50 bg-[#f5a742]/14 px-1.5 py-0.5 text-[10px] font-bold text-[#ffd08a]">
                                    MENIPIS
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-[11px] text-[#b8b8bf]">
                                Stok {item.onHand.toLocaleString("id-ID")} {item.unit} · min{" "}
                                {item.minStock.toLocaleString("id-ID")} · beli{" "}
                                <span className="font-semibold text-[#e4e4e7]">
                                  {item.packages !== null
                                    ? `${item.packages} × ${item.packageLabel ?? "kemasan"}`
                                    : `${item.suggestedQty.toLocaleString("id-ID")} ${item.unit}`}
                                </span>
                              </p>
                            </div>
                            <span className="garage-mono shrink-0 text-sm font-semibold tabular-nums text-white">
                              {currency.format(item.estimatedCost)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <Button asChild variant="outline" className="garage-press h-9 border-[#4a4a54] text-white">
                  <Link href="/warehouse">Buka Gudang</Link>
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
