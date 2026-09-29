"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Megaphone,
  PiggyBank,
  RefreshCw,
  Settings2,
  Store,
  Users,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { currency } from "@/lib/garage-data";
import type { FinanceOverview } from "@/lib/finance-types";
import { garageApi } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Key AppSettings biaya tetap harian + label + icon untuk UI.
const FIXED_FIELDS = [
  { key: "dailyBudgetElectricity", label: "Token listrik", icon: Zap },
  { key: "dailyBudgetPayroll", label: "Gaji karyawan", icon: Users },
  { key: "dailyBudgetRent", label: "Sewa lapak", icon: Store },
  { key: "dailyBudgetSaveMoney", label: "Save money", icon: PiggyBank },
  { key: "dailyBudgetInternet", label: "Internet", icon: Wifi },
  { key: "dailyBudgetAds", label: "Biaya iklan", icon: Megaphone },
  { key: "dailyBudgetSystem", label: "Biaya sistem", icon: Wrench },
] as const;

type FixedKey = (typeof FIXED_FIELDS)[number]["key"];

type DailyBudgetSettings = Record<FixedKey, number>;

const EMPTY_BUDGET: DailyBudgetSettings = {
  dailyBudgetElectricity: 0,
  dailyBudgetPayroll: 0,
  dailyBudgetRent: 0,
  dailyBudgetSaveMoney: 0,
  dailyBudgetInternet: 0,
  dailyBudgetAds: 0,
  dailyBudgetSystem: 0,
};

function pickBudget(settings: Record<string, unknown>): DailyBudgetSettings {
  const next = { ...EMPTY_BUDGET };
  for (const field of FIXED_FIELDS) {
    const raw = settings[field.key];
    next[field.key] = typeof raw === "number" ? raw : Number(raw) || 0;
  }
  return next;
}

function Row({
  icon: Icon,
  label,
  value,
  strong,
  tone,
}: {
  icon?: LucideIcon;
  label: string;
  value: number;
  strong?: boolean;
  tone?: "in" | "out" | "neutral";
}) {
  const valueColor =
    tone === "in"
      ? "text-[#86efac]"
      : tone === "out"
        ? "text-[#ffc2c8]"
        : "text-white";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#23232a] py-2 last:border-0">
      <span className="flex items-center gap-2 text-sm text-[#d6d6dc]">
        {Icon ? <Icon className="size-3.5 text-[#8f8f99]" /> : null}
        {label}
      </span>
      <span
        className={`garage-mono tabular-nums ${
          strong ? "text-base font-black" : "text-sm font-semibold"
        } ${valueColor}`}
      >
        {currency.format(value)}
      </span>
    </div>
  );
}

/**
 * Panel Anggaran & Alokasi Harian: gabungkan biaya tetap (input owner, tersimpan
 * di AppSettings) dengan angka otomatis (omzet, profit, belanja dapur/bar dari
 * transaksi) supaya owner bisa lihat pembagian uang harian dalam satu layar.
 */
export function FinanceDailyBudget({
  overview,
}: {
  overview: FinanceOverview | null;
}) {
  const [budget, setBudget] = useState<DailyBudgetSettings>(EMPTY_BUDGET);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Muat biaya tetap dari settings (inline, setState setelah await).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await garageApi.get<{ settings: Record<string, unknown> }>(
          "/api/settings",
        );
        if (!cancelled) setBudget(pickBudget(data.settings));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Gagal memuat anggaran harian.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = overview?.expenseAnalysis.categories ?? [];
  const findCat = (name: string) =>
    categories.find((c) => c.category.toLowerCase() === name.toLowerCase())?.amount ?? 0;

  const omzet = overview?.today.revenue ?? 0;
  const profit = overview?.today.netProfit ?? 0;
  const belanjaDapur = findCat("Belanja Dapur");
  const belanjaBar = findCat("Belanja Bar");

  const fixedTotal = FIXED_FIELDS.reduce((sum, f) => sum + (budget[f.key] || 0), 0);
  const variableTotal = belanjaDapur + belanjaBar;
  const totalAlokasi = fixedTotal + variableTotal;
  const sisa = omzet - totalAlokasi;

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Anggaran &amp; Alokasi Harian</CardTitle>
            <CardDescription>
              Biaya tetap diatur manual; omzet, profit, dan belanja dapur/bar
              terisi otomatis dari transaksi hari ini.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 shrink-0 border-[#4a4a54] text-white"
            onClick={() => setEditOpen(true)}
          >
            <Settings2 className="mr-2 size-3.5" />
            Atur biaya tetap
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-xs text-[#ffc2c8]">{error}</p>
        ) : null}

        {/* Ringkasan alokasi */}
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-[#22c55e]/35 bg-[#22c55e]/10 p-3">
            <p className="garage-mono text-[10px] text-[#86efac]">Omzet hari ini</p>
            <p className="mt-1 break-words text-lg font-black tabular-nums text-white">
              {currency.format(omzet)}
            </p>
          </div>
          <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
            <p className="garage-mono text-[10px] text-[#ffd08a]">Biaya tetap</p>
            <p className="mt-1 break-words text-lg font-black tabular-nums text-white">
              {currency.format(fixedTotal)}
            </p>
          </div>
          <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
            <p className="garage-mono text-[10px] text-[#ffd08a]">Belanja dapur+bar</p>
            <p className="mt-1 break-words text-lg font-black tabular-nums text-white">
              {currency.format(variableTotal)}
            </p>
          </div>
          <div
            className={`rounded-md border p-3 ${
              sisa < 0
                ? "border-[#d11a2a]/45 bg-[#d11a2a]/12"
                : "border-[#22c55e]/35 bg-[#22c55e]/10"
            }`}
          >
            <p className="garage-mono text-[10px] text-[#b8b8bf]">
              Sisa (omzet − alokasi)
            </p>
            <p
              className={`mt-1 break-words text-lg font-black tabular-nums ${
                sisa < 0 ? "text-[#ffc2c8]" : "text-[#86efac]"
              }`}
            >
              {currency.format(sisa)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Biaya tetap */}
          <div className="garage-surface rounded-md p-3">
            <p className="mb-1 text-sm font-semibold text-white">
              Biaya tetap / hari
            </p>
            <p className="mb-2 text-[10px] text-[#8f8f99]">
              {loading ? "Memuat..." : "Diatur manual di tombol Atur biaya tetap"}
            </p>
            {FIXED_FIELDS.map((f) => (
              <Row
                key={f.key}
                icon={f.icon}
                label={f.label}
                value={budget[f.key] || 0}
              />
            ))}
            <div className="mt-1 border-t border-[#34343c] pt-1">
              <Row label="Subtotal biaya tetap" value={fixedTotal} strong tone="out" />
            </div>
          </div>

          {/* Otomatis dari transaksi */}
          <div className="garage-surface rounded-md p-3">
            <p className="mb-1 text-sm font-semibold text-white">
              Otomatis hari ini
            </p>
            <p className="mb-2 text-[10px] text-[#8f8f99]">
              Dari POS &amp; pengeluaran kategori Belanja Dapur / Belanja Bar
            </p>
            <Row label="Omzet (penjualan)" value={omzet} tone="in" />
            <Row label="Belanja dapur" value={belanjaDapur} tone="out" />
            <Row label="Belanja bar" value={belanjaBar} tone="out" />
            <div className="mt-1 border-t border-[#34343c] pt-1">
              <Row
                label="Laba bersih (sistem)"
                value={profit}
                strong
                tone={profit < 0 ? "out" : "in"}
              />
            </div>
          </div>
        </div>

        <p className="text-[11px] leading-5 text-[#8f8f99]">
          Catatan: <span className="text-[#d6d6dc]">Sisa</span> = Omzet − (biaya
          tetap + belanja dapur/bar). Untuk memisahkan belanja dapur &amp; bar
          otomatis, catat pengeluaran memakai kategori{" "}
          <span className="text-[#ffd08a]">Belanja Dapur</span> atau{" "}
          <span className="text-[#ffd08a]">Belanja Bar</span> di menu Pengeluaran.
        </p>
      </CardContent>

      <FinanceBudgetEditDialog
        open={editOpen}
        initial={budget}
        onOpenChange={setEditOpen}
        onSaved={(next) => setBudget(next)}
      />
    </Card>
  );
}

function FinanceBudgetEditDialog({
  open,
  initial,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial: DailyBudgetSettings;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: DailyBudgetSettings) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        {open ? (
          <BudgetForm
            initial={initial}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BudgetForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: DailyBudgetSettings;
  onClose: () => void;
  onSaved: (next: DailyBudgetSettings) => void;
}) {
  const [values, setValues] = useState<Record<FixedKey, string>>(() => {
    const next = {} as Record<FixedKey, string>;
    for (const f of FIXED_FIELDS) next[f.key] = String(initial[f.key] ?? 0);
    return next;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const patch = {} as DailyBudgetSettings;
    for (const f of FIXED_FIELDS) {
      const n = Number(values[f.key]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Nilai ${f.label} tidak valid.`);
        return;
      }
      patch[f.key] = Math.round(n);
    }
    setSaving(true);
    setError(null);
    try {
      await garageApi.patch("/api/settings", patch);
      onSaved(patch);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menyimpan biaya tetap.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Atur biaya tetap harian</DialogTitle>
        <DialogDescription>
          Nilai per hari. Tersimpan di pengaturan dan dipakai panel Alokasi Harian.
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-2">
          {FIXED_FIELDS.map((f) => (
            <div key={f.key}>
              <p className="garage-mono mb-1 flex items-center gap-1.5 text-[10px] text-[#b8b8bf]">
                <f.icon className="size-3" />
                {f.label}
              </p>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={values[f.key]}
                onChange={(e) =>
                  setValues((cur) => ({ ...cur, [f.key]: e.target.value }))
                }
                className="h-11 border-[#34343c] bg-white/[0.06]"
              />
            </div>
          ))}
        </div>
        {error ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTitle>Gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2 pt-1 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button type="submit" className="garage-press h-10" disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="mr-2 size-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Check className="mr-2 size-4" />
                Simpan
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
