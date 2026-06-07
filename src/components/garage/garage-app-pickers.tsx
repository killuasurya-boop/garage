"use client";

// Komponen picker/preset kecil yang sebelumnya inline di garage-app.tsx.
// Extract ke file sendiri untuk turunkan source size garage-app.tsx + memudahkan
// reuse. Murni JSX dgn shadcn/ui + lucide-react, tidak punya React state sendiri.

import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { currency } from "@/lib/garage-data";

// --- Cashier theme preset ------------------------------------------------

export type CashierThemeMode = "garage-default" | "garage-clear" | "warm-light" | "focus-blue";

export const cashierThemePresets: Array<{
  value: CashierThemeMode;
  label: string;
  detail: string;
  swatches: string[];
}> = [
  {
    value: "garage-default",
    label: "Garage Default",
    detail: "Dark profesional",
    swatches: ["#0A0A0D", "#14141A", "#E63946", "#FBBF24"],
  },
  {
    value: "garage-clear",
    label: "Garage Clear",
    detail: "Light minimal",
    swatches: ["#FFFFFF", "#F7F8FA", "#0F172A", "#D11A2A"],
  },
  {
    value: "warm-light",
    label: "Warm Light",
    detail: "Café paper",
    swatches: ["#FFFFFF", "#FAF6EF", "#6B4226", "#C08A4A"],
  },
  {
    value: "focus-blue",
    label: "Focus Blue",
    detail: "Calm pro",
    swatches: ["#FFFFFF", "#F1F5F9", "#4338CA", "#0D9488"],
  },
];

export function isCashierThemeMode(value: string | null): value is CashierThemeMode {
  return cashierThemePresets.some((preset) => preset.value === value);
}

export function CashierThemePresetGrid({
  value,
  onChange,
}: {
  value: CashierThemeMode;
  onChange: (theme: CashierThemeMode) => void;
}) {
  return (
    <div className="grid gap-2">
      {cashierThemePresets.map((preset) => {
        const active = value === preset.value;

        return (
          <button
            key={preset.value}
            type="button"
            className={`garage-press cashier-theme-preset flex min-h-16 items-center gap-3 rounded-md border p-2.5 text-left transition ${
              active
                ? "border-[#f5a742] bg-[#f5a742]/14 text-white"
                : "border-[#34343c] bg-white/[0.045] text-[#d6d6dc]"
            }`}
            onClick={() => onChange(preset.value)}
            aria-pressed={active}
          >
            <span className="grid grid-cols-4 gap-1">
              {preset.swatches.map((color) => (
                <span
                  key={color}
                  className="size-6 rounded-sm border border-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black">{preset.label}</span>
              <span className="mt-0.5 block truncate text-xs opacity-80">{preset.detail}</span>
            </span>
            {active ? <Check className="size-4 shrink-0 text-[#22c55e]" /> : null}
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

// --- Shift number picker --------------------------------------------------

export function ShiftNumberPicker({
  value,
  onChange,
}: {
  value: 1 | 2;
  onChange: (value: 1 | 2) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="garage-mono text-[10px] text-[#b8b8bf]">Nomor shift hari ini</p>
      <div className="grid grid-cols-2 gap-2">
        {([1, 2] as const).map((shift) => {
          const active = value === shift;
          return (
            <button
              key={shift}
              type="button"
              onClick={() => onChange(shift)}
              className={`garage-press rounded-md border px-3 py-3 text-left transition ${
                active
                  ? "border-[#f5a742] bg-[#f5a742] text-[#111116]"
                  : "border-[#4a4a54] bg-white/[0.055] text-[#f4f4f5] hover:border-[#f5a742]/70"
              }`}
            >
              <span className="block text-sm font-black">Shift {shift}</span>
              <span className="mt-1 block text-xs opacity-80">
                {shift === 1 ? "Pembuka" : "Lanjutan"}
              </span>
            </button>
          );
        })}
      </div>
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
