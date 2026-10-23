/* eslint-disable react-hooks/set-state-in-effect -- Hydrate editable forms from server data and browser query state once, preserving subsequent edits. */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ClipboardCheck, Plus, Save, Search, Send, Trash2 } from "lucide-react";
import type { ClosingDivision, SaveClosingInput } from "@/lib/wms-replenishment-types";
import { garageApi } from "@/lib/api-client";
import { apiRoot, Badge, Frame, Header, key, knownRejection, Loading, localDate, message, Nav, Notice, qty, styles, useFeed } from "./replenishment-shared";
import type { AccessInfo, Catalog, CatalogProduct, RequestDetail } from "./replenishment-model";
import { management } from "./replenishment-model";

type Line = { productId: string; physical: string; target: string; requested: string; reason: string; note: string };
const number = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."));
const nonnegative = (value: string) => { const n = number(value); return n !== null && Number.isFinite(n) && n >= 0; };

export function ClosingEditor({ access }: { access: AccessInfo }) {
  const [division, setDivision] = useState<ClosingDivision>(access.workstation?.includes("dapur") ? "dapur" : "bar");
  const [businessDate, setBusinessDate] = useState(localDate), [neededDate, setNeededDate] = useState("");
  const [warehouseId, setWarehouseId] = useState(""), [priority, setPriority] = useState<"normal" | "urgent">("normal"), [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]), [search, setSearch] = useState(""), [category, setCategory] = useState(""), [addId, setAddId] = useState("");
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState<string | null>(null), [savedAt, setSavedAt] = useState<string | null>(null);
  const [review, setReview] = useState<"request" | "none" | null>(null), [done, setDone] = useState<RequestDetail | null>(null), [initialLoad, setInitialLoad] = useState(false);
  const [documentId, setDocumentId] = useState<string | undefined>();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [validationMode, setValidationMode] = useState<"request" | "none" | null>(null);
  const docRef = useRef<{ id?: string; version?: number }>({}), revision = useRef(0), [pending, setPending] = useState<SaveClosingInput | null>(null), inFlight = useRef<Promise<RequestDetail | null> | null>(null);
  const feed = useFeed<Catalog>(`${apiRoot}/catalog?division=${division}${neededDate ? `&neededDate=${neededDate}` : ""}`, 30000);
  const catalog = feed.data;
  const products = useMemo(() => catalog?.stocks.find(s => s.warehouseId === warehouseId)?.products ?? catalog?.products ?? [], [catalog, warehouseId]);
  const byId = useMemo(() => new Map(products.map(p => [p.productId ?? p.id, p])), [products]);
  const snapshot = useRef({ division, businessDate, neededDate, warehouseId, priority, note, lines });
  useEffect(() => { snapshot.current = { division, businessDate, neededDate, warehouseId, priority, note, lines }; }, [division, businessDate, neededDate, warehouseId, priority, note, lines]);
  const defaults = useCallback((p: CatalogProduct): Line => ({ productId: p.productId ?? p.id, physical: "", target: String(p.targetQty ?? p.minStock ?? 0), requested: String(Math.max(0, (p.targetQty ?? p.minStock ?? 0) - p.systemQty - p.incomingQty)), reason: "", note: "" }), []);
  useEffect(() => {
    if (initialLoad) return;
    const queryId = new URLSearchParams(window.location.search).get("id");
    if (queryId) {
      setInitialLoad(true);
      void garageApi.get<RequestDetail>(`${apiRoot}/requests/${queryId}`).then(d => {
        docRef.current = { id: d.id, version: d.version }; setDocumentId(d.id); setDivision(d.division); setBusinessDate(d.businessDate); setNeededDate(d.neededDate); setWarehouseId(d.warehouseId); setPriority(d.priority === "urgent" ? "urgent" : "normal"); setNote(d.note);
        setLines(d.items.map(i => ({ productId: i.productId, physical: i.physicalQty === null ? "" : String(i.physicalQty), target: String(i.targetQty), requested: String(i.requestedQty), reason: i.overrideReason, note: i.note })));
        if (d.status !== "draft") setDone(d); setSavedAt(d.updatedAt);
      }).catch(e => setSaveError(message(e)));
      return;
    }
    if (!catalog || catalog.division !== division) return;
    const location = catalog.locations[0];
    if (location) {
      setWarehouseId(location.id); setBusinessDate(catalog.businessDate); setNeededDate(catalog.neededDate);
      const items = catalog.stocks.find(s => s.warehouseId === location.id)?.products ?? catalog.products;
      setLines(items.map(defaults)); setInitialLoad(true);
    }
  }, [catalog, initialLoad, defaults, division]);
  function changed() { revision.current++; setDirty(true); setReview(null); }
  function updateLine(id: string, patch: Partial<Line>) { changed(); setLines(old => old.map(l => l.productId === id ? { ...l, ...patch } : l)); }
  function suggestion(l: Line) { const p = byId.get(l.productId); return Math.max(0, (number(l.target) ?? 0) - (number(l.physical) ?? p?.systemQty ?? 0) - (p?.incomingQty ?? 0)); }
  function buildPayload(submit = false, noRequest = false): SaveClosingInput {
    const s = snapshot.current;
    return { ...docRef.current, idempotencyKey: key(), division: s.division, businessDate: s.businessDate, neededDate: s.neededDate, warehouseId: s.warehouseId, priority: s.priority, note: s.note, submit, noRequest, items: s.lines.map(l => ({ productId: l.productId, physicalQty: number(l.physical), targetQty: number(l.target) ?? 0, requestedQty: noRequest ? 0 : number(l.requested) ?? 0, overrideReason: noRequest ? "Closing tanpa kebutuhan tambahan" : l.reason, note: l.note })) };
  }
  const persist = useCallback(async (payload: SaveClosingInput): Promise<RequestDetail | null> => {
    setSaving(true); setSaveError(null);
    const rev = revision.current;
    setPending(payload);
    try {
      const result = payload.id ? await garageApi.patch<RequestDetail>(`${apiRoot}/requests/${payload.id}`, payload) : await garageApi.post<RequestDetail>(`${apiRoot}/requests`, payload);
      docRef.current = { id: result.id, version: result.version }; setDocumentId(result.id); setPending(null); setSavedAt(new Date().toISOString());
      if (revision.current === rev) setDirty(false);
      if (payload.submit) { setDone(result); setReview(null); }
      return result;
    } catch (e) { if (knownRejection(e)) setPending(null); setSaveError(message(e)); return null; }
    finally { setSaving(false); }
  }, []);
  const saveDraft = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const s = snapshot.current;
    if (!s.warehouseId || !s.businessDate || !s.neededDate || s.lines.some(l => !nonnegative(l.target) || !nonnegative(l.requested) || (l.physical !== "" && !nonnegative(l.physical)))) return null;
    const payload = pending ?? buildPayload();
    const task = persist(payload); inFlight.current = task;
    try { return await task; } finally { inFlight.current = null; }
  }, [persist, pending]);
  useEffect(() => { if (!dirty || saveError || review || done) return; const timer = setTimeout(() => { void saveDraft(); }, 1400); return () => clearTimeout(timer); }, [dirty, lines, note, priority, businessDate, neededDate, warehouseId, saveDraft, saveError, review, done]);
  useEffect(() => { const prevent = (event: BeforeUnloadEvent) => { if (dirty || saving || saveError) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent); }, [dirty, saving, saveError]);
  async function submit() {
    if (inFlight.current) await inFlight.current;
    if (pending) { const retried = await saveDraft(); if (!retried) return; }
    const noRequest = review === "none";
    const payload = buildPayload(true, noRequest);
    inFlight.current = persist(payload);
    try { await inFlight.current; } finally { inFlight.current = null; }
  }
  function issueField(l: Line, kind: "request" | "none") {
    if (!nonnegative(l.physical)) return "physical";
    if (!nonnegative(l.target)) return "target";
    if (!nonnegative(l.requested)) return "requested";
    if (kind === "request" && Math.abs((number(l.requested) ?? 0) - suggestion(l)) > .0001 && !l.reason.trim()) return "reason";
    return null;
  }
  function revealProblems(problemLines: Line[], kind: "request" | "none") {
    setSearch(""); setCategory("");
    setExpandedCategories(old => ({ ...old, ...Object.fromEntries(problemLines.map(l => [byId.get(l.productId)?.category ?? "", true])) }));
    const first = problemLines[0];
    if (first) requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`closing-${issueField(first, kind)}-${first.productId}`)?.focus()));
  }
  function beginReview(kind: "request" | "none") {
    setValidationMode(kind);
    const invalid = lines.filter(l => !nonnegative(l.physical) || !nonnegative(l.target) || !nonnegative(l.requested));
    if (invalid.length) { revealProblems(invalid, kind); setSaveError("Isi hasil hitung fisik dengan angka 0 atau lebih untuk setiap bahan. Kolom kosong berarti belum dihitung. Kelompok yang perlu diperiksa sudah dibuka."); return; }
    if (kind === "request" && !lines.some(l => Number(l.requested) > 0)) { setSaveError("Belum ada jumlah yang diminta. Pilih Tidak Ada Permintaan bila kebutuhan besok sudah cukup."); return; }
    const overrides = kind === "request" ? lines.filter(l => Math.abs((number(l.requested) ?? 0) - suggestion(l)) > .0001 && !l.reason.trim()) : [];
    if (overrides.length) { revealProblems(overrides, kind); setSaveError("Isi alasan pada bahan yang jumlah permintaannya berbeda dari rekomendasi. Kelompok terkait sudah dibuka."); return; }
    setSaveError(null); setValidationMode(null); setReview(kind);
  }
  const needle = search.trim().toLowerCase();
  const visible = lines.filter(l => { const p = byId.get(l.productId); return p && (!category || p.category === category) && (!needle || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(needle)); });
  const groupedLines = [...new Set(visible.map(l => byId.get(l.productId)?.category ?? ""))]
    .sort((a, b) => a.localeCompare(b, "id-ID", { numeric: true }))
    .map(name => ({
      category: name,
      lines: visible.filter(l => (byId.get(l.productId)?.category ?? "") === name).sort((a, b) => (byId.get(a.productId)?.sku ?? "").localeCompare(byId.get(b.productId)?.sku ?? "", "id-ID", { numeric: true })),
    }));
  const requestLines = lines.filter(l => (number(l.requested) ?? 0) > 0), count = lines.filter(l => nonnegative(l.physical)).length;
  const disabled = saving || !!pending && !!saveError;
  const allowedDivisions: ClosingDivision[] = management(access) || access.workstation === "all" || access.workstation === "helper_all" ? ["bar", "dapur"] : access.workstation?.includes("dapur") ? ["dapur"] : ["bar"];
  return <Frame><Header title="Closing Stock" detail="Periksa bahan yang tersisa, lalu ajukan kebutuhan untuk operasional berikutnya."><Link href="/warehouse/requests" className={styles.secondary}>Lihat Riwayat</Link></Header><Nav />
    <Notice>Hasil hitung closing adalah catatan pemeriksaan. Selisih tidak mengubah stok resmi; penyesuaian stok tetap melalui prosedur yang disetujui.</Notice>
    {feed.loading && <Loading />}{feed.error && <Notice error>{feed.error} <button className={styles.secondary} type="button" onClick={() => void feed.reload()}>Coba lagi</button></Notice>}
    {done ? <section className={styles.section}><div className={styles.empty}><ClipboardCheck size={36} /><strong>{done.noRequest ? "Closing tercatat tanpa permintaan" : "Permintaan sudah dikirim ke gudang"}</strong><span>{done.doc} · <Badge value={done.noRequest ? "no_request" : done.status} /></span><p>Untuk kebutuhan {done.neededDate}, divisi {done.division === "bar" ? "Bar" : "Dapur"}. Saldo stok belum berubah hanya karena pengajuan ini.</p><Link className={styles.primary} href={`/warehouse/requests?id=${done.id}`}>Buka permintaan & histori</Link></div></section> : catalog?.configurationRequired ? <section className={styles.section}><div className={styles.empty}><strong>Lokasi dan akses divisi belum ditetapkan</strong><p>Owner/Manajer perlu menghubungkan gudang dan akun staf terlebih dahulu.</p>{management(access) && <Link href="/warehouse/preparation?setup=1" className={styles.primary}>Atur lokasi & akses staf</Link>}</div></section> : catalog && <>
      <section className={styles.section}><details className={styles.contextDetails}><summary><strong>{division === "bar" ? "Bar" : "Dapur"} · {catalog.locations.find(l=>l.id===warehouseId)?.name}</strong><span>Operasional {businessDate} · dibutuhkan {neededDate}</span><span className={styles.muted}>Ubah tanggal, prioritas atau catatan</span></summary><div className={styles.sectionBody}><div className={styles.grid3}>
        <label>Divisi<select value={division} disabled={!!documentId || dirty || saving} onChange={e => { setDivision(e.target.value as ClosingDivision); setInitialLoad(false); }}>{allowedDivisions.map(d => <option key={d} value={d}>{d === "bar" ? "Bar" : "Kitchen / Dapur"}</option>)}</select></label>
        <label>Lokasi pemeriksaan<select value={warehouseId} disabled={!!documentId || dirty || saving} onChange={e => { setWarehouseId(e.target.value); setLines((catalog.stocks.find(s => s.warehouseId === e.target.value)?.products ?? []).map(defaults)); }}>{catalog.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label>Prioritas<select value={priority} disabled={disabled} onChange={e => { setPriority(e.target.value as "normal" | "urgent"); changed(); }}><option value="normal">Normal</option><option value="urgent">Mendesak</option></select></label>
        <label>Tanggal operasional<input aria-label="Tanggal operasional" type="date" value={businessDate} disabled={disabled || !!documentId} onChange={e => { setBusinessDate(e.target.value); changed(); }} /><small>Tanggal kegiatan yang sedang ditutup.</small></label>
        <label>Bahan dibutuhkan<input aria-label="Tanggal kebutuhan" type="date" value={neededDate} disabled={disabled} onChange={e => { setNeededDate(e.target.value); changed(); }} /><small>Tanggal eksplisit; tidak berubah saat lewat tengah malam.</small></label>
        <div className={styles.stat}><span>Jam operasional · WIB</span><strong>{catalog.settings.openTime}–{catalog.settings.closeTime}</strong><span>Batas permintaan {catalog.settings.cutoffTime}. Pengajuan setelah batas diberi penanda terlambat.</span></div>
      </div><label>Catatan divisi<textarea value={note} disabled={disabled} placeholder="Contoh: kebutuhan tambahan untuk operasional besok" maxLength={500} onChange={e => { setNote(e.target.value); changed(); }} /></label></div></details></section>
      {saveError && <Notice error>{saveError}{pending && <><p>Dokumen mungkin sudah diterima server. Ulangi pengiriman yang sama sebelum mengedit.</p><button type="button" className={styles.secondary} disabled={saving} onClick={() => void saveDraft()}>Coba simpan kembali</button></>}{!pending && <button type="button" className={styles.secondary} onClick={() => setSaveError(null)}>Perbaiki isian</button>}</Notice>}
      {review ? <section className={styles.section} data-testid="closing-review"><div className={styles.sectionHeader}><h2>{review === "none" ? "Konfirmasi tidak ada permintaan" : "Tinjau sebelum dikirim"}</h2><button type="button" className={styles.secondary} onClick={() => setReview(null)}>Kembali mengedit</button></div><div className={styles.sectionBody}><p>{lines.length} bahan diperiksa untuk operasional {businessDate}. Kebutuhan berikutnya: {neededDate}.</p>{review === "none" ? <Notice>Closing tetap tercatat. Tidak ada bahan tambahan yang diajukan.</Notice> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Bahan</th><th>Permintaan</th><th>Alasan perubahan</th></tr></thead><tbody>{requestLines.map(l => <tr key={l.productId}><td>{byId.get(l.productId)?.name}</td><td>{qty(l.requested)} {byId.get(l.productId)?.unit}</td><td>{l.reason || "Sesuai rekomendasi"}</td></tr>)}</tbody></table></div>}<button className={styles.primary} type="button" data-testid="closing-submit" disabled={saving} onClick={() => void submit()}><Send size={18} />{saving ? "Mengirim…" : review === "none" ? "Catat closing tanpa permintaan" : "Kirim ke Gudang"}</button></div></section> : <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Periksa bahan per kategori</h2><p className={styles.muted}>{count} dari {lines.length} bahan sudah dihitung. Buka kelompok bahan sesuai urutan pemeriksaan.</p></div></div>
        <div className={styles.sectionBody}><div className={styles.toolbar}><label>Cari bahan<div className="flex items-center gap-2"><Search size={18} /><input className="w-full" placeholder="Nama atau kode bahan" value={search} onChange={e => { setSearch(e.target.value); setCategory(""); }} /></div></label><label>Kategori<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Semua kategori</option>{[...new Set(products.map(p => p.category))].sort().map(c => <option key={c}>{c}</option>)}</select></label></div><details className={styles.contextDetails}><summary>Tambahkan bahan lain</summary><div className={styles.toolbar}><label>Tambah dari master bahan<select value={addId} onChange={e => setAddId(e.target.value)}><option value="">Pilih bahan yang belum ada</option>{products.filter(p => !lines.some(l => l.productId === (p.productId ?? p.id))).map(p => <option key={p.id} value={p.productId ?? p.id}>{p.name} · {p.unit}</option>)}</select></label><button className={styles.secondary} type="button" disabled={!addId || disabled} onClick={() => { const p = byId.get(addId); if (p) { setLines(l => [...l, defaults(p)]); changed(); setAddId(""); } }}><Plus size={18} />Tambah Bahan</button></div></details></div>
        {visible.length === 0 ? <div className={styles.empty}><strong>Tidak ada bahan sesuai pencarian</strong><p>Ubah pencarian atau tambahkan bahan dari master yang sudah terdaftar.</p></div> : groupedLines.map((group, groupIndex) => {
          const checked = group.lines.filter(l => nonnegative(l.physical)).length;
          const issues = validationMode ? group.lines.filter(l => issueField(l, validationMode)).length : 0;
          return <details key={group.category} className={styles.materialGroup} data-testid="closing-category" open={!!needle || !!category || (expandedCategories[group.category] ?? groupIndex === 0)} onToggle={e => { if (!needle && !category) { const open = e.currentTarget.open; setExpandedCategories(old => old[group.category] === open ? old : { ...old, [group.category]: open }); } }}>
            <summary><div><strong>{group.category || "Tanpa kategori"}</strong><span>{group.lines.length} bahan · {checked}/{group.lines.length} sudah dihitung{issues ? ` · ${issues} perlu diperiksa` : ""}</span></div><ChevronDown size={20} aria-hidden="true" /></summary>
            {group.lines.map(l => { const p = byId.get(l.productId)!; const rec = suggestion(l), variance = number(l.physical) === null ? null : Number(number(l.physical)) - p.systemQty; const override = Math.abs((number(l.requested) ?? 0) - rec) > .0001; return <article className={styles.material} key={l.productId} data-testid="closing-material"><div className={styles.materialHeading}><div><h3>{p.name}</h3><p>{p.sku} · {p.category} · satuan {p.unit}</p></div><button type="button" className={styles.iconButton} aria-label={`Hapus ${p.name} dari closing`} disabled={disabled} onClick={() => { setLines(old => old.filter(i => i.productId !== l.productId)); changed(); }}><Trash2 size={18} /></button></div><div className={styles.lineInfo}><span>Stok sistem <strong>{qty(p.systemQty)} {p.unit}</strong></span><span>Incoming terkonfirmasi <strong>{qty(p.incomingQty)} {p.unit}</strong></span>{p.systemQty <= p.minStock && <Badge value="urgent" />}</div><div className={styles.quantities}>
          <label>Stok fisik ({p.unit})<input id={`closing-physical-${l.productId}`} aria-invalid={!!validationMode && !nonnegative(l.physical)} data-testid="closing-physical" aria-label={`Stok fisik ${p.name}`} inputMode="decimal" type="number" min="0" step="0.0001" placeholder="Belum dihitung" value={l.physical} disabled={disabled} onChange={e => { const v = e.target.value; const actual = number(v); const request = Math.max(0, (number(l.target) ?? 0) - (actual ?? p.systemQty) - p.incomingQty); updateLine(l.productId, { physical: v, ...(!l.reason ? { requested: String(request) } : {}) }); }} /></label>
          <label>Target stok ({p.unit})<input id={`closing-target-${l.productId}`} aria-invalid={!!validationMode && !nonnegative(l.target)} aria-label={`Target stok ${p.name}`} inputMode="decimal" type="number" min="0" step="0.0001" value={l.target} disabled={disabled} onChange={e => updateLine(l.productId, { target: e.target.value })} /></label>
          <div className={styles.stat}><span>Rekomendasi</span><strong>{qty(rec)} {p.unit}</strong><button type="button" disabled={disabled} className={styles.secondary} onClick={() => updateLine(l.productId, { requested: String(rec), reason: "" })}>Gunakan saran</button></div>
          <label>Diminta ({p.unit})<input id={`closing-requested-${l.productId}`} aria-invalid={!!validationMode && !nonnegative(l.requested)} data-testid="closing-requested" aria-label={`Jumlah diminta ${p.name}`} inputMode="decimal" type="number" min="0" step="0.0001" value={l.requested} disabled={disabled} onChange={e => updateLine(l.productId, { requested: e.target.value })} /></label>
        </div><div className={styles.lineInfo}><span>Selisih pemeriksaan <strong>{variance === null ? "Belum dihitung" : `${variance > 0 ? "+" : ""}${qty(variance)} ${p.unit}`}</strong></span><span>Rekomendasi = target − stok fisik (atau sistem bila belum dihitung) − incoming.</span></div>{override && <label>Alasan mengubah rekomendasi<input id={`closing-reason-${l.productId}`} aria-invalid={validationMode === "request" && !l.reason.trim()} aria-label={`Alasan perubahan ${p.name}`} required maxLength={300} placeholder="Mengapa jumlah kebutuhan berbeda?" value={l.reason} disabled={disabled} onChange={e => updateLine(l.productId, { reason: e.target.value })} /></label>}</article>; })}
          </details>;
        })}
      </section>}
      {!review && <div className={styles.stickyActions}><div aria-live="polite"><p>{saving ? "Menyimpan ke server…" : saveError ? "Belum tersimpan — periksa pesan di atas" : dirty ? "Perubahan belum tersimpan" : savedAt ? `Tersimpan ${new Date(savedAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB` : "Draft otomatis disimpan setelah ada perubahan"}</p><p>{requestLines.length} bahan diminta · tidak menjumlah satuan berbeda.</p></div><div className={styles.actions}><button type="button" data-testid="closing-save" className={styles.secondary} disabled={saving || !warehouseId} onClick={() => void saveDraft()}><Save size={18} />Simpan Draft</button><button type="button" className={styles.primary} disabled={saving || !!pending || lines.length === 0} onClick={() => beginReview("request")}><Send size={18} />Tinjau & Kirim</button><button type="button" className={styles.secondary} disabled={saving || !!pending} onClick={() => beginReview("none")}>Tidak Ada Permintaan</button></div></div>}
    </>}
  </Frame>;
}
