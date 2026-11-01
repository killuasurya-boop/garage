"use client";

import { useMemo, useState } from "react";
import { Check, Layers, Loader2, X } from "lucide-react";

import type { ProductionBatchSuggestionView, ProductionBatchView } from "@/lib/garage-api-types";
import { allocationCoverage } from "@/lib/garage-production-rules";
import { elapsedSeconds, formatElapsed } from "@/lib/production-hub-v4";

import { Segmented } from "./hub-ui";
import { tableText } from "./order-card";

/**
 * Batch Produksi (Bar/Dapur): saran hanya untuk porsi dengan produk + varian +
 * catatan yang sama (server: batchKeyFor). Menyelesaikan batch hanya mengubah
 * porsi di batch itu; tiket order lain tetap pada statusnya.
 */
export function BatchPanel({
  suggestions,
  batches,
  station,
  onStation,
  canOperate,
  busyKey,
  now,
  onStart,
  onComplete,
  onCancel,
}: {
  suggestions: ProductionBatchSuggestionView[];
  batches: ProductionBatchView[];
  station: "Bar" | "Food";
  onStation: (station: "Bar" | "Food") => void;
  canOperate: { Bar: boolean; Food: boolean };
  busyKey: string | null;
  now: number;
  onStart: (suggestion: ProductionBatchSuggestionView) => void;
  onComplete: (batch: ProductionBatchView, allocationIds: string[]) => Promise<boolean>;
  onCancel: (batch: ProductionBatchView, reason: string) => Promise<boolean>;
}) {
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const mineSuggestions = suggestions.filter((s) => s.station === station);
  const mineBatches = batches.filter((b) => b.station === station);
  const counts = {
    Bar: suggestions.filter((s) => s.station === "Bar").length + batches.filter((b) => b.station === "Bar").length,
    Food: suggestions.filter((s) => s.station === "Food").length + batches.filter((b) => b.station === "Food").length,
  };
  const active = useMemo(() => mineBatches.find((b) => b.id === openBatch) ?? null, [mineBatches, openBatch]);
  const coverage = active
    ? allocationCoverage(
        active.allocations.map((a) => ({ qty: a.qty, allocated: a.allocated || checked.has(a.id) })),
        active.totalQty,
      )
    : null;

  function open(batch: ProductionBatchView) {
    setOpenBatch(batch.id);
    setChecked(new Set(batch.allocations.filter((a) => a.allocated).map((a) => a.id)));
    setReason("");
  }

  return (
    <div className="space-y-3">
      <Segmented
        label="Station batch"
        value={station}
        onChange={onStation}
        options={[
          { value: "Bar", label: "Bar", count: counts.Bar },
          { value: "Food", label: "Dapur", count: counts.Food },
        ]}
      />

      <section aria-label="Batch berjalan" className="space-y-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--phv4-muted)]">Sedang dibuat</h3>
        {mineBatches.length ? (
          mineBatches.map((batch) => {
            const expanded = active?.id === batch.id;
            return (
              <div key={batch.id} className="rounded-[8px] border border-[var(--phv4-process)]/50 bg-[var(--phv4-card)] p-2.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">
                      {batch.itemLabel}{" "}
                      <span className="phv4-mono rounded bg-[var(--phv4-red)] px-1.5 text-[12px] text-white">{batch.totalQty}×</span>
                    </p>
                    <p className="phv4-mono truncate text-[11px] text-[var(--phv4-muted)]">
                      {batch.batchNo} · {formatElapsed(elapsedSeconds(batch.startedAt, now))}
                      {batch.note ? ` · ${batch.note}` : ""}
                    </p>
                  </div>
                  {!expanded ? (
                    <button
                      type="button"
                      disabled={!canOperate[batch.station]}
                      onClick={() => open(batch)}
                      className="h-9 shrink-0 rounded-[6px] bg-[#15803d] px-3 text-[12px] font-bold uppercase text-white disabled:opacity-55"
                    >
                      Selesaikan
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[11px] text-[#d1d5db]">
                  Order: {batch.allocations.map((a) => `#${a.orderNo ?? a.ticketNo ?? "-"}`).join(", ")}
                </p>
                {expanded && coverage ? (
                  <div className="mt-2 space-y-1.5 border-t border-[var(--phv4-border)] pt-2">
                    <p className="text-[11px] text-[var(--phv4-muted)]">
                      Cocokkan tiap porsi ke Nama + Meja + Order. Selesai hanya bila semua teralokasi.
                    </p>
                    {batch.allocations.map((a) => {
                      const on = a.allocated || checked.has(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setChecked((current) => {
                              const next = new Set(current);
                              if (next.has(a.id)) next.delete(a.id);
                              else next.add(a.id);
                              return next;
                            })
                          }
                          className={`flex min-h-10 w-full items-center gap-2 rounded-[6px] border px-2 text-left ${
                            on ? "border-[var(--phv4-success)] bg-[var(--phv4-success)]/10" : "border-[var(--phv4-border)]"
                          }`}
                        >
                          <span className={`grid size-5 shrink-0 place-items-center rounded border ${on ? "border-[var(--phv4-success)] bg-[var(--phv4-success)] text-[#052e16]" : "border-[#6b7280]"}`}>
                            {on ? <Check className="size-3.5" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">{a.identity}</span>
                            <span className="phv4-mono block truncate text-[11px] text-[var(--phv4-muted)]">
                              {tableText(a.table)} · #{a.orderNo ?? a.ticketNo ?? "-"}
                              {a.note ? ` · ${a.note}` : ""}
                            </span>
                          </span>
                          <span className="phv4-mono shrink-0 text-[14px] font-bold text-[var(--phv4-wait)]">{a.qty}×</span>
                        </button>
                      );
                    })}
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={!coverage.complete || busyKey === `complete:${batch.id}`}
                        onClick={async () => {
                          if (await onComplete(batch, [...checked])) setOpenBatch(null);
                        }}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[#15803d] text-[12px] font-bold uppercase text-white disabled:opacity-55"
                      >
                        {busyKey === `complete:${batch.id}` ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        {coverage.complete ? `Selesaikan batch (${batch.totalQty})` : `Belum teralokasi ${coverage.unallocatedQty}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenBatch(null)}
                        className="h-10 rounded-[6px] border border-[var(--phv4-border)] px-3 text-[12px] font-semibold"
                      >
                        Tutup
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Alasan batal batch"
                        aria-label="Alasan batal batch"
                        className="h-9 min-w-0 flex-1 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[12px] outline-none focus:border-[var(--phv4-red)]"
                      />
                      <button
                        type="button"
                        disabled={reason.trim().length < 3 || busyKey === `cancel:${batch.id}`}
                        onClick={async () => {
                          if (await onCancel(batch, reason.trim())) setOpenBatch(null);
                        }}
                        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[6px] border border-[var(--phv4-critical)]/60 px-2.5 text-[12px] font-semibold text-[#fecaca] disabled:opacity-50"
                      >
                        <X className="size-3.5" /> Batalkan
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="text-[12px] text-[var(--phv4-muted)]">Tidak ada batch berjalan.</p>
        )}
      </section>

      <section aria-label="Saran batch" className="space-y-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--phv4-muted)]">Bisa digabung</h3>
        {mineSuggestions.length ? (
          mineSuggestions.map((s) => (
            <div key={s.key} className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">
                    {s.itemLabel}{" "}
                    <span className="phv4-mono rounded bg-[var(--phv4-red)] px-1.5 text-[12px] text-white">{s.totalQty}×</span>
                  </p>
                  {s.note ? <p className="truncate text-[12px] font-semibold text-[#fde68a]">• {s.note}</p> : null}
                  <p className="truncate text-[11px] text-[#d1d5db]">
                    Order: {s.items.map((i) => `#${i.orderNo ?? i.ticketNo}`).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canOperate[s.station] || busyKey === `batch:${s.key}`}
                  onClick={() => onStart(s)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] bg-[var(--phv4-red)] px-3 text-[12px] font-bold uppercase text-white hover:bg-[var(--phv4-red-hover)] disabled:opacity-55"
                >
                  {busyKey === `batch:${s.key}` ? <Loader2 className="size-3.5 animate-spin" /> : <Layers className="size-3.5" />}
                  Mulai batch
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-[var(--phv4-muted)]">
            Belum ada porsi kompatibel (produk, varian & catatan sama) dari ≥2 order.
          </p>
        )}
      </section>
    </div>
  );
}
