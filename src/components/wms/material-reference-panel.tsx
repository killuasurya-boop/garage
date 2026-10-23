"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileSpreadsheet, RefreshCw, Search } from "lucide-react";
import type { MaterialReferenceConfirmation, MaterialReferencePlan, MaterialReferenceResult, MaterialReferenceStored } from "@/lib/material-reference-plan";
import { garageApi } from "@/lib/api-client";
import { Loading, Notice, qty, styles } from "./replenishment-shared";
import panel from "./material-reference.module.css";

const api = "/api/wms/material-reference";
const statusLabel = { matched: "Terhubung ke bahan existing", ready_create: "Siap ditambahkan", needs_validation: "Perlu validasi satuan/kemasan", conflict: "Perlu rekonsiliasi" };
const money = (value: number | null) => value === null ? "Tidak diisi" : `Rp${value.toLocaleString("id-ID", { maximumFractionDigits: 4 })}`;
type ConfirmationInput = { enabled: boolean; unit: string; quantity: string };

export function MaterialReferencePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<MaterialReferenceResult | null>(null);
  const [stored, setStored] = useState<MaterialReferenceStored | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(""), [division, setDivision] = useState("Bar");
  const [acknowledged, setAcknowledged] = useState(false), [applyMetadata, setApplyMetadata] = useState(true);
  const [confirmations, setConfirmations] = useState<Record<string, ConfirmationInput>>({});
  const [needsPreview, setNeedsPreview] = useState(false), [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const current = await garageApi.get<MaterialReferenceStored>(api);
        if (!alive) return;
        setStored(current);
        if (current.plan && current.fileName && current.fileHash) {
          setResult({ fileName: current.fileName, fileHash: current.fileHash, plan: current.plan });
          // Re-upload or select the bundled source before applying another file.
          setNeedsPreview(true);
        } else {
          const form = new FormData(); form.set("source", "garage-2026-10-23"); form.set("mode", "preview");
          const response = await fetch(api, { method: "POST", body: form });
          const json = await response.json();
          if (!response.ok) throw new Error(json?.error?.message ?? "Acuan bahan belum dapat dimuat.");
          if (alive) setResult(json.data);
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Acuan bahan gagal dimuat."); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, []);

  async function send(mode: "preview" | "apply") {
    if (busy || mode === "apply" && (!acknowledged || needsPreview || !result)) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const selected: MaterialReferenceConfirmation[] = Object.entries(confirmations).filter(([, c]) => c.enabled).map(([sourceSku, c]) => {
        const packageQty = Number(c.quantity);
        if (!c.unit.trim() || !Number.isFinite(packageQty) || packageQty <= 0) throw new Error(`Isi satuan stok dan isi kemasan valid untuk ${sourceSku}, lalu pratinjau kembali.`);
        return { sourceSku, canonicalUnit: c.unit.trim(), packageQty, costBasis: "package" };
      });
      const form = new FormData();
      if (file) form.set("file", file); else form.set("source", "garage-2026-10-23");
      form.set("mode", mode); form.set("applyMetadata", String(applyMetadata));
      form.set("confirmations", JSON.stringify(selected));
      const response = await fetch(api, { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Acuan gagal diproses.");
      setResult(json.data); setNeedsPreview(false); setAcknowledged(false);
      if (mode === "apply") { const current = await garageApi.get<MaterialReferenceStored>(api); setStored(current); if (current.plan) setResult({ ...json.data, plan: current.plan }); setSaved(true); }
    } catch (e) { setError(e instanceof Error ? e.message : "Acuan gagal diproses."); }
    finally { setBusy(false); }
  }
  function changeConfirmation(sku: string, patch: Partial<ConfirmationInput>) {
    setConfirmations(v => ({ ...v, [sku]: { enabled: false, unit: "", quantity: "", ...v[sku], ...patch } }));
    setNeedsPreview(true); setAcknowledged(false); setSaved(false);
  }
  const plan: MaterialReferencePlan | undefined = result?.plan;
  const visible = plan?.rows.filter(r => (!division || r.sourceCategory === division) && `${r.sourceSku} ${r.canonicalSku} ${r.sourceName} ${r.target?.name ?? ""}`.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID"))) ?? [];
  return <div className={`${styles.root} ${panel.panel}`} data-testid="material-reference-panel">
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Acuan bahan gudang</h2><p className={styles.muted}>Kategori dan urutan bahan mengikuti DATA GUDANG Anda. Resep memakai identitas bahan yang sama.</p></div><FileSpreadsheet aria-hidden="true" size={24} /></div>
      <div className={styles.sectionBody}>
        <Notice>Kolom Stok kosong berarti belum diisi. Impor acuan tidak menambah atau mengurangi persediaan. HPP CSV disimpan sebagai referensi harga; biaya bahan existing tetap dipertahankan.</Notice>
        <div className={styles.toolbar}>
          <label>File acuan CSV<input aria-label="File acuan bahan CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setNeedsPreview(true); setAcknowledged(false); setConfirmations({}); setSaved(false); }} /><small>{file ? file.name : "DATA GUDANG.csv yang Anda unggah sudah tersedia sebagai acuan bawaan."}</small></label>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => void send("preview")}><RefreshCw size={18} />{busy ? "Memproses…" : "Pratinjau acuan"}</button>
        </div>
        {busy && !plan && <Loading />}
        {error && <Notice error>{error}</Notice>}
        {saved && <Notice>Acuan tersimpan. {result?.materialsCreated ?? 0} bahan ditambahkan dan {result?.metadataUpdated ?? 0} metadata diperbarui. Bahan yang belum valid tetap menunggu pemeriksaan.</Notice>}
        {plan && <>
          <p className={panel.source}><strong>{result?.fileName}</strong> · {plan.summary.bar} bahan Bar · {plan.summary.dapur} bahan Dapur · {plan.summary.blankStock} stok belum diisi{stored?.importedAt ? ` · Terakhir disimpan ${new Date(stored.importedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB` : " · Belum diterapkan"}</p>
          <div className={styles.toolbar}><label>Divisi<select aria-label="Divisi acuan" value={division} onChange={e => setDivision(e.target.value)}><option value="Bar">Bar ({plan.summary.bar})</option><option value="Dapur">Dapur ({plan.summary.dapur})</option><option value="">Bar & Dapur</option></select></label><label>Cari bahan<div className={panel.search}><Search size={18} aria-hidden="true" /><input aria-label="Cari bahan acuan" placeholder="Nama atau kode bahan" value={search} onChange={e => setSearch(e.target.value)} /></div></label></div>
          {(["Bar", "Dapur"] as const).map(area => {
            const rows = visible.filter(r => r.sourceCategory === area);
            if (!rows.length) return null;
            return <section className={panel.group} key={area} aria-label={`Acuan ${area}`}><div className={panel.groupHeading}><h3>{area}</h3><span>{rows.length} bahan</span></div><div className={panel.materialList}>{rows.map(row => <article className={panel.material} key={row.sourceSku} data-testid="reference-material">
              <div className={panel.materialTitle}><div><h4>{row.sourceName}</h4><p>{row.sourceSku}{row.sourceSku !== row.canonicalSku ? ` → ${row.canonicalSku}` : ""}</p></div><span className={`${styles.badge} ${row.status === "matched" ? styles.good : styles.warn}`}>{statusLabel[row.status]}</span></div>
              <dl className={panel.facts}><div><dt>Satuan sumber</dt><dd>{row.sourceUnit}</dd></div><div><dt>Minimum sumber</dt><dd>{row.sourceMin === null ? "Tidak diisi" : qty(row.sourceMin)}</dd></div><div><dt>HPP sumber</dt><dd>{money(row.sourceHpp)}</dd></div><div><dt>Stok sumber</dt><dd>{row.sourceStock === null ? "Belum diisi" : qty(row.sourceStock)}</dd></div></dl>
              {row.target && <p className={panel.note}>Master terhubung: <strong>{row.target.name}</strong> · satuan stok {row.target.unit} · biaya {money(row.target.unitCost)}/{row.target.unit}{row.metadata.minStock !== null && row.metadata.canApply ? ` · minimum acuan ${qty(row.metadata.minStock)} ${row.target.unit}` : ""}.</p>}
              {!!row.issues.length && <ul className={panel.issues}>{row.issues.map((issue, i) => <li key={`${issue.code}-${i}`}>{issue.message}</li>)}</ul>}
              <details className={panel.recipeLinks}><summary>{row.recipes.length ? `${row.recipes.length} hubungan resep — lihat menu dan takaran` : "Belum terhubung ke resep"}</summary>{row.recipes.length ? <ul>{row.recipes.map((recipe, i) => <li key={`${recipe.menuItemId}-${recipe.variantId}-${i}`}><Link href="/warehouse/recipe">{recipe.menuName}</Link><span>{qty(recipe.qty)} {recipe.unit} · {recipe.status === "active" ? "Aktif" : recipe.status === "draft" ? "Draft" : recipe.status}</span></li>)}</ul> : <p>Daftar bahan tidak menentukan takaran. Gunakan resep operasional yang sudah diuji, cocokkan satuannya, lalu ajukan persetujuan di menu Resep.</p>}</details>
              {!row.target && row.status !== "conflict" && <details className={panel.recipeLinks}><summary>Validasi kemasan untuk menambah bahan</summary><div className={styles.grid2}><label>Satuan stok kanonik<input value={confirmations[row.sourceSku]?.unit ?? ""} placeholder="Contoh: gr, ml, pcs" disabled={busy} onChange={e => changeConfirmation(row.sourceSku, { unit: e.target.value })} /></label><label>Isi kemasan dalam satuan stok<input type="number" min="0.0001" step="0.0001" inputMode="decimal" value={confirmations[row.sourceSku]?.quantity ?? ""} placeholder="Isi berdasarkan kemasan/invoice" disabled={busy} onChange={e => changeConfirmation(row.sourceSku, { quantity: e.target.value })} /></label><label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={confirmations[row.sourceSku]?.enabled ?? false} disabled={busy} onChange={e => changeConfirmation(row.sourceSku, { enabled: e.target.checked })} />Saya memvalidasi isi kemasan dan menyatakan HPP CSV adalah harga beli per kemasan.</label></div></details>}
            </article>)}</div></section>;
          })}
          {!visible.length && <p className={styles.muted}>Tidak ada bahan yang cocok. Ubah pencarian atau divisi.</p>}
          <details className={panel.recipeLinks}><summary>Ringkasan pemeriksaan ({plan.warnings.length} catatan)</summary><ul>{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul><p>{plan.summary.matched} cocok · {plan.summary.readyCreate} siap ditambah · {plan.summary.needsValidation} perlu validasi · {plan.summary.conflicts} konflik.</p></details>
          <div className={panel.apply}><label className={styles.check}><input type="checkbox" checked={applyMetadata} disabled={busy} onChange={e => { setApplyMetadata(e.target.checked); setAcknowledged(false); }} />Gunakan nama sumber sebagai alias dan minimum stok pada bahan yang satuan serta areanya cocok.</label><label className={styles.check}><input type="checkbox" checked={acknowledged} disabled={busy || needsPreview} onChange={e => setAcknowledged(e.target.checked)} />Saya sudah meninjau pemetaan dan konflik. Harga, satuan, resep aktif, serta data POS tetap dipertahankan.</label>{needsPreview && <p>Pratinjau kembali sumber dan validasi kemasan sebelum menerapkan.</p>}<button type="button" className={styles.primary} data-testid="material-reference-apply" disabled={busy || !acknowledged || needsPreview} onClick={() => void send("apply")}>{busy ? "Memproses…" : "Simpan acuan & terapkan data valid"}</button></div>
        </>}
      </div>
    </section>
  </div>;
}
