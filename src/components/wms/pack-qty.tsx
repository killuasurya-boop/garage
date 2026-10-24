"use client";

import { useState } from "react";

import { countPack, formatPacks, toBaseQty, type PackUom } from "@/lib/stock-uom";

const numberFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

/** "3 kotak + 250 ml" — dengan total satuan dasar kecil di bawah bila ada kemasan. */
export function PackQtyText({ qty, unit, uoms, showBase = true, className = "" }: { qty: number; unit: string; uoms?: PackUom[] | null; showBase?: boolean; className?: string }) {
  const hasPack = !!countPack(uoms);
  return (
    <span className={className}>
      {formatPacks(qty, unit, uoms)}
      {hasPack && showBase ? <span className="block text-[11px] font-normal opacity-80">{numberFormat.format(qty)} {unit}</span> : null}
    </span>
  );
}

const parse = (raw: string) => Number(raw.replace(",", ".")) || 0;

/**
 * Input jumlah dalam kemasan + sisa satuan dasar ("2 kotak + 300 ml") → nilai satuan
 * dasar. Bahan tanpa kemasan → satu input satuan dasar. Teks mentah disimpan saat
 * mengetik supaya desimal ("0,5") tidak hilang.
 */
export function PackQtyInput({
  value,
  onChange,
  onBlur,
  unit,
  uoms,
  disabled,
  idPrefix,
  label,
  tone = "light",
}: {
  value: number | null;
  onChange: (base: number) => void;
  onBlur?: () => void;
  unit: string;
  uoms?: PackUom[] | null;
  disabled?: boolean;
  idPrefix: string;
  label: string;
  tone?: "light" | "dark";
}) {
  const pack = countPack(uoms);
  const [draft, setDraft] = useState<{ count?: string; rest?: string }>({});
  const base = value ?? 0;
  const count = pack ? Math.floor(Math.round((base / pack.factor) * 10_000) / 10_000 + 1e-9) : 0;
  const rest = pack ? Math.round((base - count * pack.factor) * 10_000) / 10_000 : base;
  const field =
    tone === "dark"
      ? "h-9 rounded-md border border-[#34343c] bg-[#1b1b21] text-center text-sm font-bold text-white disabled:opacity-50"
      : "h-9 rounded-md border border-[#dedfe4] bg-white text-right text-[13px] font-mono text-[#17191d] outline-none focus:border-[#C8102E] disabled:bg-[#F8F9FB]";
  const unitCls = tone === "dark" ? "text-xs text-[#c4c4cc]" : "text-[11px] text-[#525866]";
  const blur = () => {
    setDraft({});
    onBlur?.();
  };
  const restValue = value === null && draft.rest === undefined ? "" : (draft.rest ?? (rest ? String(rest).replace(".", ",") : pack ? "" : "0"));

  if (!pack) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          id={`${idPrefix}-rest`}
          aria-label={`${label} (${unit})`}
          inputMode="decimal"
          disabled={disabled}
          value={value === null && draft.rest === undefined ? "" : (draft.rest ?? String(base).replace(".", ","))}
          placeholder="0"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,]/g, "");
            setDraft({ rest: raw });
            onChange(parse(raw));
          }}
          onBlur={blur}
          className={`${field} w-24 px-2`}
        />
        <span className={unitCls}>{unit}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <input
        id={`${idPrefix}-count`}
        aria-label={`${label} (${pack.uom})`}
        inputMode="numeric"
        disabled={disabled}
        value={value === null && draft.count === undefined ? "" : (draft.count ?? String(count))}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, "");
          setDraft((d) => ({ ...d, count: raw }));
          onChange(toBaseQty({ count: parse(raw), factor: pack.factor, rest }));
        }}
        onBlur={blur}
        className={`${field} w-14 px-1`}
      />
      <span className={unitCls}>{pack.uom} +</span>
      <input
        id={`${idPrefix}-rest`}
        aria-label={`${label} sisa (${unit})`}
        inputMode="decimal"
        disabled={disabled}
        value={restValue}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,]/g, "");
          setDraft((d) => ({ ...d, rest: raw }));
          onChange(toBaseQty({ count, factor: pack.factor, rest: parse(raw) }));
        }}
        onBlur={blur}
        className={`${field} w-20 px-1`}
      />
      <span className={unitCls}>{unit}</span>
    </span>
  );
}
