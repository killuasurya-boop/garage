"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet, ShieldCheck, Upload, XCircle } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { MasterImportPlan } from "@/lib/master-import-plan";

type ImportResult = {
  fileName?: string;
  summary: Record<string, number>;
  plan: MasterImportPlan;
  materialsCreated?: number;
  recipesDrafted?: number;
};

type DraftRecipe = {
  menuItemId: string;
  menuName: string;
  price: number;
  referenceHpp: number;
  lines: Array<{ sku: string; name: string; qty: number; unit: string; unitCost: number; cost: number }>;
};

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

const RECIPE_STATUS: Record<string, string> = {
  new_draft: "Jadi draft",
  has_active: "Sudah ada resep aktif — dilewati",
  has_archived: "Resep pernah diarsip/ditolak — dilewati",
  invalid_lines: "Jumlah atau satuan bahan tidak valid — dilewati",
  has_draft: "Sudah ada draft — dilewati",
  menu_not_found: "Menu tidak ditemukan di POS",
  no_lines: "Tidak ada bahan valid",
};

/**
 * Impor master Excel (Owner) + persetujuan resep draft (Owner/Manajer).
 * Data POS (produk, harga, kategori) tidak pernah diubah oleh impor ini.
 */
export function WmsMasterImport() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [applied, setApplied] = useState(false);
  const [drafts, setDrafts] = useState<DraftRecipe[]>([]);

  async function loadDrafts() {
    try {
      setDrafts(await garageApi.get<DraftRecipe[]>("/api/wms/master-import/drafts"));
    } catch {
      setDrafts([]);
    }
  }

  useEffect(() => {
    let alive = true;
    void garageApi
      .get<DraftRecipe[]>("/api/wms/master-import/drafts")
      .then((d) => {
        if (alive) setDrafts(d);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function send(mode: "preview" | "apply") {
    if (!file || busy) return;
    if (mode === "apply" && !window.confirm("Terapkan impor? Bahan baru ditambahkan & resep Dapur masuk sebagai DRAFT. Produk, harga jual & kategori POS tidak diubah.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      const res = await fetch("/api/wms/master-import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Impor gagal.");
      setResult(json.data);
      setApplied(mode === "apply");
      if (mode === "apply") {
        setMsg({ tone: "ok", text: `Diterapkan: ${json.data.materialsCreated} bahan baru, ${json.data.recipesDrafted} resep draft.` });
        await loadDrafts();
      }
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Impor gagal." });
    } finally {
      setBusy(false);
    }
  }

  async function decide(d: DraftRecipe, action: "approve" | "reject") {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt(`Tolak resep draft ${d.menuName}? Tulis alasan:`)?.trim() ?? "";
      if (reason.length < 3) return;
    } else if (!window.confirm(`Setujui resep ${d.menuName}? Mulai sekarang bahan dipotong saat menu terjual dan HPP menu = ${rupiah(d.referenceHpp)}.`)) {
      return;
    }
    setBusy(true);
    try {
      await garageApi.post(`/api/wms/master-import/drafts/${encodeURIComponent(d.menuItemId)}`, action === "approve" ? { action } : { action, reason });
      setMsg({ tone: "ok", text: action === "approve" ? `Resep ${d.menuName} aktif.` : `Draft ${d.menuName} ditolak (diarsip).` });
      await loadDrafts();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Gagal memproses resep." });
    } finally {
      setBusy(false);
    }
  }

  const plan = result?.plan;
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold disabled:opacity-50";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#E8E8E8] bg-white p-4" data-testid="master-import">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#111111]">
              <FileSpreadsheet className="size-4 text-[#C8102E]" /> Impor Master Excel
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#4B5563]">
              Bahan baru ditambahkan, resep Dapur masuk sebagai <b>draft</b> (tidak memotong stok). Produk, harga jual &amp; kategori POS tidak diubah. Khusus Owner.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] px-2 py-0.5 text-[11.5px] font-semibold text-[#166534]">
            <ShieldCheck className="size-3.5" /> Data POS terlindungi
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".xlsx"
            data-testid="master-import-file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setApplied(false);
            }}
            className="max-w-full text-[12.5px] text-[#111111] file:mr-2 file:rounded-md file:border file:border-[#E8E8E8] file:bg-[#F8F9FB] file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold"
          />
          <button type="button" disabled={!file || busy} onClick={() => void send("preview")} className={`${btn} border border-[#E8E8E8] bg-white text-[#111111]`}>
            <Upload className="size-4" /> Pratinjau
          </button>
          <button
            type="button"
            disabled={!file || busy || !result || applied}
            onClick={() => void send("apply")}
            data-testid="master-import-apply"
            className={`${btn} bg-[#C8102E] text-white`}
          >
            Terapkan
          </button>
        </div>
        {msg && <p className={`mt-2 text-[12.5px] font-semibold ${msg.tone === "ok" ? "text-[#16A34A]" : "text-[#C8102E]"}`}>{msg.text}</p>}

        {plan && (
          <div className="mt-4 space-y-3" data-testid="master-import-preview">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Bahan baru", plan.materials.toCreate.length],
                ["Bahan sudah ada", plan.materials.alreadyExists.length],
                ["Resep Dapur → draft", plan.recipes.filter((r) => r.status === "new_draft").length],
                ["Selisih bahan bar", plan.materials.barDifferences.length],
                ["Selisih resep bar", plan.barRecipeDifferences.length],
                ["Menu Excel tak ada di POS", plan.posReconciliation.excelNotInGarage.length],
                ["Menu POS tak ada di Excel", plan.posReconciliation.garageNotInExcel.length],
                ["Bahan virtual dilewati", plan.materials.virtualSkipped.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] px-3 py-2">
                  <p className="text-[11.5px] font-semibold text-[#4B5563]">{label}</p>
                  <p className="text-[18px] font-extrabold text-[#111111]">{value}</p>
                </div>
              ))}
            </div>

            <Details title={`Bahan baru (${plan.materials.toCreate.length})`} open>
              <Table
                head={["SKU", "Nama", "Satuan", "Isi", "Harga kemasan", "HPP/satuan", "Validasi"]}
                rows={plan.materials.toCreate.map((m) => [
                  m.sku,
                  m.name,
                  m.unit,
                  String(m.packQty),
                  rupiah(m.packPrice),
                  `Rp${m.unitCost.toLocaleString("id-ID")}`,
                  m.validated ? "OK" : "Belum tervalidasi",
                ])}
              />
            </Details>
            <Details title={`Resep Dapur (${plan.recipes.length})`}>
              <Table
                head={["Excel", "Menu POS", "HPP referensi", "Status", "Baris dilewati"]}
                rows={plan.recipes.map((r) => [
                  `${r.recipeId} · ${r.excelMenu}`,
                  r.menuName ?? "-",
                  rupiah(r.referenceHpp),
                  RECIPE_STATUS[r.status] ?? r.status,
                  r.skippedLines.map((l) => l.materialKey).join(", ") || "-",
                ])}
              />
            </Details>
            {plan.materials.barDifferences.length > 0 && (
              <Details title={`Selisih bahan bar — Garage dipertahankan (${plan.materials.barDifferences.length})`}>
                <Table head={["SKU", "Nama", "Kolom", "Excel", "Garage"]} rows={plan.materials.barDifferences.map((d) => [d.sku, d.name, d.field, d.excel, d.garage])} />
              </Details>
            )}
            {plan.barRecipeDifferences.length > 0 && (
              <Details title={`Selisih resep bar — tidak ditimpa (${plan.barRecipeDifferences.length})`}>
                <Table head={["Excel", "Menu", "Varian", "Detail"]} rows={plan.barRecipeDifferences.map((d) => [d.recipeId, d.menu, d.variant, d.detail])} />
              </Details>
            )}
            <Details title="Rekonsiliasi menu POS (hanya laporan)">
              <p className="mb-1 text-[12px] font-semibold text-[#111111]">Ada di Excel, tidak ada di POS — tidak dibuat otomatis</p>
              <Table head={["POS SKU", "Nama", "Varian", "Harga Excel"]} rows={plan.posReconciliation.excelNotInGarage.map((p) => [p.posSku, p.name, p.variant, p.price === null ? "-" : rupiah(p.price)])} />
              <p className="mb-1 mt-3 text-[12px] font-semibold text-[#111111]">Ada di POS, tidak ada di Excel — tetap dipertahankan</p>
              <Table head={["ID", "Nama", "Kategori"]} rows={plan.posReconciliation.garageNotInExcel.map((m) => [m.menuItemId, m.name, m.category])} />
              {plan.posReconciliation.priceDifferences.length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-[12px] font-semibold text-[#111111]">Beda harga (harga POS dipertahankan)</p>
                  <Table head={["POS SKU", "Nama", "Excel", "POS"]} rows={plan.posReconciliation.priceDifferences.map((p) => [p.posSku, p.name, rupiah(p.excel), rupiah(p.garage)])} />
                </>
              )}
            </Details>
            {(plan.warnings.length > 0 || plan.materials.nameConflicts.length > 0) && (
              <Details title="Peringatan & konflik">
                <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-[#111111]">
                  {plan.materials.nameConflicts.map((c) => (
                    <li key={c.key}>{c.key} {c.excelName}: nama sama dengan {c.existingSku} ({c.existingName}) — tidak diimpor, cocokkan manual.</li>
                  ))}
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Details>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[#E8E8E8] bg-white p-4" data-testid="draft-recipes">
        <h2 className="text-[15px] font-bold text-[#111111]">Resep draft menunggu persetujuan ({drafts.length})</h2>
        <p className="mt-0.5 text-[12.5px] text-[#4B5563]">
          Draft belum memotong stok dan belum masuk HPP menu. Setujui setelah uji resep (min. 3 batch) oleh Head Bar/Kitchen.
        </p>
        {drafts.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-[#4B5563]">Tidak ada resep draft.</p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {drafts.map((d) => (
              <div key={d.menuItemId} className="rounded-lg border border-[#E8E8E8] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[#111111]">{d.menuName}</p>
                    <p className="text-[12px] text-[#4B5563]">
                      Harga jual {rupiah(d.price)} · HPP referensi <b className="text-[#111111]">{rupiah(d.referenceHpp)}</b>
                      {d.price > 0 ? ` · food cost ${Math.round((d.referenceHpp / d.price) * 100)}%` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" disabled={busy} onClick={() => void decide(d, "approve")} className={`${btn} bg-[#111111] text-white`}>
                      <CheckCircle2 className="size-4" /> Setujui
                    </button>
                    <button type="button" disabled={busy} onClick={() => void decide(d, "reject")} className={`${btn} border border-[#E8E8E8] text-[#C8102E]`}>
                      <XCircle className="size-4" /> Tolak
                    </button>
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-[#F1F1F1] text-[12.5px]">
                  {d.lines.map((l) => (
                    <li key={l.sku} className="flex justify-between gap-2 py-1">
                      <span className="min-w-0 text-[#111111]">
                        {l.name} <span className="text-[#6B7280]">({l.sku})</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-[#111111]">
                        {l.qty} {l.unit} · {rupiah(l.cost)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Details({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-[#E8E8E8]" open={open}>
      <summary className="cursor-pointer px-3 py-2 text-[13px] font-semibold text-[#111111]">{title}</summary>
      <div className="border-t border-[#E8E8E8] p-3">{children}</div>
    </details>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="text-[12.5px] text-[#4B5563]">Tidak ada.</p>;
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full min-w-[560px] text-left text-[12.5px]">
        <thead className="sticky top-0 bg-[#F8F9FB]">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-1.5 font-semibold text-[#374151]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[#F1F1F1]">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5 align-top text-[#111111]">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
