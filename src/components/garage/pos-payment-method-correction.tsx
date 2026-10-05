"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, KeyRound, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";

const METHODS = ["Cash", "QRIS", "Bank Transfer", "E-Wallet"] as const;
type Method = (typeof METHODS)[number];

const METHOD_LABEL: Record<Method, string> = {
  Cash: "Tunai",
  QRIS: "QRIS",
  "Bank Transfer": "Transfer",
  "E-Wallet": "E-Wallet",
};

type ShiftTransactions = {
  orders: Array<{
    id: string;
    orderNo: string;
    status: string;
    total: number;
    tableLabel: string;
    customerName: string | null;
    createdAt: string;
    payments: Array<{
      id: string;
      method: string;
      amount: number;
      status: string;
      cashSessionId: string | null;
    }>;
  }>;
};

type CorrectionResult = { orderNo: string; from: string; to: string; cashDelta: number };

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const clock = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

function methodGroup(method: string): Method | null {
  const value = method.toLowerCase();
  if (value.includes("cash") || value.includes("tunai")) return "Cash";
  if (value.includes("qris")) return "QRIS";
  if (value.includes("transfer") || value.includes("bank")) return "Bank Transfer";
  if (value.includes("wallet")) return "E-Wallet";
  return null;
}

/**
 * Koreksi metode bayar selama shift masih terbuka: pelanggan bayar QRIS tapi
 * tercatat Tunai (atau sebaliknya) → selisih laci palsu. Kasir wajib PIN
 * Manajer/Owner; kas seharusnya disesuaikan otomatis dan tercatat di audit.
 */
export function PaymentMethodCorrectionDialog({
  open,
  onOpenChange,
  cashSessionId,
  requiresPin,
  onCorrected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashSessionId: string | null;
  requiresPin: boolean;
  onCorrected?: (result: CorrectionResult) => void;
}) {
  const [data, setData] = useState<ShiftTransactions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<{ orderId: string; orderNo: string; paymentId: string; method: string; amount: number } | null>(null);
  const [newMethod, setNewMethod] = useState<Method | null>(null);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CorrectionResult | null>(null);

  const load = useCallback(async () => {
    if (!cashSessionId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setData(
        await garageApi.get<ShiftTransactions>(`/api/finance/cash-sessions/${cashSessionId}/transactions`, {
          cache: "no-store",
        }),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Transaksi shift gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [cashSessionId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat transaksi saat dialog dibuka
    void load();
  }, [open, load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.orders ?? [])
      .flatMap((order) =>
        order.payments
          .filter((payment) => payment.status === "captured" && payment.cashSessionId === cashSessionId)
          .map((payment) => ({ order, payment })),
      )
      .filter(
        ({ order }) =>
          !q ||
          order.orderNo.toLowerCase().includes(q) ||
          order.tableLabel.toLowerCase().includes(q) ||
          (order.customerName ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt));
  }, [data, query, cashSessionId]);

  function pick(order: ShiftTransactions["orders"][number], payment: ShiftTransactions["orders"][number]["payments"][number]) {
    setTarget({ orderId: order.id, orderNo: order.orderNo, paymentId: payment.id, method: payment.method, amount: payment.amount });
    setNewMethod(null);
    setReason("");
    setPin("");
    setError(null);
    setDone(null);
  }

  async function submit() {
    if (!target || !newMethod) {
      setError("Pilih metode yang benar.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Tulis alasan singkat, mis. pelanggan bayar QRIS.");
      return;
    }
    if (requiresPin && !/^\d{4,8}$/.test(pin)) {
      setError("Minta Manajer/Owner memasukkan PIN (4–8 digit).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await garageApi.post<CorrectionResult>(`/api/orders/${target.orderId}/payment-method`, {
        paymentId: target.paymentId,
        method: newMethod,
        reason: reason.trim(),
        ...(requiresPin ? { managerPin: pin } : {}),
      });
      setDone(result);
      setTarget(null);
      onCorrected?.(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Koreksi gagal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Koreksi metode bayar</DialogTitle>
          <DialogDescription>
            Salah pilih Tunai/QRIS/Transfer? Koreksi di sini sebelum tutup shift supaya selisih laci
            tidak salah. {requiresPin ? "Wajib PIN Manajer/Owner. " : ""}Tercatat di audit.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="rounded-md border border-[#4a4a54] bg-white/[0.06] p-3 text-sm text-[#f4f4f5]" role="status">
            {done.orderNo}: {done.from} → <strong>{done.to}</strong>.{" "}
            {done.cashDelta === 0
              ? "Kas seharusnya tidak berubah."
              : `Kas seharusnya ${done.cashDelta > 0 ? "bertambah" : "berkurang"} ${rupiah(Math.abs(done.cashDelta))}.`}
          </p>
        ) : null}

        {target ? (
          <div className="space-y-3 rounded-md border border-[#f5a742]/50 bg-[#f5a742]/10 p-3">
            <p className="text-sm text-white">
              <strong>{target.orderNo}</strong> · {rupiah(target.amount)} · tercatat{" "}
              <strong>{target.method}</strong>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METHODS.filter((method) => method !== methodGroup(target.method)).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setNewMethod(method)}
                  className={`garage-press min-h-11 rounded-md border px-2 text-sm font-bold transition ${
                    newMethod === method
                      ? "border-[#f5a742] bg-[#f5a742] text-[#111116]"
                      : "border-[#4a4a54] bg-white/[0.055] text-[#f4f4f5] hover:border-[#f5a742]/70"
                  }`}
                >
                  {METHOD_LABEL[method]}
                </button>
              ))}
            </div>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Alasan, mis. pelanggan bayar QRIS, salah tekan Tunai"
              maxLength={200}
              className="h-11 border-[#4a4a54] bg-black/30"
              aria-label="Alasan koreksi"
            />
            {requiresPin ? (
              <div>
                <label htmlFor="correction-pin" className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#ffd08a]">
                  <KeyRound className="size-3.5" /> PIN Manajer/Owner
                </label>
                <Input
                  id="correction-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="h-11 border-[#4a4a54] bg-black/30 font-mono tracking-[0.3em]"
                />
              </div>
            ) : null}
            {error ? (
              <p className="text-sm text-[#ffb3b3]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setTarget(null)}>
                Batal
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 gap-2 bg-[#d11a2a] hover:bg-[#b8131f]"
                disabled={saving}
                onClick={() => void submit()}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
                Simpan koreksi
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari no. order, meja, atau nama"
              className="h-10 flex-1 border-[#34343c] bg-white/[0.06]"
              aria-label="Cari transaksi"
            />
            <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => void load()}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
            </Button>
          </div>
        )}

        {!target ? (
          <div className="garage-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loadError ? (
              <p className="text-sm text-[#ffb3b3]" role="alert">
                {loadError}
              </p>
            ) : null}
            {loading && !data ? (
              <p className="flex items-center gap-2 py-6 text-sm text-[#b8b8bf]">
                <Loader2 className="size-4 animate-spin" /> Memuat transaksi shift…
              </p>
            ) : null}
            {data && rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#8f8f99]">Belum ada pembayaran lunas di shift ini.</p>
            ) : null}
            {rows.map(({ order, payment }) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {order.orderNo} · {order.tableLabel}
                  </p>
                  <p className="text-xs text-[#b8b8bf]">
                    {clock(order.createdAt)}
                    {order.customerName ? ` · ${order.customerName}` : ""} ·{" "}
                    <span className="font-semibold text-[#f4f4f5]">{payment.method}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="garage-mono text-sm font-bold text-[#ffd08a]">{rupiah(payment.amount)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-1.5 border-[#4a4a54] px-2.5 text-xs"
                    onClick={() => pick(order, payment)}
                  >
                    <ArrowRightLeft className="size-3.5" /> Ubah
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
