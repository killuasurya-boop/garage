"use client";

import { Banknote, Coins, Minus, Plus } from "lucide-react";

import { CASH_DENOMINATIONS, sumDenominations } from "@/lib/cash-denominations";

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

/** Teks input per pecahan → jumlah bulat (kosong diabaikan). */
export function parseDenominationCounts(counts: Record<string, string>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, raw]) => raw.trim() !== "")
      .map(([key, raw]) => [key, Math.max(0, Math.floor(Number(raw) || 0))]),
  );
}

export function denominationTotals(counts: Record<string, string>) {
  const parsed = parseDenominationCounts(counts);
  return {
    parsed,
    total: sumDenominations(parsed),
    pieces: Object.values(parsed).reduce((sum, qty) => sum + qty, 0),
    anyCounted: Object.keys(parsed).length > 0,
  };
}

/**
 * Tabel hitung uang per pecahan (kertas + koin) dipakai saat buka & tutup
 * shift: jumlah lembar/keping × nilai = total per baris.
 */
export function CashDenominationGrid({
  counts,
  onChange,
  testIdPrefix = "denom",
}: {
  counts: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  testIdPrefix?: string;
}) {
  const parsed = parseDenominationCounts(counts);

  function setCount(key: string, value: string) {
    onChange({ ...counts, [key]: value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 5) });
  }
  function step(key: string, delta: number) {
    setCount(key, String(Math.max(0, (parsed[key] ?? 0) + delta)));
  }

  return (
    <>
      {[
        { label: "Uang kertas", Icon: Banknote, list: CASH_DENOMINATIONS.filter((item) => item.kind === "note") },
        { label: "Uang koin", Icon: Coins, list: CASH_DENOMINATIONS.filter((item) => item.kind === "coin") },
      ].map((group) => (
        <div key={group.label} className="overflow-hidden rounded-lg border border-[#34343c]">
          <p className="flex items-center gap-1.5 border-b border-[#34343c] bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#d6d6dc]">
            <group.Icon className="size-3.5 text-[#f5a742]" /> {group.label}
          </p>
          <ul className="divide-y divide-white/5">
            {group.list.map((denomination) => {
              const qty = parsed[denomination.key] ?? 0;
              return (
                <li
                  key={denomination.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 px-2.5 py-1.5 sm:gap-2 sm:px-3"
                >
                  <span className="whitespace-nowrap text-[13px] font-semibold text-white sm:text-sm">{denomination.label}</span>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => step(denomination.key, -1)}
                      className="grid size-9 place-items-center rounded-l-md sm:size-10 border border-[#4a4a54] bg-white/[0.05] text-white hover:bg-white/10 disabled:opacity-40"
                      disabled={qty === 0}
                      aria-label={`Kurangi ${denomination.label}`}
                    >
                      <Minus className="size-4" />
                    </button>
                    <input
                      inputMode="numeric"
                      value={counts[denomination.key] ?? ""}
                      onChange={(event) => setCount(denomination.key, event.target.value)}
                      placeholder="0"
                      aria-label={`Jumlah ${denomination.label}`}
                      data-testid={`${testIdPrefix}-${denomination.key}`}
                      className="h-9 w-11 border-y sm:h-10 sm:w-14 border-[#4a4a54] bg-black/30 text-center font-mono text-base font-bold text-white outline-none placeholder:text-[#6b6b75] focus:bg-black/50"
                    />
                    <button
                      type="button"
                      onClick={() => step(denomination.key, 1)}
                      className="grid size-9 place-items-center rounded-r-md sm:size-10 border border-[#4a4a54] bg-white/[0.05] text-white hover:bg-white/10"
                      aria-label={`Tambah ${denomination.label}`}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <span className={`whitespace-nowrap text-right font-mono text-[13px] sm:text-sm ${qty ? "font-bold text-white" : "text-[#8f8f99]"}`}>
                    {rupiah(denomination.value * qty)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * Hitung pecahan modal awal saat buka shift (laporan pertanggungjawaban kas).
 * Opsional tapi disarankan; bila diisi, totalnya wajib = modal awal.
 */
export function OpeningDenominationCount({
  counts,
  onChange,
  openingCash,
}: {
  counts: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  openingCash: number | null;
}) {
  const { total, pieces, anyCounted } = denominationTotals(counts);
  const matches = anyCounted && openingCash !== null && total === openingCash;
  return (
    <details className="group rounded-lg border border-[#34343c] bg-white/[0.03]" open={anyCounted || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-white">
        <span>Hitung pecahan modal awal <span className="font-normal text-[#c8c8cf]">(disarankan)</span></span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
            !anyCounted ? "text-[#c8c8cf]" : matches ? "bg-[#f5a742]/15 text-[#ffd08a]" : "bg-[#d11a2a]/20 text-[#ffc2c8]"
          }`}
          data-testid="opening-denom-status"
        >
          {!anyCounted ? "Belum dihitung" : `${rupiah(total)}${matches ? " ✓ cocok" : " ≠ modal"}`}
        </span>
      </summary>
      <div className="space-y-2 border-t border-[#34343c] p-3">
        <p className="text-xs leading-5 text-[#d6d6dc]">
          Isi jumlah lembar/keping uang di laci. Total harus sama dengan modal awal — tercatat di laporan shift.
        </p>
        <CashDenominationGrid counts={counts} onChange={onChange} testIdPrefix="open-denom" />
        <p className="text-right text-xs text-[#d6d6dc]">
          {pieces} lembar/keping · total <span className="font-bold text-white">{rupiah(total)}</span>
          {openingCash !== null ? ` · modal ${rupiah(openingCash)}` : ""}
        </p>
      </div>
    </details>
  );
}
