"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Clock, Minus, Plus, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";

import { ManagerPinPanel } from "@/components/garage/manager-pin-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GarageApiError, garageApi } from "@/lib/api-client";
import { ORDER_CANCEL_REASONS, validateCancelReason } from "@/lib/approval-rules";
import { idempotencyAttemptFor, type IdempotencyAttempt } from "@/lib/idempotency-client";

function makeCancelKey() {
  return `batal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

type CancelMode = "void" | "refund";

type RefundableItem = {
  id: string;
  itemName: string;
  variantLabel: string;
  unitPrice: number;
  qty: number;
};

type RefundableOrder = {
  orderId: string;
  orderNo: string;
  status: string;
  subtotal: number;
  total: number;
  pendingApprovalId: string | null;
  pendingAmount: number | null;
  items: RefundableItem[];
};

type RequestResult = {
  approvalId: string | null;
  status: "pending" | "approved";
  refundAmount?: number;
};

export type OrderCancelTarget = {
  orderNo: string;
  tableLabel: string;
  total: number;
};

/**
 * Dialog POS untuk batal seluruh order (void) atau refund sebagian item.
 * Kasir → pengajuan masuk antrean Persetujuan, bisa langsung diputus dengan
 * PIN Manajer di tablet. Manajer/Owner → langsung dieksekusi & tercatat.
 */
export function PosOrderCancelDialog({
  target,
  onClose,
  onFinished,
}: {
  target: OrderCancelTarget | null;
  onClose: () => void;
  /** changed=true bila order benar-benar berubah (void/refund dieksekusi). */
  onFinished: (message: string, changed: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-lg">
        {target ? (
          <CancelFlow key={target.orderNo} target={target} onClose={onClose} onFinished={onFinished} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelFlow({
  target,
  onClose,
  onFinished,
}: {
  target: OrderCancelTarget;
  onClose: () => void;
  onFinished: (message: string, changed: boolean) => void;
}) {
  const [mode, setMode] = useState<CancelMode>("void");
  const [reasonCode, setReasonCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [order, setOrder] = useState<RefundableOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [refundQty, setRefundQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ approvalId: string; amount: number } | null>(null);
  const [showPin, setShowPin] = useState(false);
  const attemptRef = useRef<IdempotencyAttempt | null>(null);

  useEffect(() => {
    let cancelled = false;
    garageApi
      .get<RefundableOrder>(`/api/orders/${encodeURIComponent(target.orderNo)}/refund-request`)
      .then((data) => {
        if (cancelled) return;
        setOrder(data);
        if (data.pendingApprovalId) {
          setPending({ approvalId: data.pendingApprovalId, amount: data.pendingAmount ?? data.total });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat order.");
      })
      .finally(() => {
        if (!cancelled) setLoadingOrder(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target.orderNo]);

  const refundLines = useMemo(
    () =>
      (order?.items ?? [])
        .map((item) => ({ item, qty: refundQty[item.id] ?? 0 }))
        .filter((line) => line.qty > 0),
    [order, refundQty],
  );
  const refundSubtotal = refundLines.reduce((sum, line) => sum + line.item.unitPrice * line.qty, 0);
  // Perkiraan tampilan saja — angka final dihitung server (service/pajak proporsional).
  const refundEstimate =
    order && order.subtotal > 0 ? Math.round((order.total * refundSubtotal) / order.subtotal) : 0;
  const alreadyVoided = order?.status === "voided";

  function changeQty(item: RefundableItem, delta: number) {
    setError(null);
    setRefundQty((current) => {
      const next = Math.max(0, Math.min(item.qty, (current[item.id] ?? 0) + delta));
      return { ...current, [item.id]: next };
    });
  }

  async function submit() {
    const reasonError = validateCancelReason(reasonCode, note);
    if (reasonError) {
      setError(reasonError);
      return;
    }
    if (mode === "refund" && refundLines.length === 0) {
      setError("Pilih minimal satu item untuk direfund.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const path = `/api/orders/${encodeURIComponent(target.orderNo)}/${
      mode === "void" ? "void-request" : "refund-request"
    }`;
    const body =
      mode === "void"
        ? { reasonCode, note: note.trim() || null }
        : {
            reasonCode,
            note: note.trim() || null,
            items: refundLines.map((line) => ({ orderItemId: line.item.id, qty: line.qty })),
          };
    // Key sama selama isi sama → kirim ulang setelah koneksi putus tidak
    // membatalkan/merefund dua kali.
    const attempt = idempotencyAttemptFor(attemptRef.current, { path, body }, makeCancelKey);
    attemptRef.current = attempt;
    try {
      const result = await garageApi.post<RequestResult>(path, body, {
        headers: { "X-Idempotency-Key": attempt.key },
      });
      attemptRef.current = null;
      if (result.status === "approved" || !result.approvalId) {
        onFinished(
          mode === "void"
            ? `Order ${target.orderNo} dibatalkan. Stok & kas sudah disesuaikan.`
            : `Refund ${currency.format(result.refundAmount ?? refundEstimate)} untuk ${target.orderNo} selesai.`,
          true,
        );
        return;
      }
      setPending({
        approvalId: result.approvalId,
        amount: mode === "void" ? target.total : (result.refundAmount ?? refundEstimate),
      });
    } catch (err) {
      const network = err instanceof GarageApiError && err.code === "NETWORK_ERROR";
      if (!network) attemptRef.current = null;
      setError(
        network
          ? "Koneksi terputus — pengajuan belum pasti terkirim. Tekan Kirim lagi setelah server/WiFi normal (aman, tidak dobel)."
          : err instanceof Error
            ? err.message
            : "Gagal mengirim pengajuan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (pending) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-[#f5a742]" />
            Menunggu persetujuan
          </DialogTitle>
          <DialogDescription>
            {target.orderNo} · {currency.format(pending.amount)} · ID {pending.approvalId}
          </DialogDescription>
        </DialogHeader>
        <div className="garage-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {showPin ? (
            <ManagerPinPanel
              approvalId={pending.approvalId}
              onCancel={() => setShowPin(false)}
              onDecided={(status, decidedByName) => {
                const by = decidedByName ? ` oleh ${decidedByName}` : "";
                onFinished(
                  status === "approved"
                    ? `Pengajuan ${target.orderNo} disetujui${by}. Stok & kas sudah disesuaikan.`
                    : `Pengajuan ${target.orderNo} ditolak${by}.`,
                  status === "approved",
                );
              }}
            />
          ) : (
            <>
              <p className="rounded-md border border-[#34343c] bg-[#17171c] p-3 text-sm text-[#d6d6dc]">
                Pengajuan sudah masuk antrean <strong className="text-white">Persetujuan</strong>.
                Order belum berubah sampai Manajer/Owner menyetujui.
              </p>
              <Button
                type="button"
                className="garage-press h-12 w-full gap-2 bg-[#f5a742] font-bold text-black hover:bg-[#ffb85c]"
                onClick={() => setShowPin(true)}
              >
                <ShieldCheck className="size-4" />
                Manajer ada di sini — putuskan dengan PIN
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-11 w-full border-[#4a4a54]"
                onClick={() =>
                  onFinished(
                    `Pengajuan ${target.orderNo} menunggu keputusan Manajer di modul Persetujuan.`,
                    false,
                  )
                }
              >
                Tutup — Manajer putuskan nanti
              </Button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Ban className="size-5 text-[#d11a2a]" />
          Batal / Refund {target.orderNo}
        </DialogTitle>
        <DialogDescription>
          {target.tableLabel} · Total {currency.format(target.total)}
        </DialogDescription>
      </DialogHeader>

      <div className="garage-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {alreadyVoided ? (
          <p className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
            Order ini sudah dibatalkan.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#34343c] bg-black/30 p-1">
          <ModeButton active={mode === "void"} onClick={() => setMode("void")} icon={<Ban className="size-4" />}>
            Batalkan seluruh order
          </ModeButton>
          <ModeButton
            active={mode === "refund"}
            onClick={() => setMode("refund")}
            icon={<RotateCcw className="size-4" />}
            disabled={order?.status !== "paid"}
          >
            Refund sebagian item
          </ModeButton>
        </div>

        {mode === "void" ? (
          <p className="rounded-md border border-[#34343c] bg-[#17171c] p-3 text-xs leading-relaxed text-[#d6d6dc]">
            Seluruh order dibatalkan: stok bahan dikembalikan, pembayaran ditandai batal, dan uang
            tunai mengurangi kas seharusnya shift. Struk lama wajib dimusnahkan.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="garage-mono text-[11px] uppercase tracking-wide text-[#b8b8bf]">
              Pilih item & jumlah yang dikembalikan
            </p>
            {loadingOrder ? (
              <p className="flex items-center gap-2 text-sm text-[#b8b8bf]">
                <RefreshCw className="size-4 animate-spin" /> Memuat item...
              </p>
            ) : (
              <div className="space-y-1.5">
                {(order?.items ?? []).map((item) => {
                  const qty = refundQty[item.id] ?? 0;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-md border p-2.5 ${
                        qty > 0 ? "border-[#f5a742]/55 bg-[#f5a742]/10" : "border-[#34343c] bg-[#17171c]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">
                          {item.itemName}
                          {item.variantLabel ? (
                            <span className="text-[#b8b8bf]"> · {item.variantLabel}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-[#b8b8bf]">
                          {currency.format(item.unitPrice)} × {item.qty} dibeli
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Kurangi ${item.itemName}`}
                          className="garage-press size-10 border-[#4a4a54]"
                          onClick={() => changeQty(item, -1)}
                          disabled={qty === 0}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-8 text-center font-mono text-base font-bold text-white">{qty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Tambah ${item.itemName}`}
                          className="garage-press size-10 border-[#4a4a54]"
                          onClick={() => changeQty(item, 1)}
                          disabled={qty >= item.qty}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border border-[#34343c] bg-black/30 px-3 py-2">
              <span className="text-xs text-[#b8b8bf]">Perkiraan uang kembali (termasuk service & pajak)</span>
              <span className="garage-mono text-base font-extrabold text-[#ffd79a]">
                {currency.format(refundEstimate)}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="garage-mono text-[11px] uppercase tracking-wide text-[#b8b8bf]">Alasan (wajib)</p>
          <div className="flex flex-wrap gap-1.5">
            {ORDER_CANCEL_REASONS.map((reason) => (
              <button
                key={reason.code}
                type="button"
                onClick={() => {
                  setReasonCode(reason.code);
                  setError(null);
                }}
                className={`garage-press rounded-md border px-3 py-2 text-xs font-semibold ${
                  reasonCode === reason.code
                    ? "border-[#f5a742] bg-[#f5a742] text-black"
                    : "border-[#34343c] bg-white/[0.05] text-[#d6d6dc] hover:border-[#4a4a54]"
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={200}
            placeholder={reasonCode === "lainnya" ? "Wajib: jelaskan alasannya..." : "Catatan tambahan (opsional)"}
            className="w-full rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white"
          />
        </div>

        {error ? <p className="text-sm font-semibold text-[#ffc2c8]">{error}</p> : null}
      </div>

      <div className="flex gap-2 border-t border-[#34343c] pt-3">
        <Button
          type="button"
          variant="outline"
          className="garage-press h-11 flex-1 border-[#4a4a54]"
          onClick={onClose}
          disabled={submitting}
        >
          Batal
        </Button>
        <Button
          type="button"
          className="garage-press h-11 flex-1 gap-1.5 bg-[#d11a2a] font-bold text-white hover:bg-[#e72c3c]"
          onClick={() => void submit()}
          disabled={submitting || loadingOrder || alreadyVoided}
        >
          {submitting ? <RefreshCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Kirim pengajuan
        </Button>
      </div>
    </>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`garage-press flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-bold disabled:opacity-40 ${
        active ? "bg-[#f5a742] text-black" : "text-[#d6d6dc] hover:bg-white/[0.05]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
