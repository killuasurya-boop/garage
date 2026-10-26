"use client";


export type PaymentStep = "summary" | "table" | "customer" | "payment" | "done";

export function BillRow({
  label,
  value,
  accent = false,
  large = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  large?: boolean;
}) {
  const labelClass = accent
    ? "text-[#f5a742]"
    : large
      ? "text-[#d6d6dc]"
      : "text-[#b8b8bf]";
  const valueClass = large
    ? "garage-mono text-right text-2xl font-bold text-white"
    : "garage-mono text-right text-sm font-semibold text-white";

  return (
    <div className={`pos-bill-row flex items-center justify-between gap-3 ${large ? "text-lg" : ""}`}>
      <span className={`pos-bill-label min-w-0 truncate ${labelClass}`}>
        {label}
      </span>
      <span className={`pos-bill-value shrink-0 tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

export type OpenBillSaved = {
  orderId: string;
  orderNo: string;
  total: number;
  tableLabel: string | null;
  customerName?: string | null;
};

export function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
