"use client";

import { useCallback, useEffect, useState } from "react";
import { PackageCheck, Printer, ShoppingCart, Truck } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import { printDeliveryNote } from "@/lib/wms-print";

type Item = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  qty: number;
  stockAtRequest: number;
  sentQty: number;
  shortQty: number;
  sourceOnHand: number;
  note: string;
};
type Request = {
  id: string;
  doc: string;
  division: "bar" | "dapur";
  status: "submitted" | "sent" | "received" | "cancelled";
  urgent: boolean;
  note: string;
  roomName: string | null;
  requestedByName: string;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  receiveNote: string;
  items: Item[];
};
type Shortage = { productId: string; name: string; unit: string; qty: number; docs: string[]; supplier: string | null; lastPrice: number | null };

const STATUS: Record<Request["status"], { label: string; cls: string }> = {
  submitted: { label: "Perlu dikirim", cls: "bg-[#FEF3C7] text-[#92400E]" },
  sent: { label: "Dikirim, menunggu diterima", cls: "bg-[#DBEAFE] text-[#1E40AF]" },
  received: { label: "Diterima", cls: "bg-[#DCFCE7] text-[#166534]" },
  cancelled: { label: "Batal", cls: "bg-[#F3F4F6] text-[#374151]" },
};
const DIVISION = { bar: "Bar", dapur: "Dapur" } as const;
const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
const timeFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default function WmsMaterialRequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [shortages, setShortages] = useState<Shortage[] | null>(null);
  const [sendQty, setSendQty] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (which: "open" | "all") => {
    const rows = await garageApi.get<Request[]>(`/api/wms/material-requests${which === "open" ? "?status=submitted,sent" : ""}`);
    setRequests(rows);
    // Default kirim = min(diminta, stok gudang utama).
    setSendQty((current) => {
      const next = { ...current };
      for (const r of rows) for (const i of r.items) if (next[i.id] === undefined) next[i.id] = String(Math.max(0, Math.min(i.qty, i.sourceOnHand)));
      return next;
    });
    setShortages(await garageApi.get<Shortage[]>("/api/wms/material-requests/shortages").catch(() => null));
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      garageApi.get<Request[]>("/api/wms/material-requests?status=submitted,sent"),
      garageApi.get<Shortage[]>("/api/wms/material-requests/shortages").catch(() => null),
    ])
      .then(([rows, short]) => {
        if (!alive) return;
        setRequests(rows);
        setShortages(short);
        const init: Record<string, string> = {};
        for (const r of rows) for (const i of r.items) init[i.id] = String(Math.max(0, Math.min(i.qty, i.sourceOnHand)));
        setSendQty(init);
      })
      .catch(() => {
        if (alive) setMsg({ ok: false, text: "Gagal memuat permintaan bahan." });
      });
    return () => {
      alive = false;
    };
  }, []);

  async function send(r: Request) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await garageApi.post(`/api/wms/material-requests/${r.id}/send`, {
        lines: r.items.map((i) => ({ itemId: i.id, qty: Number((sendQty[i.id] ?? "0").replace(",", ".")) || 0 })),
      });
      setMsg({ ok: true, text: `${r.doc} dikirim ke ${r.roomName ?? DIVISION[r.division]}. Cetak surat jalan untuk dibawa.` });
      await load(filter);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal mengirim." });
    } finally {
      setBusy(false);
    }
  }

  async function printNote(doc: string) {
    try {
      printDeliveryNote(await garageApi.get<Parameters<typeof printDeliveryNote>[0]>(`/api/wms/documents/${encodeURIComponent(doc)}`));
    } catch {
      setMsg({ ok: false, text: "Surat jalan belum tersedia (belum ada bahan yang dikirim)." });
    }
  }

  async function makePo() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await garageApi.post<{ created: Array<{ doc: string }>; skipped: string[] }>("/api/wms/material-requests/shortages", {});
      const made = res.created.length ? `PO draft dibuat: ${res.created.map((p) => p.doc).join(", ")} — buka menu Purchase Order.` : "Tidak ada PO dibuat.";
      setMsg({ ok: true, text: res.skipped.length ? `${made} Belum ada riwayat supplier (buat PO manual): ${res.skipped.join(", ")}.` : made });
      await load(filter);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal membuat PO." });
    } finally {
      setBusy(false);
    }
  }

  const input = "h-10 w-24 rounded-md border border-[#dedfe4] bg-white px-2 text-right text-[14px] text-[#17191d] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Permintaan Bar &amp; Dapur</h1>
          <p className="text-[13px] text-[#525866]">Daftar belanja dari layar produksi. Kirim bahan dari gudang utama; yang kosong jadi kekurangan untuk dibeli.</p>
        </div>
        <div className="flex rounded-md border border-[#dedfe4] bg-white p-0.5">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                void load(f);
              }}
              className={`h-9 rounded px-3 text-[13px] font-semibold ${filter === f ? "bg-[#17191d] text-white" : "text-[#525866]"}`}
            >
              {f === "open" ? "Perlu diproses" : "Semua"}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className={`text-[13px] font-semibold ${msg.ok ? "text-[#15803D]" : "text-[#C8102E]"}`}>{msg.text}</p>}

      {shortages && shortages.length > 0 && (
        <section className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#78350F]">
              <ShoppingCart className="size-4" aria-hidden /> Kekurangan — perlu dibeli ({shortages.length})
            </h2>
            <button type="button" disabled={busy} onClick={() => void makePo()} className="min-h-10 rounded-lg bg-[#C8102E] px-4 text-[13px] font-bold text-white disabled:opacity-50">
              Buat PO draft
            </button>
          </div>
          <ul className="mt-2 grid gap-1 text-[13px] text-[#17191d]">
            {shortages.map((s) => (
              <li key={s.productId} className="flex flex-wrap justify-between gap-2">
                <span>{s.name} <span className="text-[#525866]">· {s.docs.join(", ")}</span></span>
                <span className="font-semibold tabular-nums">
                  {qtyFormat.format(s.qty)} {s.unit}
                  {s.supplier ? <span className="font-normal text-[#525866]"> · {s.supplier}{s.lastPrice ? ` ${currency.format(s.lastPrice)}/${s.unit}` : ""}</span> : <span className="font-normal text-[#B45309]"> · supplier belum ada</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {requests.length === 0 ? (
        <section className="rounded-xl border border-[#E8E8E8] bg-white p-8 text-center text-[13px] text-[#525866]">
          <PackageCheck className="mx-auto mb-2 size-6 text-[#9CA3AF]" aria-hidden />
          {filter === "open" ? "Tidak ada permintaan yang perlu diproses." : "Belum ada permintaan bahan."}
        </section>
      ) : (
        <div className="grid gap-3">
          {requests.map((r) => (
            <section key={r.id} className={`rounded-xl border bg-white p-4 ${r.urgent && r.status === "submitted" ? "border-[#C8102E]" : "border-[#E8E8E8]"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[14px] font-bold text-[#C8102E]">{r.doc}</span>
                {r.urgent && <span className="rounded bg-[#C8102E] px-1.5 py-0.5 text-[11px] font-bold text-white">URGENT</span>}
                <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                <span className="text-[13px] font-semibold text-[#17191d]">→ {r.roomName ?? DIVISION[r.division]}</span>
                <span className="ml-auto text-[12px] text-[#525866]">{r.requestedByName} · {timeFormat.format(new Date(r.createdAt))}</span>
              </div>
              {r.note && <p className="mt-1 text-[13px] text-[#525866]">Catatan: {r.note}</p>}
              {r.receiveNote && <p className="mt-1 text-[13px] text-[#B45309]">Catatan terima: {r.receiveNote}</p>}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead className="text-[12px] text-[#525866]">
                    <tr>
                      <th className="py-1 pr-2 font-semibold">Bahan</th>
                      <th className="py-1 pr-2 text-right font-semibold">Diminta</th>
                      <th className="py-1 pr-2 text-right font-semibold">Sisa di ruang</th>
                      <th className="py-1 pr-2 text-right font-semibold">Stok gudang</th>
                      <th className="py-1 text-right font-semibold">{r.status === "submitted" ? "Kirim" : "Dikirim"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F1F4] text-[#17191d]">
                    {r.items.map((i) => (
                      <tr key={i.id}>
                        <td className="py-1.5 pr-2">{i.name}{i.note ? <span className="block text-[11px] text-[#525866]">{i.note}</span> : null}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{qtyFormat.format(i.qty)} {i.unit}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{qtyFormat.format(i.stockAtRequest)}</td>
                        <td className={`py-1.5 pr-2 text-right tabular-nums ${i.sourceOnHand < i.qty ? "font-semibold text-[#B45309]" : ""}`}>{qtyFormat.format(i.sourceOnHand)}</td>
                        <td className="py-1.5 text-right">
                          {r.status === "submitted" ? (
                            <input
                              aria-label={`Jumlah kirim ${i.name}`}
                              inputMode="decimal"
                              value={sendQty[i.id] ?? ""}
                              onChange={(e) => setSendQty((c) => ({ ...c, [i.id]: e.target.value }))}
                              className={input}
                            />
                          ) : (
                            <span className="tabular-nums">
                              {qtyFormat.format(i.sentQty)}
                              {i.shortQty > 0 ? <span className="block text-[11px] text-[#B45309]">kurang {qtyFormat.format(i.shortQty)}</span> : null}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {r.status !== "submitted" && r.status !== "cancelled" && (
                  <button type="button" onClick={() => void printNote(r.doc)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#E8E8E8] px-3 text-[13px] font-semibold text-[#111111]">
                    <Printer className="size-4" aria-hidden /> Surat jalan
                  </button>
                )}
                {r.status === "submitted" && (
                  <button type="button" disabled={busy} onClick={() => void send(r)} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-[#C8102E] px-4 text-[13px] font-bold text-white disabled:opacity-50">
                    <Truck className="size-4" aria-hidden /> Kirim ke {r.roomName ?? DIVISION[r.division]}
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
