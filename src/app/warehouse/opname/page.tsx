"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Printer, ScanLine } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { printWmsDoc, escapeHtml } from "@/lib/wms-print";
import { PackQtyInput, PackQtyText } from "@/components/wms/pack-qty";
import { ScanModal } from "@/components/wms/scan-modal";
import { countPack, formatPacks, type PackUom } from "@/lib/stock-uom";
import type { WmsWarehouse } from "@/lib/wms-types";

type OpnameRow = { id: string; doc: string; status: string; rejected: boolean; warehouse: string; lines: number; createdAt: string };
type OpnameLine = {
  id: string;
  productName: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  uoms?: PackUom[];
  counted: boolean;
  /** null = hitung buta (penghitung non-manajer tidak melihat stok sistem). */
  systemQty: number | null;
  physicalQty: number | null;
  variance: number | null;
  varianceValue: number | null;
};
type OpnameDetail = { id: string; doc: string; status: string; blind: boolean; rejectReason: string; lines: OpnameLine[] };

const STATUS_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#FEF3C7", fg: "#92400E" },
  submitted: { label: "Menunggu manajer", bg: "#DBEAFE", fg: "#1E40AF" },
  completed: { label: "Selesai", bg: "#DCFCE7", fg: "#166534" },
};
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export default function WmsOpnamePage() {
  const [list, setList] = useState<OpnameRow[]>([]);
  const [warehouses, setWarehouses] = useState<WmsWarehouse[]>([]);
  const [active, setActive] = useState<OpnameDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Hitungan yang sedang diketik (satuan dasar), disimpan saat input ditinggalkan.
  const [entries, setEntries] = useState<Record<string, number>>({});

  function focusByCode(code: string) {
    setScanning(false);
    if (!active) return;
    const q = code.trim().toLowerCase();
    const line = active.lines.find((l) => (l.sku ?? "").toLowerCase() === q || (l.barcode ?? "").toLowerCase() === q);
    if (!line) { window.alert(`Produk kode "${code}" tak ada di sesi opname ini.`); return; }
    const el = (document.getElementById(`opl-${line.id}-count`) ?? document.getElementById(`opl-${line.id}-rest`)) as HTMLInputElement | null;
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus(); el.select(); }
  }

  async function loadList() {
    setList(await garageApi.get<OpnameRow[]>("/api/wms/opname"));
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [ops, whs] = await Promise.all([
          garageApi.get<OpnameRow[]>("/api/wms/opname"),
          garageApi.get<WmsWarehouse[]>("/api/wms/warehouses"),
        ]);
        if (alive) {
          setList(ops);
          setWarehouses(whs);
        }
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function start(warehouseId: string) {
    setBusy(true);
    try {
      const op = await garageApi.post<{ id: string }>("/api/wms/opname", { warehouseId });
      setActive(await garageApi.get<OpnameDetail>(`/api/wms/opname/${op.id}`));
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setActive(await garageApi.get<OpnameDetail>(`/api/wms/opname/${id}`));
  }

  async function saveLine(lineId: string) {
    const physicalQty = entries[lineId];
    if (!active || physicalQty === undefined) return;
    if (!Number.isFinite(physicalQty) || physicalQty < 0) return;
    setEntries((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
    try {
      await garageApi.patch(`/api/wms/opname/${active.id}`, { lineId, physicalQty });
      // Stok sistem dicatat saat dihitung → baca ulang supaya selisih akurat.
      setActive(await garageApi.get<OpnameDetail>(`/api/wms/opname/${active.id}`));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menyimpan hitungan.");
    }
  }

  async function act(path: "submit" | "finalize" | "reject") {
    if (!active || busy) return;
    let body: Record<string, string> = {};
    if (path === "reject") {
      const reason = window.prompt("Alasan penolakan (hitung ulang)?")?.trim() ?? "";
      if (reason.length < 3) return;
      body = { reason };
    }
    setBusy(true);
    setMsg(null);
    try {
      await garageApi.post(`/api/wms/opname/${active.id}/${path}`, body);
      if (path === "finalize") setActive(null);
      else setActive(await garageApi.get<OpnameDetail>(`/api/wms/opname/${active.id}`));
      await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Aksi opname gagal.");
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    const editable = active.status === "draft";
    const counted = active.lines.filter((l) => l.counted).length;
    const totalVar = active.lines.filter((l) => (l.variance ?? 0) !== 0).length;
    const varianceValue = active.lines.reduce((sum, l) => sum + (l.varianceValue ?? 0), 0);
    // Lembar hitung menyebut isi kemasan supaya penghitung bisa menulis "2 kotak + 300 ml".
    const unitHint = (l: OpnameLine) => {
      const pack = countPack(l.uoms);
      return pack ? `${l.unit} (1 ${pack.uom} = ${pack.factor} ${l.unit})` : l.unit;
    };
    const printSheet = () => {
      // Lembar hitung buta: kolom stok sistem hanya untuk manajer.
      const rows = active.lines
        .map((l) =>
          active.blind
            ? `<tr><td>${escapeHtml(l.productName)}</td><td class="c">${escapeHtml(unitHint(l))}</td><td style="width:110px"></td></tr>`
            : `<tr><td>${escapeHtml(l.productName)}</td><td class="c">${escapeHtml(unitHint(l))}</td><td class="r">${l.systemQty === null ? "" : escapeHtml(formatPacks(l.systemQty, l.unit, l.uoms))}</td><td class="r">${l.counted && l.physicalQty !== null ? escapeHtml(formatPacks(l.physicalQty, l.unit, l.uoms)) : ""}</td><td class="r">${l.counted ? l.variance : ""}</td><td class="r">${l.counted && l.varianceValue ? rupiah.format(l.varianceValue) : ""}</td></tr>`,
        )
        .join("");
      const head = active.blind
        ? `<th>Produk</th><th class="c">Satuan</th><th class="c">Hitung Fisik</th>`
        : `<th>Produk</th><th class="c">Satuan</th><th class="r">Stok Sistem</th><th class="r">Fisik</th><th class="r">Selisih</th><th class="r">Nilai Selisih</th>`;
      printWmsDoc(
        `Lembar Opname · ${active.doc}`,
        `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
         ${active.blind ? "" : `<p><b>Total nilai selisih: ${rupiah.format(varianceValue)}</b></p>`}
         <div class="sign"><div><div class="line">Penghitung</div></div><div><div class="line">Disetujui Manajer</div></div></div>`,
        `${active.doc} · ${active.blind ? "hitung buta" : "hasil hitung"}`,
      );
    };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => setActive(null)} className="text-[12px] font-semibold text-[#C8102E]">← Kembali</button>
            <h1 className="font-mono text-[20px] font-extrabold text-[#111111]">{active.doc}</h1>
            <p className="text-[13px] text-[#525866]">
              {counted}/{active.lines.length} dihitung
              {active.blind ? " · hitung buta (stok sistem disembunyikan)" : ` · ${totalVar} selisih · nilai ${rupiah.format(varianceValue)}`}
              {" · "}{STATUS_LABEL[active.status]?.label ?? active.status}
            </p>
            {active.rejectReason && active.status === "draft" && (
              <p className="mt-1 text-[13px] font-semibold text-[#C8102E]">Ditolak manajer: {active.rejectReason} — hitung ulang lalu kirim lagi.</p>
            )}
            {msg && <p className="mt-1 text-[13px] font-semibold text-[#C8102E]">{msg}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <button type="button" onClick={() => setScanning(true)} className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]">
                <ScanLine className="size-4 text-[#C8102E]" /> Scan
              </button>
            )}
            <button type="button" onClick={printSheet} className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB]">
              <Printer className="size-4 text-[#2563EB]" /> Cetak Lembar
            </button>
            {editable && (
              <button type="button" disabled={busy || counted === 0} onClick={() => void act("submit")} className="min-h-10 rounded-lg bg-[#C8102E] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
                Kirim ke manajer
              </button>
            )}
            {active.status === "submitted" && !active.blind && (
              <>
                <button type="button" disabled={busy} onClick={() => void act("reject")} className="min-h-10 rounded-lg border border-[#E8E8E8] bg-white px-4 py-2 text-[13px] font-semibold text-[#111111] disabled:opacity-50">
                  Tolak, hitung ulang
                </button>
                <button type="button" disabled={busy} onClick={() => void act("finalize")} className="min-h-10 rounded-lg bg-[#C8102E] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50">
                  Setujui &amp; posting stok
                </button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                <th className="px-3 py-2.5">Produk</th>
                {!active.blind && <th className="px-3 py-2.5 text-right">Sistem</th>}
                <th className="px-3 py-2.5 text-right">Fisik</th>
                {!active.blind && <th className="px-3 py-2.5 text-right">Selisih</th>}
                {!active.blind && <th className="px-3 py-2.5 text-right">Nilai</th>}
              </tr>
            </thead>
            <tbody>
              {active.lines.map((l) => {
                const variance = l.variance ?? 0;
                const system = l.systemQty ?? 0;
                const big = l.counted && Math.abs(variance) > system * 0.1 && system > 0;
                return (
                  <tr key={l.id} className="border-b border-[#F0F1F4] last:border-0" style={{ background: big ? "#FEF4F4" : undefined }}>
                    <td className="px-3 py-2 font-semibold text-[#111111]">
                      {l.productName} <span className="text-[11px] text-[#525866]">{l.unit}</span>
                      {!l.counted && <span className="ml-1 text-[11px] font-semibold text-[#B45309]">belum dihitung</span>}
                    </td>
                    {!active.blind && (
                      <td className="px-3 py-2 text-right font-mono text-[#525866]">
                        <PackQtyText qty={l.systemQty ?? 0} unit={l.unit} uoms={l.uoms} />
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      {/* Hitung per kemasan + sisa (2 kotak + 300 ml) → disimpan dalam satuan dasar. */}
                      <PackQtyInput
                        idPrefix={`opl-${l.id}`}
                        label={`Hitung fisik ${l.productName}`}
                        value={entries[l.id] ?? l.physicalQty}
                        unit={l.unit}
                        uoms={l.uoms}
                        disabled={!editable}
                        onChange={(base) => setEntries((current) => ({ ...current, [l.id]: base }))}
                        onBlur={() => void saveLine(l.id)}
                      />
                    </td>
                    {!active.blind && (
                      <td className={`px-3 py-2 text-right font-mono font-bold ${!l.counted || variance === 0 ? "text-[#525866]" : variance > 0 ? "text-[#15803D]" : "text-[#C8102E]"}`}>
                        {l.counted ? `${variance > 0 ? "+" : ""}${variance}` : "–"}
                      </td>
                    )}
                    {!active.blind && (
                      <td className="px-3 py-2 text-right font-mono text-[#17191d]">{l.counted && l.varianceValue ? rupiah.format(l.varianceValue) : "–"}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {scanning && <ScanModal title="Scan produk (SKU/barcode)" onDetect={focusByCode} onCancel={() => setScanning(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Stock Opname</h1>
          <p className="text-[13px] text-[#525866]">Hitung fisik → kirim ke manajer → manajer setujui, baru stok berubah.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {warehouses.map((w) => (
            <button key={w.id} type="button" disabled={busy} onClick={() => void start(w.id)} className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3 py-2 text-[12.5px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26] disabled:opacity-50">
              <Plus className="size-3.5" /> Opname {w.name}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
              <th className="px-3 py-2.5">Dokumen</th>
              <th className="px-3 py-2.5">Gudang</th>
              <th className="px-3 py-2.5 text-right">Item</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-[#6B7280]"><ClipboardCheck className="mx-auto mb-2 size-6 text-[#D1D5DB]" />Belum ada sesi opname.</td></tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="border-b border-[#F0F1F4] last:border-0">
                  <td className="px-3 py-2.5 font-mono text-[12px] font-bold text-[#C8102E]">{r.doc}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{r.warehouse}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{r.lines}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: STATUS_LABEL[r.status]?.bg ?? "#F3F4F6", color: STATUS_LABEL[r.status]?.fg ?? "#374151" }}>
                      {r.rejected ? "Ditolak · hitung ulang" : (STATUS_LABEL[r.status]?.label ?? r.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => void open(r.id)} className="rounded-md border border-[#E8E8E8] px-2.5 py-1.5 text-[12px] font-semibold text-[#374151] hover:bg-[#F8F9FB]">Buka</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
