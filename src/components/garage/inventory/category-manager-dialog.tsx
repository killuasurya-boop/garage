"use client";

import { useMemo, useState } from "react";
import { Archive, Check, FolderPlus, Pencil, RotateCcw, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { garageApi } from "@/lib/api-client";
import {
  CATEGORY_KIND_LABEL,
  CATEGORY_STATION_LABEL,
  CATEGORY_STATUS_LABEL,
  POS_GROUPS,
  PRODUCT_TYPE_LABEL,
  SUGGESTED_CATEGORIES,
  type CategoryKind,
  type CategoryStation,
  type PosGroup,
  type ProductCategoryRow,
  type ProductType,
} from "@/lib/product-catalog-types";

type CategoryForm = {
  name: string;
  description: string;
  kind: CategoryKind;
  defaultProductType: ProductType;
  station: CategoryStation;
  posGroup: PosGroup;
  skuPrefix: string;
  sortOrder: string;
  status: "active" | "inactive";
};

const emptyForm: CategoryForm = {
  name: "",
  description: "",
  kind: "fnb",
  defaultProductType: "menu",
  station: "dapur",
  posGroup: "Dapur",
  skuPrefix: "",
  sortOrder: "",
  status: "active",
};

const fieldClass = "h-9 border-[#34343c] bg-white/[0.06] text-sm";

export function CategoryManagerDialog({
  open,
  onOpenChange,
  categories,
  products,
  onChanged,
  onShowProducts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategoryRow[];
  /** Nama produk per kategori (untuk "lihat produk"). */
  products: Array<{ id: string; name: string; categoryId?: string | null; category: string; status?: string }>;
  onChanged: () => Promise<void> | void;
  /** Buka katalog dengan filter kategori ini. */
  onShowProducts?: (categoryId: string) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ProductCategoryRow | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = categories.filter((c) => (showArchived ? true : c.status !== "archived"));
  const activeTargets = categories.filter((c) => c.status === "active" && c.id !== archiveTarget?.id);
  const existingNames = useMemo(() => new Set(categories.map((c) => c.name.toLowerCase())), [categories]);
  // Saran kategori hanya yang belum ada (termasuk alias: Minuman Botol ≈ Air Mineral).
  const suggestions = SUGGESTED_CATEGORIES.filter(
    (s) => ![s.name, ...(s.aliases ?? [])].some((name) => existingNames.has(name.toLowerCase())),
  );

  function startEdit(category: ProductCategoryRow) {
    setEditId(category.id);
    setForm({
      name: category.name,
      description: category.description ?? "",
      kind: category.kind,
      defaultProductType: category.defaultProductType,
      station: category.station,
      posGroup: category.posGroup,
      skuPrefix: category.skuPrefix ?? "",
      sortOrder: String(category.sortOrder),
      status: category.status === "inactive" ? "inactive" : "active",
    });
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setEditId(null);
    setForm(emptyForm);
  }

  function applyKind(kind: CategoryKind) {
    setForm((current) => ({
      ...current,
      kind,
      defaultProductType: kind === "retail" ? "retail" : current.defaultProductType === "retail" ? "menu" : current.defaultProductType,
      station: kind === "fnb" ? (current.station === "none" ? "dapur" : current.station) : "none",
      posGroup: kind === "fnb" ? (current.posGroup === "Lainnya" ? "Dapur" : current.posGroup) : "Lainnya",
    }));
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      setNotice(message);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan kategori.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const sortOrder = form.sortOrder.trim() ? Number(form.sortOrder) : undefined;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      kind: form.kind,
      defaultProductType: form.defaultProductType,
      station: form.station,
      posGroup: form.posGroup,
      skuPrefix: form.skuPrefix.trim() || null,
      ...(sortOrder !== undefined && Number.isFinite(sortOrder) ? { sortOrder } : {}),
      status: form.status,
    };
    if (payload.name.length < 2) {
      setError("Nama kategori minimal 2 huruf.");
      return;
    }
    void run(async () => {
      if (editId) {
        await garageApi.patch(`/api/products/categories/${editId}`, { action: "update", ...payload });
        resetForm();
        return `Kategori "${payload.name}" diperbarui.`;
      }
      await garageApi.post("/api/products/categories", payload);
      resetForm();
      return `Kategori "${payload.name}" ditambahkan.`;
    });
  }

  function addSuggestion(s: (typeof SUGGESTED_CATEGORIES)[number]) {
    void run(async () => {
      await garageApi.post("/api/products/categories", {
        name: s.name,
        kind: s.kind,
        defaultProductType: s.defaultProductType,
        station: s.station,
        posGroup: s.posGroup,
        skuPrefix: s.skuPrefix,
      });
      return `Kategori "${s.name}" ditambahkan.`;
    });
  }

  function confirmArchive() {
    if (!archiveTarget) return;
    const target = archiveTarget;
    void run(async () => {
      await garageApi.patch(`/api/products/categories/${target.id}`, {
        action: "archive",
        moveToCategoryId: moveTo || null,
        reason: archiveReason.trim() || null,
      });
      setArchiveTarget(null);
      setMoveTo("");
      setArchiveReason("");
      return `Kategori "${target.name}" diarsipkan${moveTo ? " dan produknya dipindahkan" : ""}.`;
    });
  }

  function restore(category: ProductCategoryRow) {
    void run(async () => {
      await garageApi.patch(`/api/products/categories/${category.id}`, { action: "restore" });
      return `Kategori "${category.name}" dipulihkan.`;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#0b0b0e] p-0 text-[#f4f4f5] sm:max-w-5xl">
        <DialogHeader className="space-y-1 border-b border-[#34343c] bg-[#18181f] px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
            <FolderPlus className="size-5 text-[#f5a742]" />
            Manajemen Kategori
          </DialogTitle>
          <DialogDescription className="text-xs text-[#d4d4d8]">
            Kategori dinamis untuk POS, menu digital, laporan, dan SKU otomatis. Kategori yang dipakai transaksi tidak dihapus — arsipkan
            dan pindahkan produknya.
          </DialogDescription>
        </DialogHeader>

        <div className="garage-scrollbar grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[340px_1fr]">
          {/* Form tambah / edit */}
          <div className="space-y-3 rounded-md border border-[#34343c] bg-[#18181f] p-3">
            <p className="text-sm font-black text-white">{editId ? "Edit kategori" : "Tambah kategori"}</p>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-[#d4d4d8]">Nama kategori*</span>
              <Input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} placeholder="Mis. Tea, Rokok, Air Mineral" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-[#d4d4d8]">Deskripsi</span>
              <Input value={form.description} maxLength={240} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} placeholder="Opsional" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Jenis</span>
                <Select value={form.kind} onValueChange={(v) => applyKind(v as CategoryKind)}>
                  <SelectTrigger className={fieldClass} aria-label="Jenis kategori"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_KIND_LABEL) as CategoryKind[]).map((k) => (
                      <SelectItem key={k} value={k}>{CATEGORY_KIND_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Tipe produk default</span>
                <Select value={form.defaultProductType} onValueChange={(v) => setForm({ ...form, defaultProductType: v as ProductType })}>
                  <SelectTrigger className={fieldClass} aria-label="Tipe produk default"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map((k) => (
                      <SelectItem key={k} value={k}>{PRODUCT_TYPE_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Routing produksi</span>
                <Select value={form.station} onValueChange={(v) => setForm({ ...form, station: v as CategoryStation })}>
                  <SelectTrigger className={fieldClass} aria-label="Routing produksi"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_STATION_LABEL) as CategoryStation[]).map((k) => (
                      <SelectItem key={k} value={k}>{CATEGORY_STATION_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Grup tombol POS</span>
                <Select value={form.posGroup} onValueChange={(v) => setForm({ ...form, posGroup: v as PosGroup })}>
                  <SelectTrigger className={fieldClass} aria-label="Grup POS"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POS_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Prefix SKU</span>
                <Input value={form.skuPrefix} maxLength={6} onChange={(e) => setForm({ ...form, skuPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className={`${fieldClass} font-mono`} placeholder="GEN" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Urutan tampil</span>
                <Input inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/[^\d]/g, "") })} className={fieldClass} placeholder="Otomatis" />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-[#d4d4d8]">Status</span>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                <SelectTrigger className={fieldClass} aria-label="Status kategori"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif (bisa dipilih produk)</SelectItem>
                  <SelectItem value="inactive">Nonaktif (tidak bisa dipilih produk baru)</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {error ? <p className="rounded border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-2 text-xs text-[#fecaca]" role="alert">{error}</p> : null}
            {notice ? <p className="rounded border border-[#22c55e]/45 bg-[#22c55e]/12 p-2 text-xs text-[#bbf7d0]" role="status">{notice}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="garage-press h-9 gap-1.5 bg-[#d11a2a] text-xs text-white hover:bg-[#b91524]" onClick={save} disabled={busy}>
                <Check className="size-4" />
                {busy ? "Menyimpan..." : editId ? "Simpan perubahan" : "Tambah kategori"}
              </Button>
              {editId ? (
                <Button type="button" variant="outline" className="h-9 gap-1.5 border-[#34343c] bg-white/[0.04] text-xs" onClick={resetForm}>
                  <X className="size-4" />
                  Batal edit
                </Button>
              ) : null}
            </div>
            {suggestions.length ? (
              <div className="space-y-2 border-t border-[#34343c] pt-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-[#ffd08a]">
                  <Sparkles className="size-3.5" />
                  Saran struktur kategori (belum ada)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      disabled={busy}
                      onClick={() => addSuggestion(s)}
                      className="rounded border border-[#34343c] bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-[#e4e4e7] transition hover:border-[#f5a742]/60 hover:text-white disabled:opacity-50"
                      title={`${CATEGORY_KIND_LABEL[s.kind]} · ${CATEGORY_STATION_LABEL[s.station]}`}
                    >
                      + {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Daftar kategori */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-white">{visible.length} kategori</p>
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs font-semibold text-[#ffd08a] underline-offset-2 hover:underline"
              >
                {showArchived ? "Sembunyikan arsip" : `Tampilkan arsip (${categories.filter((c) => c.status === "archived").length})`}
              </button>
            </div>
            {archiveTarget ? (
              <div className="space-y-2 rounded-md border border-[#f5a742]/50 bg-[#f5a742]/10 p-3">
                <p className="text-sm font-bold text-[#ffd08a]">Arsipkan &quot;{archiveTarget.name}&quot;?</p>
                <p className="text-xs text-[#e4e4e7]">
                  {archiveTarget.activeProducts + archiveTarget.archivedProducts > 0
                    ? `${archiveTarget.activeProducts} produk aktif & ${archiveTarget.archivedProducts} produk nonaktif memakai kategori ini. ${archiveTarget.activeProducts > 0 ? "Wajib pilih kategori tujuan." : "Pindahkan (opsional)."}`
                    : "Tidak ada produk di kategori ini."}{" "}
                  Riwayat transaksi tetap utuh.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={moveTo || "__none"} onValueChange={(v) => setMoveTo(v === "__none" ? "" : v)}>
                    <SelectTrigger className={fieldClass} aria-label="Pindahkan produk ke"><SelectValue placeholder="Pindahkan produk ke…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Jangan pindahkan</SelectItem>
                      {activeTargets.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={archiveReason} maxLength={240} onChange={(e) => setArchiveReason(e.target.value)} className={fieldClass} placeholder="Alasan (dicatat di audit)" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="h-9 gap-1.5 bg-[#f5a742] text-xs text-black hover:bg-[#ffc167]" onClick={confirmArchive} disabled={busy || (archiveTarget.activeProducts > 0 && !moveTo)}>
                    <Archive className="size-4" />
                    Arsipkan
                  </Button>
                  <Button type="button" variant="outline" className="h-9 border-[#34343c] bg-white/[0.04] text-xs" onClick={() => setArchiveTarget(null)}>
                    Batal
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="garage-scrollbar max-h-[56svh] space-y-2 overflow-y-auto pr-1">
              {visible.map((c) => {
                const list = products.filter((p) => (p.categoryId ? p.categoryId === c.id : p.category === c.name));
                return (
                  <div key={c.id} className={`rounded-md border p-3 ${c.status === "archived" ? "border-[#34343c] bg-black/30 opacity-80" : "border-[#3f3f48] bg-white/[0.05]"}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-black text-white">
                          {c.name}
                          <Badge className={c.status === "active" ? "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#bbf7d0]" : c.status === "inactive" ? "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]" : "border-[#52525b] bg-white/[0.06] text-[#d4d4d8]"}>
                            {CATEGORY_STATUS_LABEL[c.status]}
                          </Badge>
                        </p>
                        <p className="mt-0.5 text-xs text-[#c4c4cc]">
                          {CATEGORY_KIND_LABEL[c.kind]} · {PRODUCT_TYPE_LABEL[c.defaultProductType]} · {CATEGORY_STATION_LABEL[c.station]} · POS {c.posGroup} · SKU {c.skuPrefix ?? "GEN"}-### · urut {c.sortOrder}
                        </p>
                        {c.description ? <p className="mt-0.5 text-xs text-[#a1a1aa]">{c.description}</p> : null}
                        <button
                          type="button"
                          className="mt-1 text-xs font-semibold text-[#ffd08a] underline-offset-2 hover:underline"
                          onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                        >
                          {c.activeProducts} produk aktif · {c.archivedProducts} nonaktif {list.length ? (expanded === c.id ? "▲" : "▼") : ""}
                        </button>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {c.status === "archived" ? (
                          <Button type="button" variant="outline" className="h-8 gap-1 border-[#34343c] bg-white/[0.04] px-2 text-xs" onClick={() => restore(c)} disabled={busy}>
                            <RotateCcw className="size-3.5" />
                            Pulihkan
                          </Button>
                        ) : (
                          <>
                            <Button type="button" variant="outline" className="h-8 gap-1 border-[#34343c] bg-white/[0.04] px-2 text-xs" onClick={() => startEdit(c)} disabled={busy}>
                              <Pencil className="size-3.5" />
                              Edit
                            </Button>
                            <Button type="button" variant="outline" className="h-8 gap-1 border-[#f5a742]/45 bg-[#f5a742]/10 px-2 text-xs text-[#ffd08a]" onClick={() => { setArchiveTarget(c); setMoveTo(""); setArchiveReason(""); }} disabled={busy}>
                              <Archive className="size-3.5" />
                              Arsip
                            </Button>
                          </>
                        )}
                        {onShowProducts && list.length ? (
                          <Button type="button" variant="outline" className="h-8 border-[#34343c] bg-white/[0.04] px-2 text-xs" onClick={() => onShowProducts(c.id)}>
                            Lihat di katalog
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {expanded === c.id && list.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {list.map((p) => (
                          <span key={p.id} className={`rounded border border-white/10 bg-black/25 px-2 py-0.5 text-[11px] ${p.status === "archived" ? "text-[#a1a1aa] line-through" : "text-[#e4e4e7]"}`}>
                            {p.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
