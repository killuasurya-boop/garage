"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Printer, RotateCcw, ScanLine, Search } from "lucide-react";

import { PackQtyInput, PackQtyText } from "@/components/wms/pack-qty";
import { ScanModal } from "@/components/wms/scan-modal";
import { ConfirmDialog, errorText, ui } from "@/components/wms/master/master-shared";
import { garageApi } from "@/lib/api-client";
import { countPack, formatPacks } from "@/lib/stock-uom";
import { escapeHtml, printWmsDoc } from "@/lib/wms-print";
import { OPNAME_CLASS_META } from "@/lib/wms-opname-rules";
import {
  ClassBadge,
  DISCLAIMER,
  KIND_LABEL,
  Notice,
  ProgressBar,
  SCOPE_LABEL,
  StatusBadge,
  motion,
  num,
  rupiah,
  type OpnameDetail,
  type OpnameLine,
} from "./opname-shared";

type Filter = "all" | "todo" | "recount" | "variance";

const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Satu sesi opname. Penghitung (blind): hanya isi fisik, tanpa stok sistem/selisih.
 * Reviewer (Owner/Manajer): lihat selisih, klasifikasi, hitungan pertama, minta hitung ulang, setujui.
 */
export function OpnameSession({ id, elevated, onBack, initialFilter = "all" }: { id: string; elevated: boolean; onBack: () => void; initialFilter?: Filter }) {
  const [op, setOp] = useState<OpnameDetail | null>(null);
  const [entries, setEntries] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | "submit" | "finalize">(null);
  // Id permintaan per baris dipakai ulang sampai berhasil → kiriman ulang (jaringan putus) idempoten.
  const pendingIds = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    setOp(await garageApi.get<OpnameDetail>(`/api/wms/opname/${id}`));
  }, [id]);

  useEffect(() => {
    let alive = true;
    garageApi
      .get<OpnameDetail>(`/api/wms/opname/${id}`)
      .then((d) => { if (alive) setOp(d); })
      .catch((e) => { if (alive) setMsg({ tone: "error", text: errorText(e, "Gagal memuat sesi opname.") }); });
    return () => { alive = false; };
  }, [id]);

  const lines = useMemo(() => {
    if (!op) return [];
    const q = query.trim().toLowerCase();
    return op.lines.filter((l) => {
      if (q && !`${l.productName} ${l.sku ?? ""} ${l.barcode ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "todo") return !l.counted;
      if (filter === "recount") return l.needsRecount;
      if (filter === "variance") return l.counted && (l.variance ?? 0) !== 0;
      return true;
    });
  }, [op, filter, query]);

  if (!op) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className={ui.secondary}><ArrowLeft className="size-4" /> Kembali</button>
        {msg ? <Notice tone="error">{msg.text}</Notice> : <p className="text-[13px] text-[#6B7280]">Memuat sesi…</p>}
      </div>
    );
  }

  const editable = op.status === "draft";
  const reviewable = elevated && op.status === "submitted";
  const allCounted = op.progress.counted === op.progress.total;
  const mustCountAll = op.scope !== "partial";
  const canSubmit = editable && op.progress.counted > 0 && op.progress.recount === 0 && (!mustCountAll || allCounted);
  const varianceValue = op.lines.reduce((s, l) => s + (l.varianceValue ?? 0), 0);
  const shortage = op.lines.reduce((s, l) => s + Math.min(0, l.varianceValue ?? 0), 0);
  const surplus = op.lines.reduce((s, l) => s + Math.max(0, l.varianceValue ?? 0), 0);

  async function saveLine(line: OpnameLine) {
    const physicalQty = entries[line.id];
    if (!op || physicalQty === undefined || !Number.isFinite(physicalQty) || physicalQty < 0) return;
    const pack = countPack(line.uoms);
    const breakdown = pack
      ? { uom: pack.uom, factor: pack.factor, packs: Math.floor(physicalQty / pack.factor + 1e-9), loose: Math.round((physicalQty - Math.floor(physicalQty / pack.factor + 1e-9) * pack.factor) * 10_000) / 10_000 }
      : undefined;
    const clientRequestId = (pendingIds.current[line.id] ??= newRequestId());
    setSaving((s) => ({ ...s, [line.id]: "saving" }));
    try {
      await garageApi.patch(`/api/wms/opname/${op.id}`, { lineId: line.id, physicalQty, clientRequestId, breakdown });
      delete pendingIds.current[line.id];
      setEntries((cur) => {
        const next = { ...cur };
        delete next[line.id];
        return next;
      });
      setSaving((s) => ({ ...s, [line.id]: "saved" }));
      await load();
    } catch (e) {
      setSaving((s) => ({ ...s, [line.id]: "error" }));
      setMsg({ tone: "error", text: errorText(e, "Gagal menyimpan hitungan — coba lagi, angka masih tersimpan di layar.") });
    }
  }

  async function act(path: "submit" | "finalize" | "reject" | "recount", body: Record<string, unknown> = {}) {
    if (!op || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await garageApi.post(`/api/wms/opname/${op.id}/${path}`, body);
      const done: Record<typeof path, string> = {
        submit: "Terkirim ke Owner/Manajer untuk review.",
        finalize: "Opname disetujui & stok diposting.",
        reject: "Dikembalikan ke penghitung.",
        recount: "Permintaan hitung ulang dikirim.",
      };
      setMsg({ tone: "ok", text: done[path] });
      setSelected(new Set());
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e, "Aksi opname gagal.") });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  function requestRecount() {
    const lineIds = [...selected];
    if (!lineIds.length) return setMsg({ tone: "error", text: "Centang bahan yang perlu dihitung ulang." });
    const reason = window.prompt("Alasan hitung ulang (wajib)?")?.trim() ?? "";
    if (reason.length < 3) return;
    void act("recount", { lineIds, reason });
  }

  function reject() {
    const reason = window.prompt("Alasan dikembalikan ke penghitung?")?.trim() ?? "";
    if (reason.length < 3) return;
    void act("reject", { reason });
  }

  function focusByCode(code: string) {
    setScanning(false);
    if (!op) return;
    const q = code.trim().toLowerCase();
    const line = op.lines.find((l) => (l.sku ?? "").toLowerCase() === q || (l.barcode ?? "").toLowerCase() === q);
    if (!line) return setMsg({ tone: "error", text: `Kode "${code}" tidak ada di sesi ini.` });
    setFilter("all");
    setQuery("");
    requestAnimationFrame(() => {
      const el = (document.getElementById(`opl-${line.id}-count`) ?? document.getElementById(`opl-${line.id}-rest`)) as HTMLInputElement | null;
      el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el?.focus();
      el?.select();
    });
  }

  function printSheet() {
    if (!op) return;
    const unitHint = (l: OpnameLine) => {
      const pack = countPack(l.uoms);
      return pack ? `${l.unit} (1 ${pack.uom} = ${pack.factor} ${l.unit})` : l.unit;
    };
    const rows = op.lines
      .map((l) =>
        op.blind
          ? `<tr><td>${escapeHtml(l.productName)}</td><td class="c">${escapeHtml(unitHint(l))}</td><td style="width:110px"></td></tr>`
          : `<tr><td>${escapeHtml(l.productName)}</td><td class="c">${escapeHtml(unitHint(l))}</td><td class="r">${l.systemQty === null ? "" : escapeHtml(formatPacks(l.systemQty, l.unit, l.uoms))}</td><td class="r">${l.counted && l.physicalQty !== null ? escapeHtml(formatPacks(l.physicalQty, l.unit, l.uoms)) : ""}</td><td class="r">${l.counted ? escapeHtml(num(l.variance)) : ""}</td><td class="r">${l.counted && l.varianceValue ? rupiah(l.varianceValue) : ""}</td></tr>`,
      )
      .join("");
    const head = op.blind
      ? `<th>Bahan</th><th class="c">Satuan</th><th class="c">Hitung Fisik</th>`
      : `<th>Bahan</th><th class="c">Satuan</th><th class="r">Stok Sistem</th><th class="r">Fisik</th><th class="r">Selisih</th><th class="r">Nilai</th>`;
    printWmsDoc(
      `Lembar Opname · ${op.doc}`,
      `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>${op.blind ? "" : `<p><b>Total nilai selisih: ${rupiah(varianceValue)}</b></p>`}<div class="sign"><div><div class="line">Penghitung</div></div><div><div class="line">Disetujui</div></div></div>`,
      `${op.doc} · ${op.blind ? "hitung buta" : "hasil hitung"}`,
    );
  }

  const filters: Array<{ id: Filter; label: string; n: number }> = [
    { id: "all", label: "Semua", n: op.lines.length },
    { id: "todo", label: "Belum dihitung", n: op.lines.filter((l) => !l.counted).length },
    { id: "recount", label: "Hitung ulang", n: op.progress.recount },
    ...(op.blind ? [] : [{ id: "variance" as Filter, label: "Ada selisih", n: op.lines.filter((l) => l.counted && (l.variance ?? 0) !== 0).length }]),
  ];

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#C8102E]"><ArrowLeft className="size-3.5" /> Kembali</button>
          <h2 className="font-mono text-[19px] font-extrabold text-[#111111]">{op.doc}</h2>
          <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[#4B5563]">
            <StatusBadge status={op.status} rejected={op.status === "draft" && !!op.rejectReason} />
            <span>{KIND_LABEL[op.kind]} · {SCOPE_LABEL[op.scope]}{op.businessDate ? ` · ${op.businessDate}` : ""}</span>
            {op.blind && <span className="font-semibold text-[#1E40AF]">· hitung buta</span>}
            {!op.blind && op.approvalTier && <><span>· persetujuan:</span> <ClassBadge value={op.approvalTier} /></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <button type="button" onClick={() => setScanning(true)} className={ui.secondary}><ScanLine className="size-4 text-[#C8102E]" /> Scan</button>}
          <button type="button" onClick={printSheet} className={ui.secondary}><Printer className="size-4" /> Cetak</button>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-[#E8E8E8] bg-white p-3">
        <div className="flex flex-wrap justify-between gap-2 text-[12.5px]">
          <span className="font-semibold text-[#111111]">{op.progress.counted}/{op.progress.total} dihitung</span>
          {op.progress.recount > 0 && <span className="font-semibold text-[#92400E]">{op.progress.recount} perlu hitung ulang</span>}
          {!op.blind && <span className="text-[#4B5563]">Kurang <b className="text-[#B91C1C]">{rupiah(shortage)}</b> · Lebih <b className="text-[#15803D]">{rupiah(surplus)}</b></span>}
        </div>
        <ProgressBar value={op.progress.counted} total={op.progress.total} />
        {mustCountAll && editable && !allCounted && <p className="text-[11.5px] text-[#6B7280]">Opname {SCOPE_LABEL[op.scope].toLowerCase()}: semua bahan wajib dihitung sebelum dikirim.</p>}
      </div>

      {op.rejectReason && op.status === "draft" && <Notice tone="warn">Catatan reviewer: {op.rejectReason}</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!op.blind && <p className="text-[11.5px] text-[#6B7280]">{DISCLAIMER}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari bahan / SKU / barcode" aria-label="Cari bahan" className={`${ui.input} pl-8`} />
        </div>
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Saring baris">
          {filters.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`h-9 flex-none rounded-full border px-3 text-[12px] font-semibold ${motion} ${filter === f.id ? "border-[#C8102E] bg-[#C8102E] text-white" : "border-[#D9DCE1] bg-white text-[#374151] hover:bg-[#F8F9FB]"}`}>
              {f.label} <span className="font-mono">{f.n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile-first: kartu per bahan, input besar; tabel tidak dipakai agar nyaman di HP. */}
      <ul className="space-y-2">
        {lines.length === 0 && <li className="rounded-xl border border-dashed border-[#D9DCE1] p-6 text-center text-[13px] text-[#6B7280]">Tidak ada bahan di filter ini.</li>}
        {lines.map((l) => {
          const state = saving[l.id];
          const meta = l.classification ? OPNAME_CLASS_META[l.classification] : null;
          const lineEditable = editable && (l.needsRecount || !l.counted || l.countedByMe || elevated);
          return (
            <li key={l.id} className={`rounded-xl border bg-white p-3 ${motion} ${l.needsRecount ? "border-[#FDE68A] bg-[#FFFBEB]" : "border-[#E8E8E8]"}`}>
              <div className="flex items-start gap-3">
                {reviewable && l.counted && (
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${l.productName} untuk hitung ulang`}
                    checked={selected.has(l.id)}
                    onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })}
                    className="mt-1 size-5 accent-[#C8102E]"
                  />
                )}
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" className="size-11 flex-none rounded-lg border border-[#E8E8E8] object-cover" />
                ) : (
                  <div className="grid size-11 flex-none place-items-center rounded-lg bg-[#F3F4F6] text-[11px] font-bold text-[#6B7280]">{l.unit}</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-[#111111]">{l.productName}</p>
                  <p className="text-[11.5px] text-[#6B7280]">
                    {l.sku ?? "–"} · {l.category ?? "–"} · satuan {l.unit}
                    {l.attempts > 1 && ` · dihitung ${l.attempts}×`}
                  </p>
                  {l.needsRecount && <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-[#92400E]"><RotateCcw className="size-3.5" /> Hitung ulang{l.recountReason ? `: ${l.recountReason}` : ""}</p>}
                  {!l.counted && !l.needsRecount && <p className="mt-0.5 text-[11.5px] font-semibold text-[#B45309]">Belum dihitung</p>}
                </div>
                {meta && <ClassBadge value={l.classification} />}
              </div>

              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-[#4B5563]">Fisik</p>
                  <div className="flex items-center gap-2">
                    <PackQtyInput
                      idPrefix={`opl-${l.id}`}
                      label={`Hitung fisik ${l.productName}`}
                      value={entries[l.id] ?? (l.needsRecount ? null : l.physicalQty)}
                      unit={l.unit}
                      uoms={l.uoms}
                      disabled={!lineEditable}
                      onChange={(base) => setEntries((cur) => ({ ...cur, [l.id]: base }))}
                      onBlur={() => void saveLine(l)}
                    />
                    <span aria-live="polite" className="w-16 text-[11px]">
                      {state === "saving" && <span className="text-[#6B7280]">menyimpan…</span>}
                      {state === "saved" && <span className="inline-flex items-center gap-0.5 font-semibold text-[#15803D]"><CheckCircle2 className="size-3.5" /> tersimpan</span>}
                      {state === "error" && <button type="button" onClick={() => void saveLine(l)} className="font-semibold text-[#B91C1C] underline">ulangi</button>}
                    </span>
                  </div>
                </div>
                {!op.blind && l.counted && (
                  <dl className="grid grid-cols-3 gap-x-4 text-right text-[12px]">
                    <dt className="text-[#6B7280]">Sistem</dt>
                    <dt className="text-[#6B7280]">Selisih</dt>
                    <dt className="text-[#6B7280]">Nilai</dt>
                    <dd className="font-mono text-[#374151]"><PackQtyText qty={l.systemQty ?? 0} unit={l.unit} uoms={l.uoms} /></dd>
                    <dd className={`font-mono font-bold ${(l.variance ?? 0) === 0 ? "text-[#374151]" : (l.variance ?? 0) > 0 ? "text-[#15803D]" : "text-[#B91C1C]"}`}>{(l.variance ?? 0) > 0 ? "+" : ""}{num(l.variance)}</dd>
                    <dd className="font-mono text-[#111111]">{rupiah(l.varianceValue)}</dd>
                    {l.firstPhysicalQty !== null && l.attempts > 1 && <dd className="col-span-3 text-[11px] text-[#6B7280]">Hitungan pertama: {num(l.firstPhysicalQty)} {l.unit}</dd>}
                  </dl>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Bilah aksi lengket di bawah (jangkauan jempol di HP). */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap justify-end gap-2 border-t border-[#E8E8E8] bg-white/95 px-1 py-2 backdrop-blur">
        {editable && (
          <button type="button" disabled={busy || !canSubmit} onClick={() => setConfirm("submit")} className={ui.primary}>
            Kirim untuk review
          </button>
        )}
        {reviewable && (
          <>
            <button type="button" disabled={busy || selected.size === 0} onClick={requestRecount} className={ui.secondary}><RotateCcw className="size-4" /> Minta hitung ulang ({selected.size})</button>
            <button type="button" disabled={busy} onClick={reject} className={ui.secondary}>Kembalikan</button>
            <button type="button" disabled={busy} onClick={() => setConfirm("finalize")} className={ui.primary}>Setujui &amp; posting</button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "submit"}
        title="Kirim hasil hitung?"
        body={<p>Setelah dikirim, hitungan tidak bisa diubah kecuali reviewer meminta hitung ulang. {op.progress.total - op.progress.counted > 0 ? `${op.progress.total - op.progress.counted} bahan belum dihitung dan tidak akan disesuaikan.` : ""}</p>}
        confirmLabel="Kirim"
        busy={busy}
        onConfirm={() => void act("submit")}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "finalize"}
        title="Setujui & posting stok?"
        body={
          <>
            <p>Stok sistem akan disesuaikan ke hasil fisik untuk {op.progress.counted} bahan. Kurang {rupiah(shortage)}, lebih {rupiah(surplus)}.</p>
            <p>Tidak ada beban/jurnal keuangan baru yang dibuat. Tindakan ini tercatat di audit log.</p>
            {op.approvalTier === "owner" && <p className="font-semibold text-[#991B1B]">Ada selisih kritis/berulang — hanya Owner yang dapat menyetujui.</p>}
          </>
        }
        confirmLabel="Setujui & posting"
        danger
        busy={busy}
        onConfirm={() => void act("finalize")}
        onCancel={() => setConfirm(null)}
      />
      {scanning && <ScanModal title="Scan bahan (SKU/barcode)" onDetect={focusByCode} onCancel={() => setScanning(false)} />}
    </div>
  );
}
