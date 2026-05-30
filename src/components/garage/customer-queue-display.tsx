"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";

import type { ApiEnvelope, DisplayQueueOrder } from "@/lib/garage-api-types";

async function getQueue() {
  const response = await fetch("/api/display/customer-queue", { cache: "no-store" });
  const json = (await response.json()) as ApiEnvelope<DisplayQueueOrder[]>;
  if (!response.ok || json.error || !json.data) {
    throw new Error(json.error?.message ?? "Display queue gagal dimuat.");
  }
  return json.data;
}

const statusLabel: Record<string, string> = {
  queue: "Antre",
  cooking: "Diproses",
  ready: "Siap",
  delivered: "Selesai",
};

const statusClass: Record<string, string> = {
  queue: "border-[#9696a1]/45 bg-white/[0.08] text-[#e8e8ec]",
  cooking: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  ready: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  delivered: "border-[#4a4a54] bg-[#222229] text-[#d0d0d6]",
};

export function CustomerQueueDisplay() {
  const [orders, setOrders] = useState<DisplayQueueOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await getQueue();
        if (alive) {
          setOrders(next);
          setUpdatedAt(new Date());
          setError(null);
        }
      } catch (caught) {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "Display queue gagal dimuat.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void load();
    const intervalId = window.setInterval(load, 10_000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const grouped = useMemo(
    () => ({
      ready: orders.filter((order) => order.status === "ready").slice(0, 12),
      cooking: orders.filter((order) => order.status === "cooking").slice(0, 12),
      queue: orders.filter((order) => order.status === "queue").slice(0, 12),
    }),
    [orders],
  );

  return (
    <main className="garage-shell min-h-screen overflow-hidden px-5 py-5 text-white sm:px-8">
      <header className="flex flex-col gap-3 border-b border-[#34343c] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="garage-mono text-xs uppercase tracking-[0.18em] text-[#b8b8bf]">
            GARAGE Coffee & Motor
          </p>
          <h1 className="garage-display mt-2 text-[clamp(42px,7vw,96px)] leading-none">
            Order Queue
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-2">
          <RefreshCw className={`size-4 text-[#f5a742] ${loading ? "animate-spin" : ""}`} />
          <span className="garage-mono text-xs text-[#d6d6dc]">
            {updatedAt ? updatedAt.toLocaleTimeString("id-ID") : "Memuat"}
          </span>
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-4 text-sm text-[#ffc2c8]">
          {error}
        </div>
      ) : null}

      <section className="mt-5 grid h-[calc(100vh-170px)] min-h-0 gap-4 lg:grid-cols-3">
        {[
          ["ready", "Siap Diambil / Diantar", grouped.ready],
          ["cooking", "Sedang Diproses", grouped.cooking],
          ["queue", "Masuk Antrean", grouped.queue],
        ].map(([key, title, rows]) => (
          <div key={String(key)} className="min-h-0 rounded-md border border-[#34343c] bg-[#111116]/84 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-white">{String(title)}</h2>
              <span className="garage-mono rounded-md border border-[#4a4a54] px-2 py-1 text-xs text-[#d6d6dc]">
                {(rows as DisplayQueueOrder[]).length}
              </span>
            </div>
            <div className="mt-4 grid max-h-[calc(100%-48px)] gap-3 overflow-y-auto pr-1">
              {(rows as DisplayQueueOrder[]).length ? (
                (rows as DisplayQueueOrder[]).map((order) => (
                  <article
                    key={`${order.ticketNo}-${order.status}`}
                    className="rounded-md border border-[#303038] bg-black/16 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="garage-mono text-xs text-[#8f8f98]">{order.ticketNo}</p>
                        <p className="mt-1 truncate text-2xl font-black text-white">
                          {order.orderNo ?? order.tableLabel}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#d6d6dc]">{order.tableLabel}</p>
                      </div>
                      <span className={`rounded-md border px-2 py-1 text-xs font-bold ${statusClass[order.status] ?? statusClass.queue}`}>
                        {statusLabel[order.status] ?? order.status}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-[#b8b8bf]">
                      <Clock className="size-3.5 text-[#f5a742]" />
                      {order.station} - target {order.targetMinutes}m
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-[#4a4a54] p-4 text-sm text-[#8f8f98]">
                  Tidak ada order.
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
