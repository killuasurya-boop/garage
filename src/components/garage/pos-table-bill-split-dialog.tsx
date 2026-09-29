"use client";

import { useRef, useState } from "react";
import { Minus, Plus, RefreshCw, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GarageApiError, garageApi } from "@/lib/api-client";
import { applyRoundingMode } from "@/lib/garage-billing";
import { idempotencyAttemptFor, type IdempotencyAttempt } from "@/lib/idempotency-client";

function makeSplitKey() {
  return `pisah-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
import type { TableOrderBill } from "@/lib/garage-api-types";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export type TableBillSplitResult = {
  source: { id: string; orderNo: string; total: number };
  child: { id: string; orderNo: string; total: number; customerName: string | null };
};

/**
 * Pisah bill meja per produk: pilih item milik satu tamu → pindah ke bill baru
 * di meja yang sama. Ulangi untuk tamu berikutnya. Tiap bill lalu dibayar sendiri.
 */
export function PosTableBillSplitDialog({
  bill,
  tableLabel,
  roundingMode,
  onClose,
  onSplit,
}: {
  bill: TableOrderBill | null;
  tableLabel: string;
  roundingMode: string;
  onClose: () => void;
  onSplit: (result: TableBillSplitResult) => void;
}) {
  return (
    <Dialog open={Boolean(bill)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-lg">
        {bill ? (
          <SplitForm key={bill.id} bill={bill} tableLabel={tableLabel} roundingMode={roundingMode} onClose={onClose} onSplit={onSplit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SplitForm({
  bill,
  tableLabel,
  roundingMode,
  onClose,
  onSplit,
}: {
  bill: TableOrderBill;
  tableLabel: string;
  roundingMode: string;
  onClose: () => void;
  onSplit: (result: TableBillSplitResult) => void;
}) {
  const attemptRef = useRef<IdempotencyAttempt | null>(null);
  const [moveQty, setMoveQty] = useState<Record<string, number>>({});
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billSubtotal = bill.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const selected = bill.items
    .map((item) => ({ item, qty: moveQty[item.id] ?? 0 }))
    .filter((line) => line.qty > 0);
  const selectedSubtotal = selected.reduce((sum, line) => sum + line.item.unitPrice * line.qty, 0);
  // Rumus sama dengan server: proporsional, dibulatkan sesuai aturan outlet,
  // bill asal menerima sisanya.
  const proportional =
    billSubtotal > 0 ? bill.total - Math.round((bill.total * (billSubtotal - selectedSubtotal)) / billSubtotal) : 0;
  const estimate = Math.min(bill.total, Math.max(0, applyRoundingMode(proportional, roundingMode)));
  const totalUnits = bill.items.reduce((sum, item) => sum + item.qty, 0);
  const selectedUnits = selected.reduce((sum, line) => sum + line.qty, 0);
  const takesEverything = selectedUnits >= totalUnits;

  function change(itemId: string, max: number, delta: number) {
    setError(null);
    setMoveQty((current) => ({
      ...current,
      [itemId]: Math.max(0, Math.min(max, (current[itemId] ?? 0) + delta)),
    }));
  }

  async function submit() {
    if (!selected.length) {
      setError("Pilih item milik tamu yang akan dipisah.");
      return;
    }
    if (takesEverything) {
      setError("Sisakan minimal satu item di bill asal.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      guestName: guestName.trim() || null,
      items: selected.map((line) => ({ orderItemId: line.item.id, qty: line.qty })),
    };
    // Key sama selama isi sama → "Pisahkan" diulang setelah koneksi putus tidak memisah dua kali.
    const attempt = idempotencyAttemptFor(attemptRef.current, body, makeSplitKey);
    attemptRef.current = attempt;
    try {
      const result = await garageApi.post<TableBillSplitResult>(
        `/api/customer/orders/${encodeURIComponent(bill.id)}/split`,
        body,
        { headers: { "X-Idempotency-Key": attempt.key } },
      );
      attemptRef.current = null;
      onSplit(result);
    } catch (err) {
      const network = err instanceof GarageApiError && err.code === "NETWORK_ERROR";
      if (!network) attemptRef.current = null;
      setError(
        network
          ? "Koneksi terputus — pemisahan belum pasti. Tekan Pisahkan lagi setelah server/WiFi normal (aman, tidak dobel)."
          : err instanceof Error
            ? err.message
            : "Gagal memisah bill.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Scissors className="size-5 text-[#f5a742]" />
          Pisah bill {bill.orderNo}
        </DialogTitle>
        <DialogDescription>
          {tableLabel} · pilih item milik satu tamu. Item itu pindah ke bill baru yang dibayar
          terpisah. Ulangi untuk tamu berikutnya.
        </DialogDescription>
      </DialogHeader>

      <div className="garage-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div>
          <label htmlFor="split-guest-name" className="garage-mono text-[11px] uppercase tracking-wide text-[#b8b8bf]">
            Nama tamu (opsional)
          </label>
          <Input
            id="split-guest-name"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            maxLength={60}
            placeholder="Misal: Budi / kursi 2"
            className="mt-1 h-11 border-[#34343c] bg-white/[0.06]"
          />
        </div>

        <div className="space-y-1.5">
          {bill.items.map((item) => {
            const qty = moveQty[item.id] ?? 0;
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
                    {item.variantLabel ? <span className="text-[#b8b8bf]"> · {item.variantLabel}</span> : null}
                  </p>
                  <p className="text-xs text-[#b8b8bf]">
                    {currency.format(item.unitPrice)} × {item.qty}
                    {item.note ? <span className="italic"> · {item.note}</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Kurangi ${item.itemName}`}
                    className="garage-press size-10 border-[#4a4a54]"
                    onClick={() => change(item.id, item.qty, -1)}
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
                    onClick={() => change(item.id, item.qty, 1)}
                    disabled={qty >= item.qty}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md border border-[#34343c] bg-black/30 p-3 text-sm">
          <div>
            <p className="text-xs text-[#b8b8bf]">Bill baru (perkiraan)</p>
            <p className="garage-mono text-base font-extrabold text-[#ffd79a]">{currency.format(estimate)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#b8b8bf]">Sisa bill asal</p>
            <p className="garage-mono text-base font-extrabold text-white">
              {currency.format(bill.total - estimate)}
            </p>
          </div>
          <p className="col-span-2 text-[11px] text-[#b8b8bf]">
            Service & pajak ikut dibagi sesuai harga item. Status dapur tidak berubah.
          </p>
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
          className="garage-press h-11 flex-1 gap-1.5 bg-[#f5a742] font-bold text-black hover:bg-[#ffb85c]"
          onClick={() => void submit()}
          disabled={submitting || !selected.length || takesEverything}
        >
          {submitting ? <RefreshCw className="size-4 animate-spin" /> : <Scissors className="size-4" />}
          Pisahkan
        </Button>
      </div>
    </>
  );
}
