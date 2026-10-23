"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STORAGE_KEY = "garage:bundle-age-21";

/** Sudah konfirmasi 21+ di sesi ini (paket berisi rokok). */
export function bundleAgeConfirmed() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Konfirmasi 21+ hanya saat membuka paket berisi rokok; menu biasa tetap bebas. */
export function BundleAgeConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  function confirm() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* penyimpanan diblokir — konfirmasi berlaku untuk paket ini saja */
    }
    onConfirm();
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent data-testid="bundle-age-gate" className="border-t-4 border-t-garage-red sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="garage-display text-3xl leading-tight">Usia 21 tahun ke atas</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            Paket ini berisi produk tembakau dan hanya untuk pembeli berusia 21 tahun ke atas. Kasir dapat meminta kartu identitas saat penyerahan.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex gap-3">
          <Button type="button" variant="outline" className="min-h-12 flex-1 text-base" onClick={onCancel}>Belum 21</Button>
          <Button type="button" data-testid="bundle-age-yes" className="min-h-12 flex-1 text-base" onClick={confirm} autoFocus>Ya, saya 21+</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
