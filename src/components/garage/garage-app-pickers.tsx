"use client";

// Komponen picker/preset kecil yang sebelumnya inline di garage-app.tsx.
// Extract ke file sendiri untuk turunkan source size garage-app.tsx + memudahkan
// reuse. Murni JSX dgn shadcn/ui + lucide-react, tidak punya React state sendiri.

import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { currency } from "@/lib/garage-data";

// --- Cashier theme preset ------------------------------------------------
// POS V6 (owner, Nov 2026): empat tema Theme Studio + Garage Dark (gelap klasik, permintaan Owner 5 Nov 2026).
// Kunci lama dipertahankan supaya preferensi perangkat tidak hilang; perangkat baru = Garage Signature.

export type CashierThemeMode = "garage-signature" | "garage-clear" | "warm-light" | "focus-blue" | "garage-default";

export const DEFAULT_CASHIER_THEME: CashierThemeMode = "garage-signature";

export const cashierThemePresets: Array<{
  value: CashierThemeMode;
  label: string;
  detail: string;
  /** [sidebar/header, kanvas, permukaan, aksen] — dipakai pratinjau mini Theme Studio. */
  swatches: string[];
}> = [
  {
    value: "garage-signature",
    label: "Garage Signature",
    detail: "Sidebar charcoal, aksen merah Garage, konten putih elegan.",
    swatches: ["#211718", "#F8F6F4", "#FFFFFF", "#B5121B"],
  },
  {
    value: "garage-clear",
    label: "Garage Clear",
    detail: "Putih bersih, abu-abu lembut, keterbacaan maksimal.",
    swatches: ["#FFFFFF", "#F3F4F6", "#FFFFFF", "#B5121B"],
  },
  {
    value: "warm-light",
    label: "Warm Coffee",
    detail: "Krem, ivory, espresso — nuansa kafe hangat.",
    swatches: ["#3A2219", "#F5EEE3", "#FFFDF8", "#B5121B"],
  },
  {
    value: "focus-blue",
    label: "Focus Blue",
    detail: "Putih kebiruan, navy, aksen biru yang tenang.",
    swatches: ["#FFFFFF", "#EEF3F9", "#FFFFFF", "#1F5FD1"],
  },
  {
    value: "garage-default",
    label: "Garage Dark",
    detail: "Tema gelap klasik POS — asphalt, chrome, aksen merah.",
    swatches: ["#0B0B0E", "#0A0A0D", "#17171C", "#E63946"],
  },
];

export function isCashierThemeMode(value: string | null): value is CashierThemeMode {
  return cashierThemePresets.some((preset) => preset.value === value);
}

/** Baca preferensi tersimpan: kunci tak dikenal/kosong → Garage Signature; gelap klasik tetap gelap. */
export function normalizeCashierTheme(value: string | null): CashierThemeMode {
  return isCashierThemeMode(value) ? value : DEFAULT_CASHIER_THEME;
}

export function CashierThemePresetGrid({
  value,
  onChange,
  layout = "list",
}: {
  value: CashierThemeMode;
  onChange: (theme: CashierThemeMode) => void;
  /** "cards" = kartu pratinjau 2 kolom (Theme Studio), "list" = baris ringkas. */
  layout?: "list" | "cards";
}) {
  return (
    <div className={layout === "cards" ? "grid gap-2.5 sm:grid-cols-2" : "grid gap-2"} role="radiogroup" aria-label="Tema POS">
      {cashierThemePresets.map((preset) => {
        const active = value === preset.value;
        const [chrome, canvas, surface, accent] = preset.swatches;

        return (
          <button
            key={preset.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            className={`garage-press pos-v6-theme-card flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
              layout === "cards" ? "flex-col items-stretch" : "min-h-16"
            }`}
            onClick={() => onChange(preset.value)}
          >
            {/* Pratinjau mini: sidebar + header + kartu + tombol aksen */}
            <span
              aria-hidden
              className={`relative flex shrink-0 overflow-hidden rounded-lg border border-black/10 ${layout === "cards" ? "h-20 w-full" : "h-11 w-16"}`}
              style={{ background: canvas }}
            >
              <span className="h-full w-[22%]" style={{ background: chrome }} />
              <span className="flex flex-1 flex-col gap-1 p-1.5">
                <span className="h-[18%] rounded-sm" style={{ background: chrome, opacity: 0.9 }} />
                <span className="flex flex-1 gap-1">
                  <span className="flex-1 rounded-sm border border-black/5" style={{ background: surface }} />
                  <span className="flex-1 rounded-sm border border-black/5" style={{ background: surface }} />
                  <span className="w-[30%] rounded-sm border border-black/5" style={{ background: surface }} />
                </span>
                <span className="h-[16%] w-[38%] self-end rounded-sm" style={{ background: accent }} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-bold">
                {preset.label}
                {preset.value === DEFAULT_CASHIER_THEME ? <span className="pos-v6-default-tag">Utama</span> : null}
              </span>
              <span className="mt-0.5 block text-xs leading-snug opacity-80">{preset.detail}</span>
            </span>
            {active ? <Check className={`size-4 shrink-0 ${layout === "cards" ? "absolute right-3 top-3" : ""}`} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

// --- Opening cash preset --------------------------------------------------

export const openingCashPresets = Array.from(
  { length: 10 },
  (_, index) => (index + 1) * 50000,
);

export function OpeningCashPresetPicker({
  value,
  onChange,
  label = "Uang modal awal di laci",
  helper = `Minimal ${currency.format(50000)}, maksimal ${currency.format(500000)}.`,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helper?: string;
}) {
  const selectedValue = Number(value);

  return (
    <div className="space-y-2">
      <p className="garage-mono text-[10px] text-[#b8b8bf]">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {openingCashPresets.map((amount) => {
          const active = selectedValue === amount;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => onChange(String(amount))}
              className={`garage-press h-10 rounded-md border px-2 text-xs font-black transition ${
                active
                  ? "border-[#f5a742] bg-[#f5a742] text-[#111116]"
                  : "border-[#4a4a54] bg-white/[0.055] text-[#f4f4f5] hover:border-[#f5a742]/70"
              }`}
            >
              {currency.format(amount)}
            </button>
          );
        })}
      </div>
      <Input
        type="number"
        inputMode="numeric"
        min={50000}
        max={500000}
        step={50000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 border-[#34343c] bg-white/[0.06]"
      />
      {helper ? <p className="text-xs leading-5 text-[#8f8f99]">{helper}</p> : null}
    </div>
  );
}

// --- Settings choice group (generic radio-as-button) ---------------------

export function SettingsChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; detail?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="garage-mono text-[10px] text-[#b8b8bf]">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={`garage-press min-h-14 rounded-md border p-2.5 text-left transition ${
                active
                  ? "border-[#f5a742] bg-[#f5a742]/16 text-white"
                  : "border-[#34343c] bg-white/[0.045] text-[#d6d6dc] hover:border-[#f5a742]/55"
              }`}
              onClick={() => onChange(option.value)}
              aria-pressed={active}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{option.label}</span>
                {active ? <Check className="size-4 text-[#22c55e]" /> : null}
              </span>
              {option.detail ? (
                <span className="mt-1 block text-xs leading-4 opacity-80">{option.detail}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
