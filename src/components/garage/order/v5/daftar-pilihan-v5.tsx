"use client";

// Daftar Pilihan Menu V5 (papan 03): baris berfoto (nama, varian, catatan, harga, stepper, hapus), subtotal,
// catatan mode, Kosongkan + tombol utama. Dipakai panel kanan desktop & lembar bawah HP, di kedua mode:
// - pesan sendiri  → tombol utama "Checkout" (alur lama),
// - Daftar Pilihan → "Tunjukkan ke Waiter" (layar besar + QR untuk waiter).
// Plus lembar "Tunjukkan ke Waiter": daftar besar, nomor meja, QR menuju mode Pesankan waiter yang terisi otomatis.
import { useEffect, useState, type ReactNode } from "react";
import { BellRing, ClipboardList, Info, Minus, Pencil, Plus, QrCode, ReceiptText, ShoppingBag, Trash2 } from "lucide-react";
import QRCode from "qrcode";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";
import { rupiah, variantPrice } from "../order-ui";

export type DaftarLine = { key: string; item: MenuItem; variant: MenuItem["variants"][number]; qty: number; note: string };

const PLAIN_VARIANT = /^(regular|reguler|biasa|default|all)$/i;

function variantText(line: DaftarLine) {
  return line.item.variants.length > 1 || !PLAIN_VARIANT.test(line.variant.label) ? line.variant.label : "";
}

export function DaftarListV5({
  lines,
  onAdjust,
  onEdit,
  compact = false,
}: {
  lines: DaftarLine[];
  onAdjust: (itemId: string, variantId: string, delta: number) => void;
  onEdit: (line: DaftarLine) => void;
  compact?: boolean;
}) {
  if (!lines.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 p-6 text-center">
        <ClipboardList className="size-7 text-[#a7a09b]" aria-hidden />
        <p className="text-base font-bold text-white">Daftar Pilihan masih kosong</p>
        <p className="text-sm text-[#cfc9c4]">Ketuk + pada menu untuk menambahkannya ke sini.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-white/10">
      {lines.map((line) => {
        const variant = variantText(line);
        return (
          <li key={line.key} className="flex items-center gap-3 py-3">
            <button type="button" onClick={() => onEdit(line)} className={`gm5-card-photo relative shrink-0 cursor-pointer overflow-hidden rounded-xl ${compact ? "size-12" : "size-14"}`} aria-label={`Ubah ${line.item.name}`}>
              <MenuPhoto item={line.item} hideLabel iconClassName="size-6" />
            </button>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onEdit(line)} className="block w-full cursor-pointer text-left">
                <span className="gm5-title block break-words text-[15px] leading-snug text-white">{line.item.name}</span>
                {variant ? <span className="block text-sm text-[#cfc9c4]">Varian: {variant}</span> : null}
                {line.note ? <span className="block break-words text-sm text-[var(--garage-amber)]">Catatan: {line.note}</span> : null}
              </button>
              <span className="mt-1 block font-mono text-[15px] font-bold tabular-nums text-white">{rupiah.format(variantPrice(line.item, line.variant) * line.qty)}</span>
            </div>
            <div className={`flex shrink-0 gap-2 ${compact ? "flex-col items-end" : "items-center"}`}>
              <span className="gm5-stepper">
                <button type="button" className="gm5-step gm5-step-minus" onClick={() => onAdjust(line.item.id, line.variant.id, -1)} aria-label={`Kurangi ${line.item.name}`}>
                  <Minus className="size-4" strokeWidth={2.6} aria-hidden />
                </button>
                <span className="gm5-step-count">{line.qty}</span>
                <button type="button" className="gm5-step gm5-step-plus" onClick={() => onAdjust(line.item.id, line.variant.id, 1)} disabled={line.item.stock === "sold_out"} aria-label={`Tambah ${line.item.name}`}>
                  <Plus className="size-4" strokeWidth={2.6} aria-hidden />
                </button>
              </span>
              <button
                type="button"
                onClick={() => onAdjust(line.item.id, line.variant.id, -line.qty)}
                className="gm5-icon-btn gm5-trash !h-10 !w-10"
                aria-label={`Hapus ${line.item.name} dari Daftar Pilihan`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DaftarSummaryV5({
  waiterList,
  hasItems,
  subtotal,
  total,
  billLines,
  onPrimary,
  onClear,
  primaryDisabled = false,
}: {
  waiterList: boolean;
  hasItems: boolean;
  subtotal: number;
  total: number;
  /** Rincian service/PB1/diskon (mode pesan sendiri). */
  billLines?: ReactNode;
  onPrimary: () => void;
  onClear: () => void;
  primaryDisabled?: boolean;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {hasItems ? (
        <div className="rounded-2xl border border-white/10 bg-[#141214] px-4 py-3">
          {waiterList || !billLines ? (
            <div className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2 font-semibold text-[#ede6dc]"><ReceiptText className="size-5" aria-hidden /> Subtotal</span>
              <span className="font-mono font-bold tabular-nums text-white">{rupiah.format(subtotal)}</span>
            </div>
          ) : (
            <div className="space-y-1.5 text-sm">{billLines}</div>
          )}
          {!waiterList ? (
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-2">
              <span className="text-base font-semibold text-[#ede6dc]">Estimasi Total</span>
              <strong className="font-mono text-xl font-bold tabular-nums text-white">{rupiah.format(total)}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {waiterList ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#b97a2c]/60 bg-[#f5a742]/10 px-4 py-3 text-sm leading-5 text-[#ede6dc]">
          <Info className="mt-0.5 size-5 shrink-0 text-[var(--garage-amber)]" aria-hidden />
          <span>
            <strong className="block text-white">Ini bukan proses checkout.</strong>
            Tunjukkan Daftar Pilihan ke waiter. Waiter mencatat pesanan resminya; harga akhir mengikuti kasir.
          </span>
        </div>
      ) : null}

      <div className="flex gap-2">
        {hasItems ? (
          confirmClear ? (
            <button type="button" onClick={() => { setConfirmClear(false); onClear(); }} className="gm5-btn-ghost min-h-12 shrink-0 px-4 text-sm !border-[var(--menu-red)]">
              <Trash2 className="size-4" aria-hidden /> Yakin kosongkan?
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="gm5-btn-ghost min-h-12 shrink-0 px-4 text-sm">
              <Trash2 className="size-4" aria-hidden /> Kosongkan
            </button>
          )
        ) : null}
        <button type="button" data-aya-anchor="checkout" onClick={onPrimary} disabled={!hasItems || primaryDisabled} className="gm5-btn-red min-h-12 min-w-0 flex-1 px-4 text-[15px]">
          {waiterList ? <QrCode className="size-5" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
          <span className="truncate">{waiterList ? "Tunjukkan ke Waiter" : "Checkout"}</span>
        </button>
      </div>
    </div>
  );
}

/** Lembar Daftar Pilihan di HP/tablet (papan 03, kondisi terbuka). */
export function DaftarSheetV5({
  open,
  onOpenChange,
  count,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gm5 inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[90svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[20px] border border-[color:var(--gm5-line)] bg-[#0e0e0e] p-0 text-white">
        <SheetHeader className="border-b border-white/10 p-4 pr-12 text-left">
          <SheetTitle className="gm5-title gm5-section-title font-menu-display text-xl font-bold text-white">
            Daftar Pilihan {count ? <span className="gm5-count gm5-pulse" key={count}>{count}</span> : null}
          </SheetTitle>
          <SheetDescription className="sr-only">Menu yang kamu pilih, jumlah, catatan, dan total.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Layar "Tunjukkan ke Waiter": daftar besar + QR yang membuka mode Pesankan waiter dengan daftar terisi. */
export function ShowToWaiterSheetV5({
  open,
  onOpenChange,
  lines,
  subtotal,
  tableLabel,
  dineIn,
  qrUrl,
  onCallWaiter,
  callBusy,
  callMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: DaftarLine[];
  subtotal: number;
  tableLabel: string;
  dineIn: boolean;
  /** URL Pesankan waiter berisi daftar (null = tanpa QR, mis. take away). */
  qrUrl: string | null;
  onCallWaiter?: () => void;
  callBusy?: boolean;
  callMessage?: string | null;
}) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!open || !qrUrl) return;
    QRCode.toDataURL(qrUrl, { errorCorrectionLevel: "M", margin: 1, width: 320, color: { dark: "#0e0e0e", light: "#ffffff" } })
      .then((data) => alive && setQr(data))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [open, qrUrl]);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gm5 inset-x-0 bottom-0 z-[96] mx-auto flex max-h-[96svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[20px] border border-[color:var(--gm5-line)] bg-[#0e0e0e] p-0 text-white">
        <SheetHeader className="border-b border-white/10 p-4 pr-12 text-left">
          <SheetTitle className="gm5-display font-menu-display text-2xl font-extrabold italic text-white">{dineIn ? "Tunjukkan ke Waiter" : "Tunjukkan ke Kasir"}</SheetTitle>
          <SheetDescription className="text-sm text-[#cfc9c4]">
            {dineIn && qrUrl ? "Waiter memindai kode ini untuk mencatat pesananmu." : "Tunjukkan layar ini kepada staf Garage."}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex min-w-[9rem] flex-col items-center rounded-2xl border border-[color:var(--gm5-line)] bg-[#141214] px-5 py-3 text-center">
              <span className="text-sm font-semibold text-[#cfc9c4]">{dineIn ? "Meja" : "Pesanan"}</span>
              <span className="gm5-display text-4xl text-white">{tableLabel.replace(/^Meja\s*/i, "")}</span>
              <span className="mt-1 text-sm text-[#cfc9c4]">{count} item</span>
            </div>
            {qrUrl ? (
              <div className="flex flex-col items-center gap-2" data-waiter-url={qrUrl}>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- QR data URL lokal
                  <img src={qr} alt="QR Daftar Pilihan untuk waiter" width={220} height={220} className="size-[220px] rounded-xl bg-white p-2" />
                ) : (
                  <span className="flex size-[220px] items-center justify-center rounded-xl bg-white/10 text-sm text-[#cfc9c4]">Menyiapkan QR…</span>
                )}
              </div>
            ) : null}
          </div>

          <ul className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#141214] px-4">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block break-words text-lg font-bold text-white">
                    <span className="font-mono tabular-nums text-[var(--menu-red-bright)]">{line.qty}×</span> {line.item.name}
                  </span>
                  {variantText(line) ? <span className="block text-base text-[#ede6dc]">{variantText(line)}</span> : null}
                  {line.note ? <span className="block break-words text-base text-[var(--garage-amber)]">Catatan: {line.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center justify-between px-1 text-base">
            <span className="text-[#cfc9c4]">Perkiraan harga menu</span>
            <span className="font-mono font-bold tabular-nums text-white">{rupiah.format(subtotal)}</span>
          </p>
          {callMessage ? <p className="mt-3 rounded-xl border border-white/10 bg-[#141214] px-4 py-3 text-sm text-[#ede6dc]" role="status">{callMessage}</p> : null}
        </div>
        <div className="flex gap-2 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => onOpenChange(false)} className="gm5-btn-ghost min-h-12 shrink-0 px-4 text-sm">
            <Pencil className="size-4" aria-hidden /> Edit Pesanan
          </button>
          {dineIn && onCallWaiter ? (
            <button type="button" onClick={onCallWaiter} disabled={callBusy} className="gm5-btn-red min-h-12 flex-1 px-4 text-[15px]">
              <BellRing className="size-5" aria-hidden /> {callBusy ? "Memanggil…" : "Panggil Waiter"}
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
