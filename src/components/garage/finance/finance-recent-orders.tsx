"use client";

import { currency } from "@/lib/garage-data";

type RecentOrder = {
  id: string;
  orderNo: string;
  channel: string;
  total: number;
  tableLabel: string;
  paymentMethod: string;
  createdAt: string;
};

function formatTime(createdAt: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(createdAt));
}

export function FinanceRecentOrders({ rows }: { rows: RecentOrder[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#888]">Belum ada order paid.</p>;
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-md border border-[#34343c] bg-white/[0.03] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-bold text-white">
                  {row.orderNo}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[#b8b8bf]">
                  {row.tableLabel} · {row.channel}
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-[#ffd79a]">
                {currency.format(row.total)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <span className="rounded border border-[#3b82f6]/40 bg-[#3b82f6]/10 px-1.5 py-0.5 font-mono uppercase text-[#bae6fd]">
                {row.paymentMethod}
              </span>
              <span className="font-mono text-[#888]">{formatTime(row.createdAt)}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="garage-scroll-x hidden md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
              <th className="py-2 pr-2 text-left font-normal">Order No</th>
              <th className="py-2 pr-2 text-left font-normal">Meja</th>
              <th className="py-2 pr-2 text-left font-normal">Channel</th>
              <th className="py-2 pr-2 text-left font-normal">Bayar</th>
              <th className="py-2 pr-2 text-right font-normal">Total</th>
              <th className="py-2 text-left font-normal">Waktu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#23232a]">
                <td className="py-2 pr-2 font-mono text-xs text-white">{row.orderNo}</td>
                <td className="py-2 pr-2 text-xs text-[#d6d6dc]">{row.tableLabel}</td>
                <td className="py-2 pr-2 text-xs text-[#d6d6dc]">{row.channel}</td>
                <td className="py-2 pr-2 font-mono text-[10px] uppercase text-[#bae6fd]">
                  {row.paymentMethod}
                </td>
                <td className="py-2 pr-2 text-right font-mono font-semibold tabular-nums text-[#ffd79a]">
                  {currency.format(row.total)}
                </td>
                <td className="py-2 font-mono text-[10px] text-[#888]">
                  {formatTime(row.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
