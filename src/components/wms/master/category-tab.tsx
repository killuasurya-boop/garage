"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Sparkles, X } from "lucide-react";

import { useGarageToast } from "@/components/garage/garage-toast";
import { garageApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { AREA_LABEL, AreaBadge, ConfirmDialog, errorText, ui, type MasterArea, type MasterCategory } from "./master-shared";

const AREAS: MasterArea[] = ["bar", "dapur", "umum"];

type Pending =
  | { kind: "rename"; cat: MasterCategory; name: string }
  | { kind: "area"; cat: MasterCategory; area: MasterArea }
  | { kind: "archive"; cat: MasterCategory }
  | { kind: "standard" };

export function CategoryTab({ categories, canEdit, reload }: { categories: MasterCategory[]; canEdit: boolean; reload: () => Promise<void> }) {
  const toast = useGarageToast();
  const [name, setName] = useState("");
  const [area, setArea] = useState<MasterArea>("bar");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const visible = categories.filter((c) => showArchived || !c.archived);
  const dupName = categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.push({ tone: "success", title: success });
      await reload();
      return true;
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal", body: errorText(e, "Coba lagi."), ttl: 8000 });
      return false;
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function add() {
    const n = name.trim();
    if (n.length < 2) {
      setAddError("Nama kategori minimal 2 huruf.");
      return;
    }
    setAddError(null);
    const okay = await run(() => garageApi.post("/api/wms/categories", { name: n, area }), dupName ? `Kategori "${n}" diperbarui` : `Kategori "${n}" ditambahkan`);
    if (okay) setName("");
  }

  async function confirmPending() {
    if (!pending) return;
    if (pending.kind === "rename") {
      await run(() => garageApi.patch(`/api/wms/categories/${pending.cat.id}`, { name: pending.name }), `Kategori diganti menjadi "${pending.name}"`);
      setEditingId(null);
    } else if (pending.kind === "area") {
      await run(() => garageApi.patch(`/api/wms/categories/${pending.cat.id}`, { area: pending.area }), `Area "${pending.cat.name}" → ${AREA_LABEL[pending.area]}`);
    } else if (pending.kind === "archive") {
      await run(() => garageApi.delete(`/api/wms/categories/${pending.cat.id}`), `Kategori "${pending.cat.name}" diarsipkan`);
    } else {
      setBusy(true);
      try {
        const r = await garageApi.post<{ added: number; names: string[] }>("/api/wms/categories", { installStandard: true });
        toast.push({
          tone: r.added ? "success" : "info",
          title: r.added ? `${r.added} kategori standar ditambahkan` : "Semua kategori standar sudah ada",
          body: r.added ? r.names.join(", ") : undefined,
        });
        await reload();
      } catch (e) {
        toast.push({ tone: "error", title: "Gagal", body: errorText(e, "Coba lagi.") });
      } finally {
        setBusy(false);
        setPending(null);
      }
    }
  }

  const restore = (c: MasterCategory) => void run(() => garageApi.patch(`/api/wms/categories/${c.id}`, { archived: false }), `Kategori "${c.name}" dipulihkan`);

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className={cn(ui.card, `p-4`)}>
          <form
            className="flex flex-wrap items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <div className="min-w-[200px] flex-1">
              <label htmlFor="cat-new" className={ui.label}>Kategori baru</label>
              <input id="cat-new" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Syrup, Frozen Food, Kebersihan" className={ui.input} aria-invalid={Boolean(addError)} />
              {addError ? (
                <p role="alert" className="mt-1 text-[12px] font-medium text-[#B91C1C]">{addError}</p>
              ) : dupName ? (
                <p className="mt-1 text-[12px] text-[#92400E]">Nama ini sudah ada — menyimpan akan memperbarui area/memulihkannya.</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="cat-area" className={ui.label}>Area</label>
              <select id="cat-area" value={area} onChange={(e) => setArea(e.target.value as MasterArea)} className={cn(ui.input, `w-36`)}>
                {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
              </select>
            </div>
            <button type="submit" disabled={busy} className={cn(ui.primary, `mt-[22px]`)}><Plus className="size-4" aria-hidden="true" /> Tambah</button>
            <button type="button" disabled={busy} onClick={() => setPending({ kind: "standard" })} className={cn(ui.secondary, `mt-[22px]`)}>
              <Sparkles className="size-4 text-[#C8102E]" aria-hidden="true" /> Pasang kategori standar
            </button>
          </form>
        </div>
      )}

      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[#374151]">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[#C8102E]" /> Tampilkan kategori terarsip
      </label>

      <div className="grid gap-4 lg:grid-cols-3">
        {AREAS.map((a) => {
          const list = visible.filter((c) => c.area === a);
          return (
            <section key={a} className={ui.card} aria-labelledby={`cat-col-${a}`}>
              <header className="flex items-center justify-between border-b border-[#E8E8E8] px-4 py-2.5">
                <h3 id={`cat-col-${a}`} className="flex items-center gap-2 text-[14px] font-bold text-[#111111]"><AreaBadge area={a} /> {list.length} kategori</h3>
              </header>
              <ul className="max-h-[480px] divide-y divide-[#EEF0F3] overflow-y-auto">
                {list.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-[#6B7280]">Belum ada kategori.</li>}
                {list.map((c) => (
                  <li key={c.id} className={`flex items-center gap-2 px-4 py-2 ${c.archived ? "bg-[#FAFAFB]" : ""}`}>
                    {editingId === c.id ? (
                      <form
                        className="flex min-w-0 flex-1 items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const n = editName.trim();
                          if (n.length < 2 || n === c.name) {
                            setEditingId(null);
                            return;
                          }
                          setPending({ kind: "rename", cat: c, name: n });
                        }}
                      >
                        <input aria-label={`Nama baru untuk ${c.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} className={cn(ui.input, `h-9`)} autoFocus />
                        <button type="submit" className={ui.iconBtn} aria-label="Simpan nama"><Check className="size-4 text-[#15803D]" /></button>
                        <button type="button" className={ui.iconBtn} aria-label="Batal" onClick={() => setEditingId(null)}><X className="size-4" /></button>
                      </form>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className={`break-words text-[13.5px] font-semibold ${c.archived ? "text-[#6B7280] line-through" : "text-[#111111]"}`}>{c.name}</p>
                          <p className="text-[12px] text-[#4B5563]">{c.productCount} bahan aktif{c.archived ? " · diarsipkan" : ""}</p>
                        </div>
                        {canEdit && !c.archived && (
                          <>
                            <select
                              aria-label={`Area ${c.name}`}
                              value={c.area}
                              onChange={(e) => setPending({ kind: "area", cat: c, area: e.target.value as MasterArea })}
                              className={cn(ui.input, `h-8 w-24 px-2 text-[12.5px]`)}
                            >
                              {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
                            </select>
                            <button type="button" className={ui.iconBtn} aria-label={`Ganti nama ${c.name}`} onClick={() => { setEditingId(c.id); setEditName(c.name); }}><Pencil className="size-4" /></button>
                            <button
                              type="button"
                              className={cn(ui.iconBtn, `hover:text-[#B91C1C]`)}
                              aria-label={`Arsipkan ${c.name}`}
                              disabled={c.productCount > 0}
                              title={c.productCount > 0 ? "Masih dipakai bahan aktif — pindahkan bahan dulu" : undefined}
                              onClick={() => setPending({ kind: "archive", cat: c })}
                            >
                              <Archive className="size-4" />
                            </button>
                          </>
                        )}
                        {canEdit && c.archived && (
                          <button type="button" className={cn(ui.secondary, `h-8 px-2.5 text-[12px]`)} onClick={() => restore(c)}><ArchiveRestore className="size-3.5" aria-hidden="true" /> Pulihkan</button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        busy={busy}
        danger={pending?.kind === "archive"}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
        title={
          pending?.kind === "rename"
            ? "Ganti nama kategori?"
            : pending?.kind === "area"
              ? "Pindahkan area kategori?"
              : pending?.kind === "archive"
                ? "Arsipkan kategori?"
                : "Pasang kategori standar?"
        }
        confirmLabel={pending?.kind === "archive" ? "Arsipkan" : pending?.kind === "standard" ? "Pasang" : "Ya, simpan"}
        body={
          pending?.kind === "rename" ? (
            <p>
              <b>{pending.cat.name}</b> → <b>{pending.name}</b>. {pending.cat.productCount} bahan ikut pindah ke nama baru. Stok dan resep tidak berubah.
            </p>
          ) : pending?.kind === "area" ? (
            <p>
              <b>{pending.cat.name}</b> ({pending.cat.productCount} bahan) pindah dari {AREA_LABEL[pending.cat.area]} ke <b>{AREA_LABEL[pending.area]}</b>. Bahan ini akan muncul di
              daftar Minta Bahan & reorder area {AREA_LABEL[pending.area]}. Stok yang sudah ada di ruang lama tidak dipindah otomatis.
            </p>
          ) : pending?.kind === "archive" ? (
            <p>Kategori disembunyikan dari pilihan, tapi tidak dihapus. Bisa dipulihkan kapan saja.</p>
          ) : (
            <p>
              Menambah kategori contoh: Bar (Kopi, Susu, Syrup, Powder, Tea, Topping, Gula, Packaging Bar), Dapur (Protein, Frozen Food, Bumbu, Saus, Minyak, Sayuran, Beras,
              Packaging Dapur), Umum (Kebersihan, Kebutuhan Operasional). Yang sudah ada tidak diubah.
            </p>
          )
        }
      />
    </div>
  );
}
