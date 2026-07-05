"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Check, Pencil, Plus, Printer, ScanLine, Trash2, Truck } from "lucide-react";

import { WmsReceivingChecklistDialog } from "@/components/wms/wms-receiving-checklist-dialog";
import { ScanModal } from "@/components/wms/scan-modal";
import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import {
  isPerishableProduct,
  WMS_PUTAWAY_ZONES,
} from "@/lib/wms-receiving-utils";
import type { WmsProductRow } from "@/lib/wms-types";
import { printWmsDoc, escapeHtml, signatureRow } from "@/lib/wms-print";

type ReceivingRow = {
  id: string;
  doc: string;
  supplier: string;
  status: string;
  items: number;
  totalValue: number;
  createdAt: string;
};

type ReceivingDetail = {
  id: string;
  doc: string;
  supplier: string | null;
  poNumber: string | null;
  additionalCost: number;
  warehouseId: string | null;
  status: string;
  items: Array<{
    productId: string;
    orderedQty: number;
    receivedQty: number;
    buyQty: number | null;
    packSize: number | null;
    hpp: number;
    qc: "pass" | "discrepancy" | "reject";
    batchNo: string | null;
    expiredAt: string | null;
    discrepancyNote: string | null;
    putAwayLocation: string | null;
  }>;
};

type ItemDraft = {
  productId: string;
  orderedQty: string;
  buyQty: string;
  packSize: string;
  receivedQty: string;
  hpp: string;
  qc: "pass" | "discrepancy" | "reject";
  batchNo: string;
  expiredAt: string;
  discrepancyNote: string;
  putAwayLocation: string;
};

type PoDraftStorage = {
  poNumber?: string;
  items?: Array<{ productId: string; orderedQty?: number; hpp?: number }>;
};

const STEP_LABELS = ["Supplier", "Item & Qty", "QC", "Batch", "Put Away"] as const;

const emptyItem = (): ItemDraft => ({
  productId: "",
  orderedQty: "",
  buyQty: "",
  packSize: "",
  receivedQty: "",
  hpp: "",
  qc: "pass",
  batchNo: "",
  expiredAt: "",
  discrepancyNote: "",
  putAwayLocation: "",
});

/** receivedQty efektif: buyQty×packSize bila keduanya diisi, else input manual. */
function effReceived(it: ItemDraft): number {
  const bq = Number(it.buyQty);
  const ps = Number(it.packSize);
  if (bq > 0 && ps > 0) return bq * ps;
  return Number(it.receivedQty) || 0;
}

function expiryWarn(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr).getTime();
  return Number.isFinite(d) && d - Date.now() < 30 * 864e5;
}

function itemToDraft(it: ReceivingDetail["items"][number]): ItemDraft {
  return {
    productId: it.productId,
    orderedQty: String(it.orderedQty || ""),
    buyQty: it.buyQty != null ? String(it.buyQty) : "",
    packSize: it.packSize != null ? String(it.packSize) : "",
    receivedQty: String(it.receivedQty || ""),
    hpp: String(it.hpp || ""),
    qc: it.qc,
    batchNo: it.batchNo ?? "",
    expiredAt: it.expiredAt ? it.expiredAt.slice(0, 10) : "",
    discrepancyNote: it.discrepancyNote ?? "",
    putAwayLocation: it.putAwayLocation ?? "",
  };
}

function stepHighlight(step: number, target: number): string {
  return step === target ? "bg-[#FDF1F3] text-[#C8102E]" : "";
}

/** Cetak label QR sederhana untuk item yang selesai diterima. */
async function printReceivingLabels(
  items: Array<{ sku: string; name: string; batchNo?: string }>,
) {
  if (items.length === 0) return;
  const cards = await Promise.all(
    items.map(async (p) => {
      const payload = p.batchNo ? `${p.sku}|${p.batchNo}` : p.sku;
      const qr = await QRCode.toDataURL(payload, { margin: 1, width: 220 });
      return `<div class="lbl"><img src="${qr}" alt="${escapeHtml(p.sku)}"/><div class="nm">${escapeHtml(p.name)}</div><div class="sku">${escapeHtml(p.sku)}</div>${p.batchNo ? `<div class="batch">${escapeHtml(p.batchNo)}</div>` : ""}</div>`;
    }),
  );
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Label Penerimaan</title><style>
    *{font-family:Inter,system-ui,sans-serif;box-sizing:border-box}
    body{margin:0;padding:12px}
    .grid{display:flex;flex-wrap:wrap;gap:10px}
    .lbl{width:180px;border:1px solid #ccc;border-radius:8px;padding:8px;text-align:center;page-break-inside:avoid}
    .lbl img{width:120px;height:120px}
    .nm{font-size:12px;font-weight:700;margin-top:4px;line-height:1.2}
    .sku{font-family:monospace;font-size:12px;color:#C8102E;font-weight:700}
    .batch{font-size:10px;color:#6B7280;margin-top:2px}
    @media print{.noprint{display:none}}
  </style></head><body>
    <button class="noprint" onclick="window.print()" style="margin-bottom:10px;padding:8px 14px;background:#C8102E;color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">Cetak</button>
    <div class="grid">${cards.join("")}</div>
  </body></html>`);
  win.document.close();
}

function buildPayloadItems(items: ItemDraft[]) {
  return items
    .filter((it) => it.productId && effReceived(it) >= 0)
    .map((it) => ({
      productId: it.productId,
      orderedQty: Number(it.orderedQty) || 0,
      receivedQty: effReceived(it),
      hpp: Number(it.hpp) || 0,
      qc: it.qc,
      batchNo: it.batchNo.trim() || undefined,
      expiredAt: it.expiredAt || null,
      buyQty: Number(it.buyQty) || null,
      packSize: Number(it.packSize) || null,
      discrepancyNote: it.discrepancyNote.trim() || undefined,
      putAwayLocation: it.putAwayLocation.trim() || undefined,
    }));
}

export default function WmsReceivingPage() {
  const searchParams = useSearchParams();
  const warehouseId = searchParams.get("wh") ?? "";

  const [list, setList] = useState<ReceivingRow[]>([]);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);

  const [supplier, setSupplier] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [additionalCost, setAdditionalCost] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [scanning, setScanning] = useState(false);

  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistAction, setChecklistAction] = useState<"submit" | "complete" | null>(null);
  const [completeTargetId, setCompleteTargetId] = useState<string | null>(null);

  const editLoadedRef = useRef<string | null>(null);
  const poDraftLoadedRef = useRef(false);

  const input =
    "h-9 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";

  async function loadSuppliers() {
    try {
      setSuppliers(await garageApi.get<Array<{ id: string; name: string }>>("/api/wms/suppliers"));
    } catch {
      /* abaikan */
    }
  }

  async function load() {
    const [recs, prods] = await Promise.all([
      garageApi.get<ReceivingRow[]>("/api/wms/receiving"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
    ]);
    setList(recs);
    setProducts(prods);
    void loadSuppliers();
  }

  const resetForm = useCallback(() => {
    setSupplier("");
    setPoNumber("");
    setAdditionalCost("");
    setItems([emptyItem()]);
    setEditId(null);
    setStep(0);
    setCreating(false);
  }, []);

  const applyDraft = useCallback((draft: ReceivingDetail) => {
    setSupplier(draft.supplier ?? "");
    setPoNumber(draft.poNumber ?? "");
    setAdditionalCost(String(draft.additionalCost || ""));
    setItems(draft.items.length ? draft.items.map(itemToDraft) : [emptyItem()]);
    setEditId(draft.id);
    setCreating(true);
    setStep(0);
  }, []);

  const openDraft = useCallback(
    async (id: string) => {
      setBusy(true);
      setMsg(null);
      try {
        const draft = await garageApi.get<ReceivingDetail>(`/api/wms/receiving/${id}`);
        applyDraft(draft);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Gagal memuat draft.");
      } finally {
        setBusy(false);
      }
    },
    [applyDraft],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [recs, prods] = await Promise.all([
          garageApi.get<ReceivingRow[]>("/api/wms/receiving"),
          garageApi.get<WmsProductRow[]>("/api/wms/products"),
        ]);
        if (alive) {
          setList(recs);
          setProducts(prods);
          void loadSuppliers();
        }
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (poDraftLoadedRef.current) return;
    poDraftLoadedRef.current = true;
    try {
      const raw = sessionStorage.getItem("wms-po-draft");
      if (!raw) return;
      sessionStorage.removeItem("wms-po-draft");
      const parsed = JSON.parse(raw) as PoDraftStorage;
      if (parsed.poNumber) setPoNumber(parsed.poNumber);
      if (parsed.items?.length) {
        setItems(
          parsed.items.map((it) => ({
            ...emptyItem(),
            productId: it.productId,
            orderedQty: String(it.orderedQty ?? ""),
            hpp: it.hpp != null ? String(it.hpp) : "",
          })),
        );
        setCreating(true);
        setStep(1);
      }
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (!editParam || editLoadedRef.current === editParam) return;
    editLoadedRef.current = editParam;
    void openDraft(editParam);
  }, [searchParams, openDraft]);

  function addByCode(code: string) {
    const q = code.trim().toLowerCase();
    const p = products.find((x) => x.sku.toLowerCase() === q || (x.barcode ?? "").toLowerCase() === q);
    setScanning(false);
    if (!p) {
      window.alert(`Produk dengan kode "${code}" tak ditemukan. Daftarkan dulu di Inventory.`);
      return;
    }
    setItems((prev) => {
      const existing = prev.find((it) => it.productId === p.id);
      if (existing) {
        return prev.map((it) =>
          it.productId === p.id
            ? { ...it, receivedQty: String((Number(it.receivedQty) || 0) + 1) }
            : it,
        );
      }
      const empty = prev.findIndex((it) => !it.productId);
      const row: ItemDraft = {
        ...emptyItem(),
        productId: p.id,
        receivedQty: "1",
        hpp: String(p.hpp || ""),
      };
      if (empty >= 0) return prev.map((it, i) => (i === empty ? row : it));
      return [...prev, row];
    });
    setStep(1);
  }

  async function saveSupplier() {
    if (newSupplier.trim().length < 2) return;
    try {
      const s = await garageApi.post<{ name: string }>("/api/wms/suppliers", { name: newSupplier.trim() });
      await loadSuppliers();
      setSupplier(s.name);
      setNewSupplier("");
      setAddingSupplier(false);
    } catch {
      /* abaikan */
    }
  }

  const totalValue =
    items.reduce((s, it) => s + effReceived(it) * (Number(it.hpp) || 0), 0) + (Number(additionalCost) || 0);
  const valid = items.some((it) => it.productId && effReceived(it) > 0);

  function labelItemsFromDraft() {
    return items
      .filter((it) => it.productId && effReceived(it) > 0 && it.qc !== "reject")
      .map((it) => {
        const p = products.find((x) => x.id === it.productId);
        return {
          sku: p?.sku ?? it.productId,
          name: p?.name ?? "-",
          batchNo: it.batchNo.trim() || undefined,
        };
      });
  }

  async function labelItemsFromReceivingId(id: string) {
    try {
      const rec = await garageApi.get<ReceivingDetail>(`/api/wms/receiving/${id}`);
      return rec.items
        .filter((it) => it.receivedQty > 0 && it.qc !== "reject")
        .map((it) => {
          const p = products.find((x) => x.id === it.productId);
          return {
            sku: p?.sku ?? it.productId,
            name: p?.name ?? "-",
            batchNo: it.batchNo?.trim() || undefined,
          };
        });
    } catch {
      return [];
    }
  }

  async function offerPrintLabels(getLabels: () => Promise<Array<{ sku: string; name: string; batchNo?: string }>>) {
    const labels = await getLabels();
    if (labels.length === 0) return;
    if (window.confirm(`Cetak ${labels.length} label QR untuk item yang diterima?`)) {
      await printReceivingLabels(labels);
    }
  }

  async function doSubmit(complete: boolean) {
    if (!valid || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        supplier: supplier.trim() || undefined,
        poNumber: poNumber.trim() || undefined,
        additionalCost: Number(additionalCost) || 0,
        warehouseId: warehouseId || undefined,
        items: buildPayloadItems(items),
      };

      let recId: string;
      let recDoc: string;

      if (editId) {
        const rec = await garageApi.patch<{ id: string; doc: string }>(`/api/wms/receiving/${editId}`, payload);
        recId = rec.id;
        recDoc = rec.doc;
      } else {
        const rec = await garageApi.post<{ id: string; doc: string }>("/api/wms/receiving", payload);
        recId = rec.id;
        recDoc = rec.doc;
      }

      if (complete) {
        await garageApi.post(`/api/wms/receiving/${recId}/complete`, {});
        setMsg(`Penerimaan ${recDoc} selesai — stok & HPP diperbarui.`);
        await offerPrintLabels(async () => labelItemsFromDraft());
      } else {
        setMsg(`Draft ${recDoc} disimpan.`);
      }

      resetForm();
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menyimpan penerimaan.");
    } finally {
      setBusy(false);
    }
  }

  async function doComplete(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await garageApi.post(`/api/wms/receiving/${id}/complete`, {});
      setMsg("Penerimaan selesai — stok & HPP diperbarui.");
      await offerPrintLabels(() => labelItemsFromReceivingId(id));
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menyelesaikan penerimaan.");
    } finally {
      setBusy(false);
    }
  }

  function requestSubmitComplete() {
    if (!valid || busy) return;
    setChecklistAction("submit");
    setCompleteTargetId(null);
    setChecklistOpen(true);
  }

  function requestCompleteFromList(id: string) {
    if (busy) return;
    setChecklistAction("complete");
    setCompleteTargetId(id);
    setChecklistOpen(true);
  }

  function handleChecklistConfirm() {
    setChecklistOpen(false);
    if (checklistAction === "submit") {
      void doSubmit(true);
    } else if (checklistAction === "complete" && completeTargetId) {
      void doComplete(completeTargetId);
    }
    setChecklistAction(null);
    setCompleteTargetId(null);
  }

  function handleChecklistCancel() {
    setChecklistOpen(false);
    setChecklistAction(null);
    setCompleteTargetId(null);
  }

  const progressPct = ((step + 1) / STEP_LABELS.length) * 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Receiving</h1>
          <p className="text-[13px] text-[#6B7280]">
            Penerimaan barang dari supplier → stok + batch + HPP. Bahan otomatis masuk ke{" "}
            <b>Ruang Bar/Dapur</b> sesuai kategori.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (creating) resetForm();
            else {
              setCreating(true);
              setStep(0);
            }
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#C8102E] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,0.25)] hover:bg-[#a60d26]"
        >
          <Plus className="size-4" /> {creating ? "Tutup Form" : "Penerimaan Baru"}
        </button>
      </div>

      {msg && <p className="text-[13px] font-semibold text-[#16A34A]">{msg}</p>}

      {creating && (
        <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          {/* 5-step progress bar */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
              <span>
                Langkah {step + 1}/{STEP_LABELS.length}: {STEP_LABELS[step]}
              </span>
              {editId && (
                <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#D97706]">
                  Edit Draft
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#F0F1F4]">
              <div
                className="h-full rounded-full bg-[#C8102E] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {STEP_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-colors ${
                    step === i
                      ? "bg-[#C8102E] text-white"
                      : i < step
                        ? "bg-[#FDF1F3] text-[#C8102E]"
                        : "bg-[#F8F9FB] text-[#6B7280] hover:bg-[#F0F1F4]"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 0: Supplier */}
          <div
            className={`mb-3 rounded-lg border p-3 transition-colors ${
              step === 0 ? "border-[#C8102E]/30 bg-[#FDF1F3]" : "border-transparent"
            }`}
          >
            <select
              value={addingSupplier ? "__new__" : supplier}
              onChange={(e) => {
                if (e.target.value === "__new__") setAddingSupplier(true);
                else {
                  setAddingSupplier(false);
                  setSupplier(e.target.value);
                }
              }}
              className={`${input} w-full sm:w-80`}
            >
              <option value="">Pilih supplier (opsional)…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
              <option value="__new__">+ Supplier baru…</option>
            </select>
            {addingSupplier && (
              <div className="mt-2 flex gap-2 sm:w-80">
                <input
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  placeholder="Nama supplier baru"
                  className={`${input} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void saveSupplier()}
                  className="rounded-md bg-[#2F3136] px-3 text-[12px] font-semibold text-white hover:bg-black"
                >
                  Simpan
                </button>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="No. PO / referensi (opsional)"
                className={`${input} w-full sm:w-52`}
              />
              <input
                value={additionalCost}
                onChange={(e) => setAdditionalCost(e.target.value)}
                inputMode="decimal"
                placeholder="Biaya tambahan Rp (ongkir/pajak)"
                className={`${input} w-full sm:w-56`}
                title="Dialokasikan proporsional ke HPP bahan (landed cost)"
              />
            </div>
          </div>

          <div className="max-h-[440px] overflow-auto rounded-lg border border-[#F0F1F4]">
            <table className="w-full min-w-[1180px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#E8E8E8]">
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                  <th className={`py-1.5 pr-2 ${stepHighlight(step, 1)}`}>Produk</th>
                  <th className={`py-1.5 px-2 text-right ${stepHighlight(step, 1)}`}>Dipesan</th>
                  <th className={`py-1.5 px-2 text-center ${stepHighlight(step, 1)}`}>Beli (qty × isi)</th>
                  <th className={`py-1.5 px-2 text-right ${stepHighlight(step, 1)}`}>Diterima</th>
                  <th className={`py-1.5 px-2 text-right ${stepHighlight(step, 1)}`}>HPP/unit</th>
                  <th className={`py-1.5 px-2 ${stepHighlight(step, 2)}`}>QC</th>
                  <th className={`py-1.5 px-2 ${stepHighlight(step, 3)}`}>Batch</th>
                  <th className={`py-1.5 px-2 ${stepHighlight(step, 3)}`}>
                    Expired{step === 3 && <span className="ml-0.5 normal-case text-[#9CA3AF]">(basi*)</span>}
                  </th>
                  <th className={`py-1.5 px-2 ${stepHighlight(step, 4)}`}>Put Away</th>
                  <th className="py-1.5 px-2">Catatan</th>
                  <th className="py-1.5 pl-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const prod = products.find((p) => p.id === it.productId);
                  const perishable = prod ? isPerishableProduct(prod.name, prod.category) : false;
                  return (
                    <tr key={idx}>
                      <td className={`py-1 pr-2 ${stepHighlight(step, 1)}`}>
                        <select
                          value={it.productId}
                          onChange={(e) => {
                            const pid = e.target.value;
                            const p = products.find((x) => x.id === pid);
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      productId: pid,
                                      hpp: p ? String(p.hpp || "") : x.hpp,
                                    }
                                  : x,
                              ),
                            );
                          }}
                          className={`${input} w-44`}
                        >
                          <option value="">Pilih…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.unit})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 1)}`}>
                        <input
                          value={it.orderedQty}
                          onChange={(e) =>
                            setItems((p) => p.map((x, i) => (i === idx ? { ...x, orderedQty: e.target.value } : x)))
                          }
                          inputMode="decimal"
                          className={`${input} w-20 text-right`}
                        />
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 1)}`}>
                        <div className="flex items-center justify-center gap-1">
                          <input
                            value={it.buyQty}
                            onChange={(e) =>
                              setItems((p) => p.map((x, i) => (i === idx ? { ...x, buyQty: e.target.value } : x)))
                            }
                            inputMode="decimal"
                            placeholder="dus"
                            className={`${input} w-14 text-right`}
                          />
                          <span className="text-[#9CA3AF]">×</span>
                          <input
                            value={it.packSize}
                            onChange={(e) =>
                              setItems((p) => p.map((x, i) => (i === idx ? { ...x, packSize: e.target.value } : x)))
                            }
                            inputMode="decimal"
                            placeholder="isi"
                            className={`${input} w-14 text-right`}
                          />
                        </div>
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 1)}`}>
                        {(() => {
                          const auto = Number(it.buyQty) > 0 && Number(it.packSize) > 0;
                          const recv = effReceived(it);
                          const ord = Number(it.orderedQty) || 0;
                          const badge =
                            ord > 0 && recv > 0 ? (recv < ord ? "kurang" : recv > ord ? "lebih" : "pas") : null;
                          return (
                            <div className="flex items-center justify-end gap-1">
                              {auto ? (
                                <span className="w-20 rounded-md bg-[#F8F9FB] px-2 py-1.5 text-right font-mono text-[13px] text-[#111111]">
                                  {recv}
                                </span>
                              ) : (
                                <input
                                  value={it.receivedQty}
                                  onChange={(e) =>
                                    setItems((p) =>
                                      p.map((x, i) => (i === idx ? { ...x, receivedQty: e.target.value } : x)),
                                    )
                                  }
                                  inputMode="decimal"
                                  className={`${input} w-20 text-right`}
                                />
                              )}
                              {badge && (
                                <span
                                  className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                                    badge === "pas"
                                      ? "bg-[#DCFCE7] text-[#16A34A]"
                                      : badge === "kurang"
                                        ? "bg-[#FEF3C7] text-[#D97706]"
                                        : "bg-[#E0E7FF] text-[#4338CA]"
                                  }`}
                                >
                                  {badge}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 1)}`}>
                        <input
                          value={it.hpp}
                          onChange={(e) =>
                            setItems((p) => p.map((x, i) => (i === idx ? { ...x, hpp: e.target.value } : x)))
                          }
                          inputMode="decimal"
                          className={`${input} w-24 text-right`}
                        />
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 2)}`}>
                        <select
                          value={it.qc}
                          onChange={(e) =>
                            setItems((p) =>
                              p.map((x, i) =>
                                i === idx ? { ...x, qc: e.target.value as ItemDraft["qc"] } : x,
                              ),
                            )
                          }
                          className={`${input} w-32`}
                        >
                          <option value="pass">PASS</option>
                          <option value="discrepancy">DISCREPANCY</option>
                          <option value="reject">REJECT</option>
                        </select>
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 3)}`}>
                        <input
                          value={it.batchNo}
                          onChange={(e) =>
                            setItems((p) => p.map((x, i) => (i === idx ? { ...x, batchNo: e.target.value } : x)))
                          }
                          placeholder="auto"
                          className={`${input} w-28`}
                        />
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 3)}`}>
                        <div className="flex items-center gap-1">
                          {perishable && (
                            <span className="text-[12px] font-bold text-[#C8102E]" title="Wajib untuk bahan basi">
                              *
                            </span>
                          )}
                          <input
                            type="date"
                            value={it.expiredAt}
                            onChange={(e) =>
                              setItems((p) => p.map((x, i) => (i === idx ? { ...x, expiredAt: e.target.value } : x)))
                            }
                            className={`${input} w-36 ${
                              perishable && !it.expiredAt
                                ? "border-[#C8102E]/50 bg-[#FDF1F3]"
                                : expiryWarn(it.expiredAt)
                                  ? "border-[#D97706] bg-[#FFFBEB] text-[#B45309]"
                                  : ""
                            }`}
                            title={
                              expiryWarn(it.expiredAt)
                                ? "Kadaluarsa < 30 hari"
                                : perishable
                                  ? "Wajib untuk bahan basi"
                                  : undefined
                            }
                          />
                        </div>
                      </td>
                      <td className={`py-1 px-2 ${stepHighlight(step, 4)}`}>
                        <select
                          value={it.putAwayLocation}
                          onChange={(e) =>
                            setItems((p) =>
                              p.map((x, i) => (i === idx ? { ...x, putAwayLocation: e.target.value } : x)),
                            )
                          }
                          className={`${input} w-36`}
                        >
                          <option value="">— zona —</option>
                          {WMS_PUTAWAY_ZONES.map((z) => (
                            <option key={z} value={z}>
                              {z}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 px-2">
                        <input
                          value={it.discrepancyNote}
                          onChange={(e) =>
                            setItems((p) =>
                              p.map((x, i) => (i === idx ? { ...x, discrepancyNote: e.target.value } : x)),
                            )
                          }
                          placeholder="selisih/kondisi"
                          className={`${input} w-32`}
                        />
                      </td>
                      <td className="py-1 pl-2">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                            className="grid size-8 place-items-center rounded-md text-[#DC2626] hover:bg-[#FEE2E2]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setItems((p) => [...p, emptyItem()])}
              className="flex items-center gap-1 text-[12.5px] font-semibold text-[#C8102E]"
            >
              <Plus className="size-3.5" /> Tambah baris
            </button>
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="flex items-center gap-1 text-[12.5px] font-semibold text-[#2563EB]"
            >
              <ScanLine className="size-3.5" /> Scan bahan
            </button>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={step <= 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="rounded-md border border-[#E8E8E8] px-2.5 py-1.5 text-[12px] font-semibold text-[#6B7280] disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <button
                type="button"
                disabled={step >= STEP_LABELS.length - 1}
                onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
                className="rounded-md border border-[#E8E8E8] px-2.5 py-1.5 text-[12px] font-semibold text-[#6B7280] disabled:opacity-40"
              >
                Selanjutnya →
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0F1F4] pt-3">
            <span className="text-[13px] text-[#6B7280]">
              Total nilai diterima:{" "}
              <span className="font-mono font-bold text-[#111111]">{currency.format(Math.round(totalValue))}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!valid}
                onClick={() => {
                  const rows = items
                    .filter((it) => it.productId && effReceived(it) > 0)
                    .map((it) => {
                      const p = products.find((x) => x.id === it.productId);
                      return `<tr><td>${escapeHtml(p?.name ?? "-")}</td><td class="c">${escapeHtml(p?.unit ?? "")}</td><td class="r">${effReceived(it)}</td><td class="r">${currency.format(Number(it.hpp) || 0)}</td><td class="c">${escapeHtml(it.batchNo || "-")}</td></tr>`;
                    })
                    .join("");
                  printWmsDoc(
                    "Bukti Penerimaan Barang",
                    `<table><thead><tr><th>Bahan</th><th class="c">Satuan</th><th class="r">Qty</th><th class="r">HPP</th><th class="c">Batch</th></tr></thead><tbody>${rows}</tbody></table>${signatureRow(["Penerima (Gudang)", "Pengirim (Supplier)"])}`,
                    `Supplier: ${supplier || "-"}`,
                  );
                }}
                className="flex items-center gap-1.5 rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#111111] hover:bg-[#F8F9FB] disabled:opacity-50"
              >
                <Printer className="size-4 text-[#2563EB]" /> Cetak
              </button>
              <button
                type="button"
                onClick={() => void doSubmit(false)}
                disabled={!valid || busy}
                className="rounded-md border border-[#E8E8E8] px-3 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB] disabled:opacity-50"
              >
                Simpan Draft
              </button>
              <button
                type="button"
                onClick={requestSubmitComplete}
                disabled={!valid || busy}
                className="flex items-center gap-1.5 rounded-md bg-[#16A34A] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50"
              >
                <Check className="size-4" /> Simpan &amp; Selesaikan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="max-h-[520px] overflow-auto rounded-xl border border-[#E8E8E8] bg-white">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
              <th className="px-3 py-2.5">Dokumen</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-3 py-2.5 text-right">Item</th>
              <th className="px-3 py-2.5 text-right">Nilai</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[#6B7280]">
                  <Truck className="mx-auto mb-2 size-6 text-[#D1D5DB]" />
                  Belum ada penerimaan. Klik &quot;Penerimaan Baru&quot;.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="border-b border-[#F0F1F4] last:border-0">
                  <td className="px-3 py-2.5 font-mono text-[12px] font-bold text-[#C8102E]">{r.doc}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{r.supplier || "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{r.items}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#111111]">{currency.format(r.totalValue)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {(r.status === "draft" || r.status === "pending_approval") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void openDraft(r.id)}
                          className="flex items-center gap-1 rounded-md border border-[#E8E8E8] px-2.5 py-1.5 text-[12px] font-semibold text-[#374151] hover:bg-[#F8F9FB] disabled:opacity-50"
                        >
                          <Pencil className="size-3.5" /> Edit
                        </button>
                      )}
                      {r.status !== "completed" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => requestCompleteFromList(r.id)}
                          className="rounded-md bg-[#16A34A] px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50"
                        >
                          Selesaikan
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {scanning && (
        <ScanModal title="Scan bahan (SKU/barcode)" onDetect={addByCode} onCancel={() => setScanning(false)} />
      )}

      <WmsReceivingChecklistDialog
        open={checklistOpen}
        onCancel={handleChecklistCancel}
        onConfirm={handleChecklistConfirm}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold uppercase text-[#16A34A]">
        Selesai
      </span>
    );
  }
  if (status === "pending_approval") {
    return (
      <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold uppercase text-[#D97706]">
        Menunggu Approval
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold uppercase text-[#6B7280]">Draft</span>
  );
}
