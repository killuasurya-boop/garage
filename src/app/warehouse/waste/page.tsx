"use client";

import { useEffect, useState } from "react";
import { AlarmClock, Trash2 } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow, WmsWarehouse } from "@/lib/wms-types";

const REASONS = [
  { value: "expired", label: "Kedaluwarsa" },
  { value: "damaged", label: "Rusak / basi" },
  { value: "spill", label: "Tumpah / jatuh" },
  { value: "prep_loss", label: "Susut persiapan" },
  { value: "other", label: "Lainnya" },
] as const;

type WasteRow = {
  id: string;
  doc: string;
  productName: string | null;
  warehouseName: string | null;
  batchNo: string | null;
  qty: number;
  unit: string;
  reason: string;
  note: string;
  value: number;
  estimatedValue: number;
  status: "recorded" | "pending_approval" | "rejected";
  requestedByName: string;
  createdAt: string;
};

type Expiring = {
  batchId: string;
  batchNo: string;
  expiredAt: string;
  qty: number;
  unit: string;
  value: number;
  expired: boolean;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
};

type WastePayload = {
  rows: WasteRow[];
  summary: { total: number; byReason: Array<{ reason: string; label: string; count: number; value: number }> };
  expiring: Expiring[];
};

const STATUS: Record<WasteRow["status"], { label: string; cls: string }> = {
  recorded: { label: "Tercatat", cls: "bg-[#F3F4F6] text-[#374151]" },
  pending_approval: { label: "Menunggu approval", cls: "bg-[#FEF3C7] text-[#92400E]" },
  rejected: { label: "Ditolak", cls: "bg-[#FEE2E2] text-[#991B1B]" },
};

const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const dateOnly = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

export default function WmsWastePage() {
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [data, setData] = useState<WastePayload | null>(null);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("damaged");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reload() {
    setData(await garageApi.get<WastePayload>("/api/wms/waste"));
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [prods, whs, payload] = await Promise.all([
          garageApi.get<WmsProductRow[]>("/api/wms/products"),
          garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
          garageApi.get<WastePayload>("/api/wms/waste"),
        ]);
        if (!alive) return;
        setProducts(prods);
        setWarehouses(whs);
        setWarehouseId(whs.find((w) => w.type !== "main")?.id ?? whs[0]?.id ?? "");
        setData(payload);
      } catch {
        if (alive) setMsg({ ok: false, text: "Gagal memuat data waste." });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function pickBatch(row: Expiring) {
    setProductId(row.productId);
    setWarehouseId(row.warehouseId);
    setBatchId(row.batchId);
    setQty(String(row.qty));
    setReason("expired");
    setNote(`Batch ${row.batchNo}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const amount = Number(qty.replace(",", "."));
    if (!productId || !warehouseId || !(amount > 0) || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const row = await garageApi.post<WasteRow>("/api/wms/waste", {
        productId,
        warehouseId,
        batchId,
        qty: amount,
        reason,
        note: note.trim() || undefined,
      });
      setMsg({
        ok: true,
        text: row.status === "pending_approval" ? `${row.doc} diajukan — stok berubah setelah disetujui manajer.` : `${row.doc} tercatat, stok sudah dipotong.`,
      });
      setQty("");
      setNote("");
      setBatchId(null);
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal mencatat waste." });
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    const decisionNote = approve ? "" : window.prompt("Alasan penolakan?")?.trim() ?? "";
    if (!approve && decisionNote.length < 3) return;
    setBusy(true);
    try {
      await garageApi.post(`/api/wms/waste/${id}/decide`, { approve, note: decisionNote || undefined });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal memutuskan waste." });
    } finally {
      setBusy(false);
    }
  }

  const selected = products.find((p) => p.id === productId);
  const input = "h-10 w-full rounded-md border border-[#dedfe4] bg-white px-2.5 text-[14px] text-[#17191d] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Waste · Bahan Terbuang</h1>
        <p className="text-[13px] text-[#525866]">Catat bahan rusak, kedaluwarsa, tumpah, atau susut — stok terpotong dengan alasan jelas.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#111111]">
            <Trash2 className="size-4 text-[#C8102E]" aria-hidden /> Catat waste
          </h2>
          <div className="space-y-2.5">
            <label className="block text-[12px] font-semibold text-[#525866]">
              Bahan
              <select value={productId} onChange={(e) => { setProductId(e.target.value); setBatchId(null); }} className={`${input} mt-1`}>
                <option value="">Pilih bahan…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] font-semibold text-[#525866]">
              Ruang
              <select value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setBatchId(null); }} className={`${input} mt-1`}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[12px] font-semibold text-[#525866]">
                Jumlah {selected ? `(${selected.unit})` : ""}
                <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="0" className={`${input} mt-1`} />
              </label>
              <label className="block text-[12px] font-semibold text-[#525866]">
                Alasan
                <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={`${input} mt-1`}>
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-[12px] font-semibold text-[#525866]">
              Keterangan {reason === "other" ? "(wajib)" : "(opsional)"}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. susu basi saat dibuka" className={`${input} mt-1`} />
            </label>
            {batchId && <p className="text-[12px] text-[#525866]">Batch dipilih dari daftar kedaluwarsa · <button type="button" className="font-semibold text-[#C8102E] underline" onClick={() => setBatchId(null)}>lepas</button></p>}
            <p className="text-[12px] text-[#525866]">Waste staf bernilai ≥ {currency.format(50_000)} menunggu persetujuan Owner/Manajer.</p>
            {msg && <p className={`text-[13px] font-semibold ${msg.ok ? "text-[#15803D]" : "text-[#C8102E]"}`}>{msg.text}</p>}
            <button
              type="button"
              disabled={!productId || !(Number(qty.replace(",", ".")) > 0) || busy}
              onClick={() => void submit()}
              className="min-h-11 w-full rounded-lg bg-[#C8102E] py-2.5 text-[14px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50"
            >
              Simpan waste
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <h2 className="mb-1 flex items-center gap-2 text-[14px] font-bold text-[#111111]">
            <AlarmClock className="size-4 text-[#D97706]" aria-hidden /> Kedaluwarsa & hampir (≤3 hari)
          </h2>
          <p className="mb-2 text-[12px] text-[#525866]">Batch kedaluwarsa tidak ikut transfer/produksi. Buang lewat tombol Waste.</p>
          {!data || data.expiring.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#525866]">Tidak ada batch yang kedaluwarsa.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-[#F0F1F4] overflow-y-auto">
              {data.expiring.map((b) => (
                <li key={b.batchId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#111111]">{b.productName} · {b.qty} {b.unit}</span>
                    <span className="block text-[12px] text-[#525866]">
                      {b.warehouseName} · {b.batchNo} · <span className={b.expired ? "font-bold text-[#C8102E]" : "font-semibold text-[#B45309]"}>{b.expired ? "Kedaluwarsa" : "Exp"} {dateOnly.format(new Date(b.expiredAt))}</span> · {currency.format(b.value)}
                    </span>
                  </span>
                  <button type="button" onClick={() => pickBatch(b)} className="min-h-9 shrink-0 rounded-md border border-[#dedfe4] px-3 text-[12px] font-semibold text-[#17191d] hover:bg-[#F5F5F5]">
                    Waste
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-bold text-[#111111]">Waste 30 hari</h2>
          <p className="text-[13px] text-[#17191d]">
            Total <span className="font-bold">{currency.format(data?.summary.total ?? 0)}</span>
            {data?.summary.byReason.length ? ` · ${data.summary.byReason.map((r) => `${r.label} ${currency.format(r.value)}`).join(" · ")}` : ""}
          </p>
        </div>
        {!data || data.rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#525866]">Belum ada waste.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="sticky top-0 bg-white text-[12px] text-[#525866]">
                <tr>
                  <th className="py-2 pr-2 font-semibold">Waktu</th>
                  <th className="py-2 pr-2 font-semibold">Bahan</th>
                  <th className="py-2 pr-2 text-right font-semibold">Jumlah</th>
                  <th className="py-2 pr-2 font-semibold">Alasan</th>
                  <th className="py-2 pr-2 text-right font-semibold">Nilai</th>
                  <th className="py-2 pr-2 font-semibold">Status</th>
                  <th className="py-2 font-semibold"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F1F4] text-[#17191d]">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 whitespace-nowrap">{dateTime.format(new Date(r.createdAt))}<span className="block text-[11px] text-[#525866]">{r.doc}</span></td>
                    <td className="py-2 pr-2">{r.productName}<span className="block text-[11px] text-[#525866]">{r.warehouseName}{r.batchNo ? ` · ${r.batchNo}` : ""} · {r.requestedByName}</span></td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.qty} {r.unit}</td>
                    <td className="py-2 pr-2">{REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}{r.note ? <span className="block text-[11px] text-[#525866]">{r.note}</span> : null}</td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">{currency.format(r.status === "recorded" ? r.value : r.estimatedValue)}</td>
                    <td className="py-2 pr-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                    <td className="py-2 whitespace-nowrap">
                      {r.status === "pending_approval" && (
                        <span className="flex gap-1">
                          <button type="button" disabled={busy} onClick={() => void decide(r.id, true)} className="min-h-9 rounded-md bg-[#C8102E] px-2.5 text-[12px] font-bold text-white disabled:opacity-50">Setujui</button>
                          <button type="button" disabled={busy} onClick={() => void decide(r.id, false)} className="min-h-9 rounded-md border border-[#dedfe4] px-2.5 text-[12px] font-semibold disabled:opacity-50">Tolak</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
