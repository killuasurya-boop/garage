"use client";

export function FinanceKpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "good" | "warn" | "info" | "amber" | "muted";
}) {
  const toneCls: Record<typeof tone, string> = {
    good: "border-[#22c55e]/45 bg-[#22c55e]/10",
    warn: "border-[#d11a2a]/55 bg-[#d11a2a]/12",
    info: "border-[#3b82f6]/45 bg-[#3b82f6]/10",
    amber: "border-[#f5a742]/55 bg-[#f5a742]/12",
    muted: "border-[#34343c] bg-white/[0.04]",
  };
  return (
    <div className={`rounded-lg border p-4 ${toneCls[tone]}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">{label}</p>
      <p className="mt-2 break-words text-xl font-black tabular-nums text-white sm:text-2xl">
        {value}
      </p>
      {sub && <p className="mt-1 text-[10px] text-[#b8b8bf]">{sub}</p>}
    </div>
  );
}

export function FinanceStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="garage-surface garage-hover-lift rounded-md p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-2 break-words text-lg font-semibold tabular-nums ${
          danger ? "text-red-200" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
