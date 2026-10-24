"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";

import { garageApi } from "@/lib/api-client";

type Issue = {
  id: string;
  kind: "not_in_wms" | "unit_mismatch" | "oversold" | "batch_gap";
  sku: string;
  productName: string | null;
  refDoc: string;
  detail: string;
  qty: number;
  createdAt: string;
};

type Gap = { productId: string; warehouseId: string; sku: string; name: string; unit: string; warehouseName: string; balance: number; batchTotal: number; gap: number };

const KIND_LABEL: Record<Issue["kind"], string> = {
  not_in_wms: "Belum di gudang",
  unit_mismatch: "Satuan beda",
  oversold: "Terjual melebihi stok",
  batch_gap: "Selisih batch",
};

const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

/**
 * Kesehatan stok: masalah yang dulu terlewat diam-diam + cek Σ batch = saldo ruang.
 * Hanya untuk Owner/Manajer (API menolak peran lain → panel disembunyikan).
 */
export function WmsStockHealthPanel() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [gaps, setGaps] = useState<Gap[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, g] = await Promise.allSettled([
      garageApi.get<Issue[]>("/api/wms/stock-issues"),
      garageApi.get<Gap[]>("/api/wms/integrity"),
    ]);
    setIssues(i.status === "fulfilled" ? i.value : null);
    setGaps(g.status === "fulfilled" ? g.value : null);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.allSettled([
      garageApi.get<Issue[]>("/api/wms/stock-issues"),
      garageApi.get<Gap[]>("/api/wms/integrity"),
    ]).then(([i, g]) => {
      if (!alive) return;
      setIssues(i.status === "fulfilled" ? i.value : null);
      setGaps(g.status === "fulfilled" ? g.value : null);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (issues === null && gaps === null) return null;

  const resolve = async (id: string) => {
    setBusy(true);
    try {
      await garageApi.post(`/api/wms/stock-issues/${id}/resolve`, {});
      await load();
    } finally {
      setBusy(false);
    }
  };

  const fixGaps = async () => {
    if (!window.confirm("Samakan batch dengan saldo ruang? Saldo stok tidak berubah, hanya batch yang disesuaikan.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await garageApi.post<{ fixed: number }>("/api/wms/integrity", {});
      setNotice(`${result.fixed} bahan/ruang disamakan.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menyamakan batch.");
    } finally {
      setBusy(false);
    }
  };

  const openIssues = issues ?? [];
  const openGaps = gaps ?? [];
  const healthy = openIssues.length === 0 && openGaps.length === 0;

  return (
    <section className="rounded-xl border border-[#E8E8E8] bg-white p-4" data-testid="wms-stock-health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#111111]">
          {healthy ? <CheckCircle2 className="size-4 text-[#15803D]" aria-hidden /> : <ShieldAlert className="size-4 text-[#C8102E]" aria-hidden />}
          Kesehatan stok
        </h2>
        <span className="text-[12px] text-[#525866]">
          {healthy ? "Ledger, batch & resep cocok." : `${openIssues.length} masalah · ${openGaps.length} selisih batch`}
        </span>
      </div>
      {notice && <p className="mt-2 text-[13px] text-[#525866]">{notice}</p>}

      {openIssues.length > 0 && (
        <ul className="mt-3 max-h-72 divide-y divide-[#EEEEEE] overflow-y-auto">
          {openIssues.map((issue) => (
            <li key={issue.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[#17191d]">
                  <span className="mr-2 rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[11px] font-bold text-[#92400E]">{KIND_LABEL[issue.kind]}</span>
                  {issue.productName ?? issue.sku}
                </p>
                <p className="text-[12px] text-[#525866]">
                  {issue.detail} Total {qtyFormat.format(issue.qty)} · terakhir {issue.refDoc}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void resolve(issue.id)}
                className="min-h-9 shrink-0 rounded-md border border-[#dedfe4] px-3 text-[12px] font-semibold text-[#17191d] hover:bg-[#F5F5F5] disabled:opacity-60"
              >
                Tandai beres
              </button>
            </li>
          ))}
        </ul>
      )}

      {openGaps.length > 0 && (
        <div className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[12px]">
              <thead className="text-[#525866]">
                <tr>
                  <th className="py-1 pr-2 font-semibold">Bahan</th>
                  <th className="py-1 pr-2 font-semibold">Ruang</th>
                  <th className="py-1 pr-2 text-right font-semibold">Saldo</th>
                  <th className="py-1 pr-2 text-right font-semibold">Σ batch</th>
                  <th className="py-1 text-right font-semibold">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE] text-[#17191d]">
                {openGaps.slice(0, 50).map((g) => (
                  <tr key={`${g.productId}-${g.warehouseId}`}>
                    <td className="py-1 pr-2">{g.name}</td>
                    <td className="py-1 pr-2">{g.warehouseName}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{qtyFormat.format(g.balance)} {g.unit}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{qtyFormat.format(g.batchTotal)}</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{qtyFormat.format(g.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void fixGaps()}
            className="mt-2 min-h-10 rounded-md bg-[#bd1230] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            Samakan batch dengan saldo (Owner)
          </button>
        </div>
      )}
    </section>
  );
}
