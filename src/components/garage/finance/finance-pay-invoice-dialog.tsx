"use client";

import { useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { currency } from "@/lib/garage-data";
import { garageApi } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type PayableInvoice = {
  id: string;
  supplier: string;
  invoiceNo: string;
  amount: number;
};

/**
 * Dialog konfirmasi bayar invoice supplier + input reference pembayaran.
 * Pengganti window.prompt sebelumnya. Form di-`key` per invoice supaya reset.
 */
export function FinancePayInvoiceDialog({
  invoice,
  onOpenChange,
  onDone,
}: {
  invoice: PayableInvoice | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={invoice !== null} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        {invoice ? (
          <PayForm
            key={invoice.id}
            invoice={invoice}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PayForm({
  invoice,
  onClose,
  onDone,
}: {
  invoice: PayableInvoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const [paymentRef, setPaymentRef] = useState("PAY-MANUAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await garageApi.post(`/api/finance/supplier-invoices/${invoice.id}/pay`, {
        paymentRef: paymentRef.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invoice supplier gagal dibayar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bayar invoice supplier</DialogTitle>
        <DialogDescription>
          Tandai invoice sebagai lunas dan catat reference pembayaran.
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="rounded-md border border-[#34343c] bg-black/15 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#b8b8bf]">Supplier</span>
            <span className="font-semibold text-white">{invoice.supplier}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[#b8b8bf]">Invoice</span>
            <span className="garage-mono text-xs text-[#d6d6dc]">
              {invoice.invoiceNo}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[#b8b8bf]">Nominal</span>
            <span className="garage-mono font-semibold text-[#ffd08a]">
              {currency.format(invoice.amount)}
            </span>
          </div>
        </div>
        <div>
          <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
            Reference pembayaran (opsional)
          </p>
          <Input
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="mis. TRF-BCA-0912"
            className="h-11 border-[#34343c] bg-white/[0.06]"
            autoFocus
          />
        </div>
        {error ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2 pt-1 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button type="submit" className="garage-press h-10" disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="mr-2 size-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Check className="mr-2 size-4" />
                Tandai lunas
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
