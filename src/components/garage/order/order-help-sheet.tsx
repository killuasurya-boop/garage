"use client";

import type { ReactNode } from "react";
import { Bell, CheckCircle2, FileText, GlassWater } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type HelpRequestType = "call" | "bill" | "water";

const HELP_ACTIONS = [
  { type: "call", label: "Panggil pelayan", hint: "Pelayan datang ke meja", Icon: Bell },
  { type: "bill", label: "Minta bill", hint: "Tagihan dibawa ke meja", Icon: FileText },
  { type: "water", label: "Air / tisu", hint: "Air putih atau tisu", Icon: GlassWater },
] as const;

// Sheet bantuan dine-in (dulu panel besar di atas menu). Aksi & chat tetap sama.
export function OrderHelpSheet({
  open,
  onOpenChange,
  tableLabel,
  busyType,
  message,
  onRequest,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableLabel: string;
  busyType: string | null;
  message: string;
  onRequest: (type: HelpRequestType, label: string) => void;
  /** Slot chat kasir. */
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="inset-x-0 bottom-0 z-[95] mx-auto w-full max-w-lg rounded-t-xl border-garage-line bg-garage-bg-1 p-0 text-white sm:bottom-4 sm:rounded-xl sm:border"
      >
        <SheetHeader className="border-b border-garage-line p-4 text-left">
          <SheetTitle className="text-lg font-bold text-white">Bantuan {tableLabel}</SheetTitle>
          <SheetDescription className="text-sm text-garage-dim">
            Pilih bantuan, staf GARAGE akan segera datang.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 p-4">
          {HELP_ACTIONS.map(({ type, label, hint, Icon }) => (
            <button
              key={type}
              type="button"
              disabled={busyType === type}
              onClick={() => onRequest(type, label)}
              className="garage-press flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-garage-line bg-garage-bg-2 px-4 text-left transition-colors hover:border-garage-amber/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon className="size-5 shrink-0 text-garage-amber" aria-hidden />
              <span className="min-w-0">
                <span className="block text-base font-bold text-white">
                  {busyType === type ? "Mengirim…" : label}
                </span>
                <span className="block text-sm text-garage-dim">{hint}</span>
              </span>
            </button>
          ))}
          {message ? (
            <p
              className="flex items-start gap-2 rounded-md border border-garage-success/40 bg-garage-success/10 px-3 py-2.5 text-sm font-semibold text-[#dcfce7]"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-garage-success" aria-hidden />
              {message}
            </p>
          ) : null}
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
