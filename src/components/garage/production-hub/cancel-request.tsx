"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Minus, Plus, XCircle } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { ORDER_CANCEL_REASONS } from "@/lib/approval-rules";

type CancelableOrder = {
  orderId: string;
  orderNo: string;
  status: string;
  paid: boolean;
  pendingApprovalId: string | null;
  items: Array<{ id: string; itemName: string; variantLabel: string; qty: number }>;
};

export type CancelRequestBody = {
  orderId: string;
  scope: "order" | "items";
  reasonCode: string;
  note: string | null;
  items?: Array<{ orderItemId: string; qty: number }>;
};

/**
 * Ajukan batal dari Bar/Dapur (owner Nov 2026: WAJIB disetujui Owner/Manajer).
 * Tidak ada yang berubah sebelum disetujui; tiket ditandai "menunggu batal".
 * Owner/Manajer yang mengajukan sendiri → langsung dieksekusi (aturan lama).
 */
export function CancelRequestPanel({
  orderId,
  pending,
  canRequest,
  isManager,
  busy,
  onSubmit,
}: {
  orderId: string;
  pending: { approvalId: string; kind: "order" | "items"; summary: string } | null;
  canRequest: boolean;
  isManager: boolean;
  busy: boolean;
  onSubmit: (body: CancelRequestBody) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<CancelableOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"items" | "order">("items");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reasonCode, setReasonCode] = useState("salah_input");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    garageApi
      .get<CancelableOrder>(`/api/production/cancel-requests?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then((data) => {
        if (!alive) return;
        setOrder(data);
        setError(null);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Gagal memuat item."));
    return () => {
      alive = false;
    };
  }, [open, orderId]);

  if (pending) {
    return (
      <section role="status" className="rounded-[8px] border border-[var(--phv4-critical)]/60 bg-[var(--phv4-critical)]/10 p-3">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-[#fecaca]">
          <AlertTriangle className="size-4" /> Menunggu persetujuan Owner/Manajer
        </p>
        <p className="mt-1 text-[13px] text-[#fee2e2]">{pending.summary}</p>
        <p className="mt-1 text-[12px] text-[var(--phv4-muted)]">
          Jangan dibuat dulu. Setelah disetujui, item hilang dari layar produksi dan stok dikembalikan otomatis.
        </p>
      </section>
    );
  }
  if (!canRequest) return null;

  const picked = Object.entries(qty).filter(([, n]) => n > 0);
  const reasonOk = reasonCode !== "lainnya" || note.trim().length >= 3;
  const ready = reasonOk && (scope === "order" || picked.length > 0);

  return (
    <section className="rounded-[8px] border border-[var(--phv4-border)] bg-[var(--phv4-card)] p-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-[6px] border border-[var(--phv4-critical)]/60 px-3 text-[13px] font-semibold text-[#fecaca] hover:bg-[var(--phv4-critical)]/10"
        >
          <XCircle className="size-4" /> Ajukan batal (salah input kasir, dll.)
        </button>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <XCircle className="size-4 text-[var(--phv4-critical)]" />
            <h3 className="text-[14px] font-bold">Ajukan batal</h3>
            <span className="ml-auto text-[12px] text-[var(--phv4-muted)]">
              {isManager ? "Anda Owner/Manajer — langsung dieksekusi" : "Wajib disetujui Owner/Manajer"}
            </span>
          </div>
          {error ? <p className="text-[12px] text-[#fca5a5]">{error}</p> : null}
          {!order && !error ? (
            <p className="flex items-center gap-2 text-[12px] text-[var(--phv4-muted)]">
              <Loader2 className="size-3.5 animate-spin" /> Memuat item…
            </p>
          ) : null}
          {order ? (
            <>
              <div role="radiogroup" aria-label="Yang dibatalkan" className="grid grid-cols-2 gap-1">
                {(
                  [
                    ["items", "Sebagian item"],
                    ["order", "Seluruh order"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={scope === value}
                    onClick={() => setScope(value)}
                    className={`h-10 rounded-[6px] border text-[13px] font-semibold ${
                      scope === value ? "border-[var(--phv4-red)] bg-[var(--phv4-red)]/15 text-white" : "border-[var(--phv4-border)] text-[var(--phv4-muted)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {scope === "items" ? (
                <ul className="space-y-1">
                  {order.items.map((item) => {
                    const n = qty[item.id] ?? 0;
                    return (
                      <li key={item.id} className="flex items-center gap-2 rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 py-1">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                          {item.itemName}
                          {item.variantLabel && item.variantLabel !== "Regular" ? ` ${item.variantLabel}` : ""}
                          <span className="ml-1 text-[12px] text-[var(--phv4-muted)]">dipesan {item.qty}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Kurangi batal ${item.itemName}`}
                          disabled={n <= 0}
                          onClick={() => setQty((cur) => ({ ...cur, [item.id]: Math.max(0, n - 1) }))}
                          className="grid size-10 place-items-center rounded-[6px] border border-[var(--phv4-border)] disabled:opacity-40"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="phv4-mono w-6 text-center text-[15px] font-bold">{n}</span>
                        <button
                          type="button"
                          aria-label={`Tambah batal ${item.itemName}`}
                          disabled={n >= item.qty}
                          onClick={() => setQty((cur) => ({ ...cur, [item.id]: Math.min(item.qty, n + 1) }))}
                          className="grid size-10 place-items-center rounded-[6px] border border-[var(--phv4-border)] disabled:opacity-40"
                        >
                          <Plus className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-[6px] bg-[var(--phv4-critical)]/10 px-2 py-1.5 text-[13px] text-[#fee2e2]">
                  Seluruh order #{order.orderNo} dibatalkan (void) setelah disetujui{order.paid ? ", termasuk pengembalian uang" : ""}.
                </p>
              )}
              <label className="block text-[12px] text-[var(--phv4-muted)]">
                Alasan
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="mt-1 h-10 w-full rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[13px] text-white [&>option]:bg-[#15171b]"
                >
                  {ORDER_CANCEL_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={reasonCode === "lainnya" ? "Catatan (wajib)" : "Catatan (opsional), mis. harusnya Hot"}
                aria-label="Catatan pembatalan"
                maxLength={200}
                className="h-10 w-full rounded-[6px] border border-[var(--phv4-border)] bg-[var(--phv4-bg)] px-2 text-[13px] outline-none focus:border-[var(--phv4-red)]"
              />
              <p className="text-[12px] text-[var(--phv4-muted)]">
                {order.paid
                  ? "Order sudah lunas: diproses sebagai refund item resmi setelah disetujui."
                  : "Order belum lunas: tagihan kasir dikurangi setelah disetujui."}{" "}
                Stok bahan dikembalikan otomatis. Semua tercatat di audit.
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 flex-1 rounded-[6px] border border-[var(--phv4-border)] text-[13px] font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={async () => {
                    const ok = await onSubmit({
                      orderId,
                      scope,
                      reasonCode,
                      note: note.trim() || null,
                      items: scope === "items" ? picked.map(([orderItemId, n]) => ({ orderItemId, qty: n })) : undefined,
                    });
                    if (ok) {
                      setOpen(false);
                      setQty({});
                      setNote("");
                    }
                  }}
                  className="inline-flex h-10 flex-[2] items-center justify-center gap-1.5 rounded-[6px] bg-[var(--phv4-critical)] text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                  {isManager ? "Batalkan sekarang" : "Kirim pengajuan batal"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
