"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";

import { useGarageToast } from "@/components/garage/garage-toast";
import { garageApi } from "@/lib/api-client";
import { unitCostCurrency } from "@/lib/garage-data";
import { parseIdNumber } from "@/lib/wms-master-form";
import type { WmsProductRow } from "@/lib/wms-types";
import { cn } from "@/lib/utils";
import { errorText, ui } from "./master-shared";

type Link = { productId: string; refPrice: number; role: "primary" | "alternative"; sku: string; name: string; unit: string; category: string };

/**
 * Bahan yang disediakan supplier: harga referensi (bukan harga final) + utama/alternatif.
 * Menjadikan "utama" juga menyetel supplier utama bahan (dipakai PO dari kekurangan).
 */
export function SupplierProductsPanel({ supplierId, canEdit }: { supplierId: string; canEdit: boolean }) {
  const toast = useGarageToast();
  const [links, setLinks] = useState<Link[] | null>(null);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [role, setRole] = useState<"primary" | "alternative">("primary");
  const [busy, setBusy] = useState(false);

  const fetchLinks = useCallback(() => garageApi.get<Link[]>(`/api/wms/suppliers/${supplierId}/products`), [supplierId]);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchLinks(), canEdit ? garageApi.get<WmsProductRow[]>("/api/wms/products") : Promise.resolve([] as WmsProductRow[])])
      .then(([l, p]) => {
        if (!alive) return;
        setLinks(l);
        setProducts(p);
      })
      .catch(() => { if (alive) setLinks([]); });
    return () => { alive = false; };
  }, [fetchLinks, canEdit]);

  async function save(input: { productId: string; refPrice: number; role: "primary" | "alternative" }, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      await garageApi.put(`/api/wms/suppliers/${supplierId}/products`, input);
      setLinks(await fetchLinks());
      toast.push({ tone: "success", title: success });
      setProductId("");
      setPrice("");
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal", body: errorText(e, "") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: Link) {
    if (busy) return;
    setBusy(true);
    try {
      await garageApi.delete(`/api/wms/suppliers/${supplierId}/products?product=${l.productId}`);
      setLinks(await fetchLinks());
      toast.push({ tone: "success", title: `${l.name} dilepas dari supplier` });
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal", body: errorText(e, "") });
    } finally {
      setBusy(false);
    }
  }

  const chosen = products.find((p) => p.id === productId);
  const priceNum = parseIdNumber(price);

  return (
    <div>
      <h4 className="mb-2 text-[14px] font-bold text-[#111111]">Bahan yang disediakan & harga referensi</h4>
      {canEdit && (
        <div className="mb-2 grid gap-2 rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] p-2 sm:grid-cols-[1fr_130px_130px_auto]">
          <select aria-label="Pilih bahan" value={productId} onChange={(e) => setProductId(e.target.value)} className={ui.input}>
            <option value="">Pilih bahan…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
          <input aria-label="Harga referensi per satuan dasar" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder={`Rp per ${chosen?.unit ?? "satuan"}`} className={cn(ui.input, "text-right")} />
          <select aria-label="Peran supplier" value={role} onChange={(e) => setRole(e.target.value as "primary" | "alternative")} className={ui.input}>
            <option value="primary">Utama</option>
            <option value="alternative">Alternatif</option>
          </select>
          <button
            type="button"
            disabled={busy || !productId || !(priceNum >= 0)}
            onClick={() => void save({ productId, refPrice: Number.isFinite(priceNum) ? priceNum : 0, role }, "Bahan supplier disimpan")}
            className={ui.primary}
          >
            <Plus className="size-4" aria-hidden="true" /> Simpan
          </button>
        </div>
      )}
      <ul className="divide-y divide-[#EEF0F3] rounded-lg border border-[#E8E8E8]">
        {!links ? (
          <li className="px-3 py-3 text-[13px] text-[#6B7280]">Memuat…</li>
        ) : links.length === 0 ? (
          <li className="px-3 py-3 text-[13px] text-[#6B7280]">Belum ada bahan terdaftar untuk supplier ini.</li>
        ) : (
          links.map((l) => (
            <li key={l.productId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="font-semibold">{l.name}</span> <span className="font-mono text-[11.5px] text-[#C8102E]">{l.sku}</span>
                <span className="block text-[12px] text-[#4B5563]">{l.category} · ref {unitCostCurrency.format(l.refPrice)}/{l.unit}</span>
              </span>
              <span className="flex items-center gap-1">
                {l.role === "primary" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#047857]"><Star className="size-3" aria-hidden="true" /> UTAMA</span>
                ) : (
                  <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-bold text-[#374151]">ALTERNATIF</span>
                )}
                {canEdit && l.role !== "primary" && (
                  <button type="button" disabled={busy} onClick={() => void save({ productId: l.productId, refPrice: l.refPrice, role: "primary" }, `${l.name}: supplier utama diganti`)} className={cn(ui.secondary, "h-8 px-2 text-[12px]")}>
                    Jadikan utama
                  </button>
                )}
                {canEdit && (
                  <button type="button" disabled={busy} onClick={() => void remove(l)} className={cn(ui.iconBtn, "hover:text-[#B91C1C]")} aria-label={`Lepas ${l.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
