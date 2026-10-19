"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import type { ApiEnvelope, DisplayQueueOrder } from "@/lib/garage-api-types";
import { formatTableDuration } from "@/lib/garage-tables";
import { TablePlate } from "@/components/garage/table-plate";

async function getQueue() {
  const response = await fetch("/api/display/customer-queue", { cache: "no-store" });
  const json = (await response.json()) as ApiEnvelope<DisplayQueueOrder[]>;
  if (!response.ok || json.error || !json.data) {
    throw new Error(json.error?.message ?? "Display queue gagal dimuat.");
  }
  return json.data;
}

type QueueStatus = "ready" | "cooking" | "queue";

type MergedOrder = {
  key: string;
  bigLabel: string;
  subLabel: string;
  /** Dine-in: tampil sebagai plat nomor meja. */
  isTable: boolean;
  status: QueueStatus;
  waitMinutes: number;
};

// Identitas ramah-layar: dine-in tampil NOMOR MEJA, takeaway/delivery tampil
// kode antrean ringkas dari orderNo (3 digit terakhir) supaya mudah dipanggil.
function displayLabel(order: DisplayQueueOrder): { big: string; sub: string; isTable?: boolean } {
  const table = (order.tableLabel ?? "").trim();
  const mejaMatch = table.match(/meja\s*0*(\d+)/i);
  const digits = (order.orderNo ?? order.ticketNo ?? "").replace(/\D/g, "");
  const code = digits.slice(-3) || "--";
  if (mejaMatch) {
    // Kode order kecil membedakan dua pesanan dari meja yang sama.
    return { big: mejaMatch[1].padStart(2, "0"), sub: `#${code}`, isTable: true };
  }
  if (/take|bawa/i.test(table)) return { big: code, sub: "TAKE AWAY" };
  if (/deliver|antar/i.test(table)) return { big: code, sub: "DELIVERY" };
  return { big: table || code, sub: "" };
}

function mergeOrders(orders: DisplayQueueOrder[]): MergedOrder[] {
  // Gabung tiket per-order (1 order bisa punya tiket Dapur + Bar) → 1 kartu.
  const groups = new Map<string, DisplayQueueOrder[]>();
  for (const o of orders) {
    const key = o.orderNo ?? o.ticketNo;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }

  const merged: MergedOrder[] = [];
  for (const [key, tix] of groups) {
    if (tix.every((t) => t.status === "delivered")) continue; // sudah diterima
    const anyCooking = tix.some((t) => t.status === "cooking");
    const anyQueue = tix.some((t) => t.status === "queue");
    const allDone = tix.every((t) => t.status === "ready" || t.status === "delivered");
    const status: QueueStatus = allDone ? "ready" : anyCooking ? "cooking" : anyQueue ? "queue" : "queue";
    const { big, sub, isTable } = displayLabel(tix[0]);
    merged.push({
      key,
      bigLabel: big,
      subLabel: sub,
      isTable: Boolean(isTable),
      status,
      waitMinutes: Math.max(0, ...tix.map((t) => t.elapsed)),
    });
  }
  return merged;
}

export function CustomerQueueDisplay() {
  const [orders, setOrders] = useState<DisplayQueueOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [clock, setClock] = useState("");

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
        if (alive) setError(caught instanceof Error ? caught.message : "Display queue gagal dimuat.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const intervalId = window.setInterval(load, 8_000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("id-ID"));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const grouped = useMemo(() => {
    const merged = mergeOrders(orders);
    return {
      ready: merged.filter((o) => o.status === "ready").sort((a, b) => b.waitMinutes - a.waitMinutes),
      cooking: merged.filter((o) => o.status === "cooking").sort((a, b) => b.waitMinutes - a.waitMinutes),
      queue: merged.filter((o) => o.status === "queue").sort((a, b) => b.waitMinutes - a.waitMinutes),
    };
  }, [orders]);

  return (
    // Layar TV: tinggi pas layar, setiap kolom scroll sendiri (kartu tidak hilang
    // di bawah). Layar kecil: halaman biasa yang bisa di-scroll.
    <main className="flex min-h-screen flex-col bg-[#0b0b0f] px-6 py-5 text-white lg:h-[100svh] lg:overflow-hidden">
      <header className="flex items-end justify-between border-b border-[#2a2a32] pb-4">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-[#f5a742]">
            GARAGE COFFEE
          </p>
          <h1 className="mt-1 text-[clamp(40px,6vw,84px)] font-black leading-none tracking-tight">
            ANTREAN PESANAN
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[clamp(20px,2.4vw,34px)] font-bold tabular-nums text-[#d6d6dc]">
            {clock}
          </span>
          <RefreshCw className={`size-6 text-[#f5a742] ${loading ? "animate-spin" : ""}`} />
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-4 text-lg text-[#ffc2c8]">
          {error} · terakhir sync {updatedAt ? updatedAt.toLocaleTimeString("id-ID") : "-"}
        </div>
      ) : null}

      <section className="mt-5 grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[1.15fr_1fr_0.9fr]">
        <QueueColumn
          title="SIAP DIAMBIL / DIANTAR"
          accent="#f5a742"
          highlight
          orders={grouped.ready}
          emptyText="Belum ada yang siap."
        />
        <QueueColumn
          title="SEDANG DIPROSES"
          accent="#d4d4d8"
          orders={grouped.cooking}
          emptyText="Dapur & bar kosong."
        />
        <QueueColumn
          title="MENUNGGU"
          accent="#9696a1"
          orders={grouped.queue}
          emptyText="Tidak ada antrean."
        />
      </section>
    </main>
  );
}

function QueueColumn({
  title,
  accent,
  orders,
  emptyText,
  highlight,
}: {
  title: string;
  accent: string;
  orders: MergedOrder[];
  emptyText: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex min-h-0 flex-col rounded-xl border bg-[#111116]/85 p-4"
      style={{ borderColor: highlight ? `${accent}66` : "#2a2a32" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[clamp(18px,1.8vw,26px)] font-black" style={{ color: accent }}>
          {title}
        </h2>
        <span
          className="rounded-md px-3 py-1 text-lg font-black tabular-nums"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {orders.length}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-1">
        {orders.length ? (
          orders.map((o) => (
            <article
              key={o.key}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
              style={{
                borderColor: highlight ? `${accent}80` : "#303038",
                backgroundColor: highlight ? `${accent}18` : "rgba(0,0,0,0.2)",
              }}
            >
              {o.isTable ? (
                <div className="flex min-w-0 items-center gap-3">
                  <TablePlate number={o.bigLabel} size="lg" numberClassName="text-[clamp(34px,4vw,56px)]" />
                  <p className="font-mono text-[13px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                    {o.subLabel}
                  </p>
                </div>
              ) : (
              <div className="min-w-0">
                {o.subLabel ? (
                  <p
                    className="font-mono text-[13px] font-bold uppercase tracking-wider"
                    style={{ color: accent }}
                  >
                    {o.subLabel}
                  </p>
                ) : null}
                <p className="text-[clamp(34px,4vw,60px)] font-black leading-none text-white">
                  {o.bigLabel}
                </p>
              </div>
              )}
              <div className="shrink-0 text-right">
                <p className="text-sm text-[#9a9aa2]">menunggu</p>
                <p className="text-2xl font-black tabular-nums text-[#e8e8ec]">{formatTableDuration(o.waitMinutes)}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-[#3a3a44] p-6 text-center text-lg text-[#7a7a84]">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
