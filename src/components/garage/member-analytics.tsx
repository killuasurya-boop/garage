"use client";

import { useMemo } from "react";

type Transaction = {
  amount: number;
  pointsEarned: number;
  createdAt: string;
};

type Redemption = {
  pointsUsed: number;
  discount: number;
  createdAt: string;
};

const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "short" });
const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("id-ID");

function lastMonthsKeys(count: number) {
  const now = new Date();
  const result: Array<{ key: string; label: string; year: number; month: number }> = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    result.push({
      key,
      label: monthLabel.format(date),
      year: date.getFullYear(),
      month: date.getMonth(),
    });
  }
  return result;
}

function bucketByMonth<T extends { createdAt: string }>(
  rows: T[],
  monthsCount: number,
  pickValue: (row: T) => number,
) {
  const buckets = lastMonthsKeys(monthsCount).map((entry) => ({
    ...entry,
    value: 0,
  }));
  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  rows.forEach((row) => {
    const date = new Date(row.createdAt);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const slot = index.get(key);
    if (slot == null) return;
    buckets[slot].value += pickValue(row);
  });
  return buckets;
}

function BarChart({
  series,
  formatValue,
  accent,
  ariaLabel,
}: {
  series: Array<{ key: string; label: string; value: number }>;
  formatValue: (value: number) => string;
  accent: string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...series.map((entry) => entry.value));
  const chartHeight = 120;
  const barWidth = 36;
  const gap = 14;
  const padding = 8;
  const width = padding * 2 + series.length * barWidth + (series.length - 1) * gap;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${chartHeight + 38}`}
      className="block h-auto w-full"
      preserveAspectRatio="none"
    >
      {series.map((entry, i) => {
        const h = entry.value === 0 ? 4 : Math.max(4, (entry.value / max) * chartHeight);
        const x = padding + i * (barWidth + gap);
        const y = chartHeight - h + 4;
        return (
          <g key={entry.key}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx="3"
              fill={accent}
              opacity={entry.value === 0 ? 0.18 : 0.9}
            >
              <title>{`${entry.label}: ${formatValue(entry.value)}`}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={chartHeight + 22}
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fill="#9696a1"
              textAnchor="middle"
              letterSpacing="0.18em"
            >
              {entry.label.toUpperCase()}
            </text>
          </g>
        );
      })}
      <line
        x1={padding}
        x2={width - padding}
        y1={chartHeight + 6}
        y2={chartHeight + 6}
        stroke="#34343c"
        strokeWidth="1"
      />
    </svg>
  );
}

function TimelineChart({
  earnedSeries,
  redeemedSeries,
}: {
  earnedSeries: Array<{ key: string; label: string; value: number }>;
  redeemedSeries: Array<{ key: string; label: string; value: number }>;
}) {
  const combined = earnedSeries.map((entry, i) => ({
    label: entry.label,
    earned: entry.value,
    redeemed: redeemedSeries[i]?.value ?? 0,
  }));
  const max = Math.max(
    1,
    ...combined.flatMap((entry) => [entry.earned, entry.redeemed]),
  );
  const width = 320;
  const height = 100;
  const padding = 6;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  function toPath(values: number[]) {
    if (values.length === 0) return "";
    return values
      .map((value, i) => {
        const x = padding + (i / Math.max(1, values.length - 1)) * innerW;
        const y = padding + innerH - (value / max) * innerH;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const earnedPath = toPath(combined.map((entry) => entry.earned));
  const redeemedPath = toPath(combined.map((entry) => entry.redeemed));

  return (
    <svg
      role="img"
      aria-label="Point earned vs redeemed timeline"
      viewBox={`0 0 ${width} ${height + 24}`}
      className="block h-auto w-full"
      preserveAspectRatio="none"
    >
      <path d={earnedPath} fill="none" stroke="#f5a742" strokeWidth="2.4" />
      <path
        d={redeemedPath}
        fill="none"
        stroke="#d11a2a"
        strokeWidth="2.4"
        strokeDasharray="4 3"
      />
      {combined.map((entry, i) => {
        const x = padding + (i / Math.max(1, combined.length - 1)) * innerW;
        return (
          <text
            key={entry.label}
            x={x}
            y={height + 14}
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fill="#9696a1"
            textAnchor="middle"
            letterSpacing="0.18em"
          >
            {entry.label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

export function MemberAnalytics({
  transactions,
  redemptions,
}: {
  transactions: Transaction[];
  redemptions: Redemption[];
}) {
  const spendByMonth = useMemo(
    () => bucketByMonth(transactions, 6, (row) => row.amount),
    [transactions],
  );

  const earnedByMonth = useMemo(
    () => bucketByMonth(transactions, 6, (row) => row.pointsEarned),
    [transactions],
  );

  const redeemedByMonth = useMemo(
    () => bucketByMonth(redemptions, 6, (row) => row.pointsUsed),
    [redemptions],
  );

  const totals = useMemo(() => {
    const spend = transactions.reduce((acc, row) => acc + row.amount, 0);
    const earned = transactions.reduce((acc, row) => acc + row.pointsEarned, 0);
    const redeemed = redemptions.reduce((acc, row) => acc + row.pointsUsed, 0);
    return { spend, earned, redeemed };
  }, [transactions, redemptions]);

  return (
    <section className="garage-panel mt-6 min-w-0 p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="garage-mono">Analytics</p>
          <h2 className="garage-display text-3xl">Aktivitas 6 bulan</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono uppercase tracking-wider text-[#d0d0d6]">
            <span className="inline-block size-2 rounded-full bg-[#f5a742]" />
            Total spend {rupiah.format(totals.spend)}
          </span>
          <span className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono uppercase tracking-wider text-[#d0d0d6]">
            <span className="inline-block size-2 rounded-full bg-[#f5a742]" />
            Earned {number.format(totals.earned)} pts
          </span>
          <span className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono uppercase tracking-wider text-[#d0d0d6]">
            <span className="inline-block size-2 rounded-full bg-[#d11a2a]" />
            Redeemed {number.format(totals.redeemed)} pts
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="border border-white/8 bg-white/[0.03] p-4">
          <p className="garage-mono">Spend per bulan</p>
          <p className="mt-1 text-xs text-[#9696a1]">Berdasarkan transaksi member terakhir.</p>
          <div className="mt-4 overflow-x-auto">
            <BarChart
              series={spendByMonth}
              accent="#f5a742"
              formatValue={(value) => rupiah.format(value)}
              ariaLabel="Spend per bulan"
            />
          </div>
        </div>

        <div className="border border-white/8 bg-white/[0.03] p-4">
          <p className="garage-mono">Point earned vs redeemed</p>
          <p className="mt-1 text-xs text-[#9696a1]">
            Garis kuning = earn, garis merah putus-putus = redeem.
          </p>
          <div className="mt-4 overflow-x-auto">
            <TimelineChart
              earnedSeries={earnedByMonth}
              redeemedSeries={redeemedByMonth}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
