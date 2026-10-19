"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useState } from "react";

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

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export type InvoiceDeleteTarget = {
  id: string;
  orderNo: string;
  total: number;
  label: string;
  status: string;
};

// Hapus invoice BELUM LUNAS (Owner/Manajer, owner Okt 2026): wajib alasan +
// ketik ulang nomor invoice. Server menolak invoice lunas (pakai Batal/Refund)
// dan mencatat "Hapus invoice" di Audit Log.
export function PosInvoiceDeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: InvoiceDeleteTarget | null;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmNo, setConfirmNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = target?.status === "paid";
  const ready = Boolean(target) && !paid && reason.trim().length >= 5 && confirmNo.trim().toUpperCase() === target?.orderNo.toUpperCase();

  function close() {
    setReason("");
    setConfirmNo("");
    setError(null);
    onClose();
  }

  async function submit() {
    if (!target || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await garageApi.post(`/api/orders/${encodeURIComponent(target.id)}/delete`, {
        reason: reason.trim(),
        confirmOrderNo: confirmNo.trim(),
      });
      const message = `Invoice ${target.orderNo} dihapus (tercatat di Audit Log).`;
      setReason("");
      setConfirmNo("");
      onDeleted(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (!open ? close() : null)}>
      {target ? (
        <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md" data-testid="invoice-delete-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 aria-hidden className="size-5 text-[#ff6b78]" /> Hapus invoice
            </DialogTitle>
            <DialogDescription>
              Hanya untuk invoice yang BELUM dibayar. Pesanan dibatalkan di Bar/Dapur, stok bahan dikembalikan, dan
              tindakan ini tercatat di Audit Log atas nama Anda.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-[#3a3a44] bg-white/[0.05] p-3">
            <p className="font-mono text-sm font-bold text-white">{target.orderNo}</p>
            <p className="text-sm text-[#d4d4d8]">{target.label}</p>
            <p className="mt-1 text-xl font-black text-[#ffd08a]">{currency.format(target.total)}</p>
          </div>
          {paid ? (
            <p role="alert" className="flex gap-2 rounded-md border border-[#d11a2a]/60 bg-[#d11a2a]/15 p-3 text-sm font-semibold text-[#ffc2c8]">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              Invoice ini sudah LUNAS dan tidak bisa dihapus. Gunakan Batal / Refund dari Riwayat Struk Shift (wajib
              alasan, tercatat di audit).
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                Alasan hapus (wajib)
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="mis. Salah input / pelanggan batal"
                  className="h-11 border-[#4a4a54] bg-[#1b1b20]"
                  data-testid="invoice-delete-reason"
                />
              </label>
              <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                Ketik nomor invoice <span className="font-mono text-[#ffd08a]">{target.orderNo}</span> untuk konfirmasi
                <Input
                  value={confirmNo}
                  onChange={(event) => setConfirmNo(event.target.value)}
                  autoComplete="off"
                  className="h-11 border-[#4a4a54] bg-[#1b1b20] font-mono"
                  data-testid="invoice-delete-confirm"
                />
              </label>
            </div>
          )}
          {error ? (
            <p role="alert" className="rounded-md border border-[#d11a2a]/60 bg-[#d11a2a]/15 px-3 py-2 text-sm font-semibold text-[#ffb4bb]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {!paid ? (
              <Button
                type="button"
                data-testid="invoice-delete-submit"
                disabled={!ready || busy}
                className="garage-press h-11 flex-1 bg-[#d11a2a] text-white hover:bg-[#e5484d]"
                onClick={() => void submit()}
              >
                <Trash2 aria-hidden className="size-4" />
                {busy ? "Menghapus..." : "Ya, hapus invoice"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="garage-press h-11 flex-1 border-[#4a4a54]" onClick={close}>
              Batal
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
