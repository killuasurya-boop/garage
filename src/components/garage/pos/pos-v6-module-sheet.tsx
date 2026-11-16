"use client";

// Modul jadi popup (Owner, Nov 2026): Riwayat Penjualan, Riwayat/Laporan Shift, Petty Cash, Catatan
// Kejadian, PDF & halaman internal dibuka di dalam POS — tidak menambah tab browser. Komponen modul
// sama dengan halamannya (aturan akses & blind count tetap dari server/komponen itu sendiri).
import { Download, ExternalLink, Printer, X } from "lucide-react";
import { useRef } from "react";

import { CashierShiftReport } from "@/components/garage/cashier-shift-report";
import { DeskFinance } from "@/components/garage/partner-hub/desk-finance";
import { DeskOrders } from "@/components/garage/partner-hub/desk-orders";
import { SalesHistoryView } from "@/components/garage/sales-history";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type PosModuleView =
  | { kind: "sales"; title: string }
  | { kind: "shift"; title: string; tab?: string }
  | { kind: "partners"; title: string; tab: "orders" | "finance" }
  | { kind: "frame"; title: string; url: string };

const SHIFT_TABS = ["active", "history", "sales", "full", "petty", "incident"];

/** Path internal → tampilan popup. Path lain (atau host luar) = null (biarkan apa adanya). */
export function moduleViewForPath(path: string, title = "Dokumen"): PosModuleView | null {
  let url: URL;
  try {
    url = new URL(path, "http://pos.local");
  } catch {
    return null;
  }
  if (url.origin !== "http://pos.local") return null;
  if (url.pathname === "/sales-history") return { kind: "sales", title: "Riwayat Penjualan" };
  if (url.pathname === "/shift") {
    const tab = url.searchParams.get("tab") ?? undefined;
    const label = tab === "petty" ? "Petty Cash" : tab === "incident" ? "Catatan Kejadian" : "Riwayat & Laporan Shift";
    return { kind: "shift", title: label, tab: tab && SHIFT_TABS.includes(tab) ? tab : undefined };
  }
  // Partner Hub (Owner 16 Nov 2026): Pesanan Mitra & Penjualan/Setoran Mitra tampil sebagai panel asli di POS
  // (bukan iframe halaman /partners). Tab lain (Kelola/Pendaftar) tetap halaman penuh.
  if (url.pathname === "/partners") {
    const tab = url.searchParams.get("tab");
    if (!tab || tab === "orders") return { kind: "partners", title: "Pesanan Mitra", tab: "orders" };
    if (tab === "finance") return { kind: "partners", title: "Penjualan & Setoran Mitra", tab: "finance" };
  }
  // PDF unduhan internal → tampil inline di popup.
  if (/^\/api\/(finance\/cash-sessions\/[^/]+\/report|orders\/[^/]+\/invoice)$/.test(url.pathname)) {
    url.searchParams.set("inline", "1");
  }
  return { kind: "frame", title, url: `${url.pathname}${url.search}${url.hash}` };
}

export function PosV6ModuleSheet({
  view,
  onClose,
  role,
  partner,
}: {
  view: PosModuleView | null;
  onClose: () => void;
  role: string;
  /** Data penampil Partner Hub (panel Pesanan Mitra di POS). */
  partner?: { userId: string; canHandleMoney: boolean; slaAccept: number; slaReady: number };
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const isOwner = role === "Owner";
  const canSupervise = role === "Owner" || role === "Manajer";
  return (
    <Dialog open={Boolean(view)} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        showCloseButton={false}
        className="pos-v6-module flex h-[96svh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1280px,calc(100vw-2rem))]"
        data-testid="pos-module-sheet"
      >
        <div className="pos-v6-module-head flex shrink-0 items-center gap-2 px-3 py-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-base font-extrabold">{view?.title ?? "Modul"}</DialogTitle>
          <DialogDescription className="sr-only">Modul dibuka di dalam POS tanpa tab baru.</DialogDescription>
          {view?.kind === "frame" ? (
            <>
              <button
                type="button"
                className="pos-v6-module-btn"
                onClick={() => frameRef.current?.contentWindow?.print()}
                aria-label="Cetak"
              >
                <Printer className="size-4" aria-hidden /> <span className="hidden sm:inline">Cetak</span>
              </button>
              <a className="pos-v6-module-btn" href={view.url.replace(/([?&])inline=1&?/, "$1").replace(/[?&]$/, "")} download aria-label="Unduh">
                <Download className="size-4" aria-hidden /> <span className="hidden sm:inline">Unduh</span>
              </a>
              <a className="pos-v6-module-btn" href={view.url} target="_blank" rel="noreferrer" data-external="true" aria-label="Buka di tab baru">
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </>
          ) : null}
          <button type="button" className="pos-v6-module-btn" onClick={onClose} aria-label="Tutup" data-testid="pos-module-close">
            <X className="size-5" aria-hidden /> <span className="hidden sm:inline">Tutup</span>
          </button>
        </div>
        <div className="garage-scroll min-h-0 flex-1 overflow-y-auto bg-[#08080b]">
          {view?.kind === "sales" ? (
            <div className="mx-auto max-w-7xl px-3 py-4">
              <SalesHistoryView canDeleteInvoice={canSupervise} />
            </div>
          ) : view?.kind === "shift" ? (
            <div className="mx-auto max-w-5xl px-3 py-4">
              <CashierShiftReport blindOpenShift={role === "Kasir"} canSupervise={canSupervise} isOwner={isOwner} initialTab={view.tab} />
            </div>
          ) : view?.kind === "partners" ? (
            <div className="mx-auto max-w-7xl px-3 py-4 text-[#f4f4f5]" data-testid="pos-partner-panel">
              {view.tab === "orders" ? (
                <DeskOrders
                  mode="monitor"
                  slaWarnMinutes={partner?.slaAccept}
                  readyWarnMinutes={partner?.slaReady}
                  viewer={{ userId: partner?.userId ?? "", canHandleMoney: partner?.canHandleMoney ?? false, isManager: canSupervise }}
                />
              ) : (
                <DeskFinance role={role} userId={partner?.userId ?? ""} />
              )}
            </div>
          ) : view?.kind === "frame" ? (
            <iframe ref={frameRef} title={view.title} src={view.url} className="h-full w-full border-0 bg-white" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
