"use client";

import {
  Archive,
  ArchiveRestore,
  Ban,
  BadgeCheck,
  CreditCard,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import { PosInvoiceDeleteDialog, type InvoiceDeleteTarget } from "@/components/garage/pos-invoice-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import { invalidateGarageCache, GARAGE_TAGS } from "@/lib/garage-cache";
import type { PaymentStatus } from "@/lib/payment-status";

// Aksi administratif order/invoice — hanya dirender untuk Owner/Manajer; server
// tetap memverifikasi role (requireOwnerOrManager) untuk setiap aksi.

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const METHODS = [
  { value: "Cash", label: "Tunai (Cash)" },
  { value: "QRIS", label: "QRIS" },
  { value: "Bank Transfer", label: "Transfer Bank" },
  { value: "E-Wallet", label: "E-Wallet" },
] as const;

export type OrderAdminTarget = {
  id: string;
  orderNo: string;
  status: string;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  archived: boolean;
  total: number;
  tableLabel: string | null;
  customerName: string | null;
  customerPhone?: string | null;
  customerNote?: string | null;
};

type Mode = "edit" | "method" | "revert" | "confirm" | "cancel" | "archive" | "restore" | "history";

type HistoryRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function describeChange(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const before = metadata.before as Record<string, unknown> | undefined;
  const after = metadata.after as Record<string, unknown> | undefined;
  const parts: string[] = [];
  if (before && after) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      parts.push(`${key}: ${String(before[key] ?? "—")} → ${String(after[key] ?? "—")}`);
    }
  } else if (metadata.from || metadata.to) {
    parts.push(`metode: ${String(metadata.from ?? "—")} → ${String(metadata.to ?? "—")}`);
  }
  return parts.join(" · ") || null;
}

export function OrderAdminActions({
  target,
  variant = "buttons",
  onChanged,
}: {
  target: OrderAdminTarget;
  variant?: "buttons" | "menu";
  onChanged: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceDeleteTarget | null>(null);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<string>("QRIS");
  const [cashReceived, setCashReceived] = useState("");
  const [name, setName] = useState(target.customerName ?? "");
  const [phone, setPhone] = useState(target.customerPhone ?? "");
  const [note, setNote] = useState(target.customerNote ?? "");
  const [table, setTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  const paid = target.paymentStatus === "paid";
  const pending = target.paymentStatus === "pending";
  const closed = target.paymentStatus === "cancelled" || target.paymentStatus === "refund";
  const label = [target.tableLabel, target.customerName].filter(Boolean).join(" · ");

  function open(next: Mode) {
    setError(null);
    setReason("");
    setCashReceived("");
    setName(target.customerName ?? "");
    setPhone(target.customerPhone ?? "");
    setNote(target.customerNote ?? "");
    setTable("");
    setMethod(target.paymentMethod && !/qris/i.test(target.paymentMethod) ? "QRIS" : "Cash");
    setMode(next);
    if (next === "history") {
      setHistory(null);
      garageApi
        .get<HistoryRow[]>(`/api/orders/${encodeURIComponent(target.id)}/history`, { cache: "no-store" })
        .then(setHistory)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Gagal memuat riwayat."));
    }
  }

  function done(message: string) {
    setMode(null);
    invalidateGarageCache([GARAGE_TAGS.orders, GARAGE_TAGS.finance, GARAGE_TAGS.dashboard, GARAGE_TAGS.kitchen]);
    onChanged(message);
  }

  async function submit() {
    if (!mode || mode === "history") return;
    setBusy(true);
    setError(null);
    const base = `/api/orders/${encodeURIComponent(target.id)}`;
    try {
      if (mode === "edit") {
        await garageApi.patch(base, {
          customerName: name,
          customerPhone: phone,
          customerNote: note,
          tableNumber: table.trim() || null,
          reason,
        });
        done(`Order ${target.orderNo} diperbarui.`);
      } else if (mode === "method") {
        await garageApi.post(`${base}/payment-method`, { method, reason });
        done(`Metode bayar ${target.orderNo} diubah ke ${method}.`);
      } else if (mode === "revert") {
        await garageApi.post(`${base}/payment/revert`, { reason });
        done(`Pelunasan ${target.orderNo} dibatalkan — status kembali Pending.`);
      } else if (mode === "confirm") {
        const cash = method === "Cash" ? Number(cashReceived.replace(/\D/g, "")) || target.total : null;
        if (cash != null && cash < target.total) throw new Error("Uang diterima kurang dari total.");
        await garageApi.post(`${base}/payment/confirm`, { paymentMethod: method, cashReceived: cash, reason });
        done(
          `${target.orderNo} LUNAS (${method})${cash != null && cash > target.total ? ` · kembalian ${currency.format(cash - target.total)}` : ""}.`,
        );
      } else if (mode === "cancel") {
        await garageApi.post(`${base}/void`, { reason });
        done(`Order ${target.orderNo} dibatalkan.`);
      } else if (mode === "archive" || mode === "restore") {
        await garageApi.post(`${base}/archive`, { archived: mode === "archive", reason });
        done(mode === "archive" ? `Invoice ${target.orderNo} diarsip.` : `Invoice ${target.orderNo} dipulihkan.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  }

  const actions: Array<{ key: Mode | "delete"; label: string; icon: typeof Pencil; show: boolean; danger?: boolean }> = [
    { key: "edit", label: "Edit info", icon: Pencil, show: true },
    { key: "confirm", label: "Konfirmasi lunas", icon: BadgeCheck, show: pending },
    { key: "method", label: "Ubah metode bayar", icon: CreditCard, show: paid },
    { key: "revert", label: "Batalkan pelunasan", icon: Undo2, show: paid },
    { key: "cancel", label: "Batalkan order", icon: Ban, show: !closed, danger: true },
    { key: "delete", label: "Hapus invoice", icon: Trash2, show: pending, danger: true },
    { key: "archive", label: "Arsipkan", icon: Archive, show: !pending && !target.archived },
    { key: "restore", label: "Pulihkan", icon: ArchiveRestore, show: target.archived },
    { key: "history", label: "Riwayat perubahan", icon: History, show: true },
  ];
  const visible = actions.filter((action) => action.show);

  function trigger(key: Mode | "delete") {
    if (key === "delete") {
      setDeleteTarget({ id: target.id, orderNo: target.orderNo, total: target.total, label, status: target.status });
      return;
    }
    open(key);
  }

  const titles: Record<Mode, string> = {
    edit: "Edit info order",
    method: "Ubah metode pembayaran",
    revert: "Batalkan pelunasan (Lunas → Pending)",
    confirm: "Konfirmasi lunas (Pending → Lunas)",
    cancel: "Batalkan order",
    archive: "Arsipkan invoice",
    restore: "Pulihkan invoice",
    history: "Riwayat perubahan",
  };
  const descriptions: Record<Mode, string> = {
    edit: "Ubah nama, HP, catatan, atau koreksi nomor meja. Nominal & item tidak bisa diubah (pakai Refund/Batal).",
    method: `Hanya metode yang berubah (tanpa transaksi baru, total tetap ${currency.format(target.total)}). Shift pembayaran harus masih buka.`,
    revert:
      "Untuk pelunasan yang salah input. Status kembali Pending, pembayaran tidak dihapus, total tetap. BUKAN refund — tidak ada uang keluar. Hanya bila shift pembayaran masih buka.",
    confirm:
      "Catat pembayaran yang sudah benar-benar diterima (uang/notifikasi bank sudah dicek). QRIS/Transfer bisa tanpa shift; Tunai wajib dari shift yang sedang buka (uang masuk laci).",
    cancel: paid
      ? "Order LUNAS dibatalkan: tidak dihitung penjualan, stok yang belum dibuat kembali, poin ditarik. Uang tunai dikeluarkan dari laci shift aktif bila dikembalikan ke pelanggan."
      : "Order dibatalkan: pesanan Bar/Dapur batal, stok kembali. Riwayat tetap tersimpan.",
    archive: "Hanya menyembunyikan dari daftar. Laporan, stok, kas, dan pembayaran tidak berubah.",
    restore: "Tampilkan kembali invoice di daftar. Status invoice tidak berubah.",
    history: "Semua perubahan administratif transaksi ini (tidak bisa diubah).",
  };
  const minReason = mode === "revert" || mode === "cancel" ? 5 : 3;
  const ready =
    reason.trim().length >= minReason &&
    (mode !== "cancel" || reason.trim().length >= 5);

  return (
    <>
      {variant === "menu" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" aria-label={`Kelola ${target.orderNo}`} data-testid="order-admin-menu">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {visible.map((action, index) => (
              <div key={action.key}>
                {action.danger && index > 0 && !visible[index - 1].danger ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  className={action.danger ? "text-rose-300" : undefined}
                  onSelect={() => trigger(action.key)}
                >
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex flex-wrap gap-2" data-testid="order-admin-actions">
          {visible.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant="outline"
              data-testid={`order-admin-${action.key}`}
              className={action.danger ? "border-rose-600/50 bg-rose-950/30 text-rose-200" : undefined}
              onClick={() => trigger(action.key)}
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </Button>
          ))}
        </div>
      )}

      <PosInvoiceDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(message) => {
          setDeleteTarget(null);
          invalidateGarageCache([GARAGE_TAGS.orders, GARAGE_TAGS.finance, GARAGE_TAGS.dashboard, GARAGE_TAGS.kitchen]);
          onChanged(message);
        }}
      />

      <Dialog open={mode !== null} onOpenChange={(value) => (!value ? setMode(null) : null)}>
        {mode ? (
          <DialogContent className="max-h-[90svh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-lg" data-testid="order-admin-dialog">
            <DialogHeader>
              <DialogTitle>{titles[mode]}</DialogTitle>
              <DialogDescription>{descriptions[mode]}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-[#3a3a44] bg-white/[0.05] p-3">
              <p className="font-mono text-sm font-bold text-white">{target.orderNo}</p>
              {label ? <p className="text-sm text-[#d4d4d8]">{label}</p> : null}
              <p className="mt-1 text-lg font-black text-[#ffd08a]">{currency.format(target.total)}</p>
              {target.paymentMethod ? <p className="text-xs text-[#c4c4cc]">Metode sekarang: {target.paymentMethod}</p> : null}
            </div>

            {mode === "history" ? (
              <ol className="space-y-2" data-testid="order-history-list">
                {history === null && !error ? (
                  <li className="flex items-center gap-2 text-sm text-[#c4c4cc]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
                  </li>
                ) : null}
                {history?.length === 0 ? <li className="text-sm text-[#c4c4cc]">Belum ada perubahan administratif.</li> : null}
                {history?.map((row) => {
                  const change = describeChange(row.metadata);
                  const why = typeof row.metadata?.reason === "string" ? row.metadata.reason : null;
                  return (
                    <li key={row.id} className="rounded-md border border-[#34343c] bg-black/25 p-2.5">
                      <p className="text-sm font-bold text-white">{row.action}</p>
                      <p className="text-xs text-[#c4c4cc]">
                        {timeFmt.format(new Date(row.at))} · {row.actor}
                      </p>
                      {change ? <p className="mt-1 break-words text-xs text-[#ffd08a]">{change}</p> : null}
                      {why ? <p className="mt-0.5 text-xs text-[#e4e4ea]">Alasan: {why}</p> : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="space-y-3">
                {mode === "edit" ? (
                  <>
                    <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                      Nama pelanggan
                      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" maxLength={80} />
                    </label>
                    <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                      No. HP / WhatsApp
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" inputMode="tel" maxLength={30} />
                    </label>
                    {target.paymentStatus !== "pending" ? (
                      <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                        Koreksi nomor meja (kosong = tetap {target.tableLabel ?? "-"})
                        <Input
                          value={table}
                          onChange={(e) => setTable(e.target.value)}
                          className="h-11"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="mis. 7"
                        />
                      </label>
                    ) : (
                      <p className="text-xs text-[#c4c4cc]">Tagihan masih berjalan — pindah meja lewat tombol Pindah meja di POS/Waiter.</p>
                    )}
                    <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                      Catatan
                      <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-11" maxLength={240} />
                    </label>
                  </>
                ) : null}
                {mode === "method" || mode === "confirm" ? (
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Metode bayar">
                    {METHODS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={method === option.value}
                        onClick={() => setMethod(option.value)}
                        className={`garage-press min-h-11 rounded-md border px-3 text-sm font-bold ${
                          method === option.value
                            ? "border-[#e5484d] bg-[#e5484d]/20 text-white"
                            : "border-[#4a4a54] bg-white/[0.05] text-[#e4e4ea]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {mode === "confirm" && method === "Cash" ? (
                  <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                    Uang diterima (kosong = uang pas)
                    <Input
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      inputMode="numeric"
                      placeholder={String(target.total)}
                      className="h-11"
                    />
                  </label>
                ) : null}
                <label className="block space-y-1 text-sm font-semibold text-[#e4e4ea]">
                  Alasan (wajib, tercatat di audit)
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-11"
                    maxLength={200}
                    data-testid="order-admin-reason"
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
              {mode !== "history" ? (
                <Button
                  type="button"
                  data-testid="order-admin-submit"
                  disabled={!ready || busy}
                  className={`garage-press h-11 flex-1 ${mode === "cancel" ? "bg-[#d11a2a] text-white hover:bg-[#e5484d]" : ""}`}
                  onClick={() => void submit()}
                >
                  {busy ? "Menyimpan..." : "Konfirmasi"}
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="garage-press h-11 flex-1" onClick={() => setMode(null)}>
                {mode === "history" ? "Tutup" : "Batal"}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
