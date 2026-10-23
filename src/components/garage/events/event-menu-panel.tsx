"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowUpRight, Copy, Eye, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminEvent } from "@/lib/event-service";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";
import { toZonedInputValue } from "@/lib/event-format";
import { EventBundleVisual } from "@/components/garage/events/event-bundle-visual";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const control = "min-h-11 w-full rounded-md border border-garage-line bg-garage-bg-2 px-3 text-base text-garage-fg";
type EntryForm = Omit<EventMenuEntry, "id" | "eventId" | "usedQuantity">;
type MenuData = { entries: EventMenuEntry[]; products: EventMenuProduct[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };

function editable(entry: EventMenuEntry): EntryForm {
  return { kind: entry.kind, name: entry.name, description: entry.description, menuItemId: entry.menuItemId, variantId: entry.variantId, price: entry.price, status: entry.status, startsAt: entry.startsAt, endsAt: entry.endsAt, quota: entry.quota, sortOrder: entry.sortOrder, groups: entry.groups, imageUrl: entry.imageUrl };
}

/** randomUUID hanya ada di origin aman (https/localhost); fallback untuk LAN http. */
function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function uploadImage(path: string, file: File) {
  const body = new FormData();
  body.set("image", file);
  const res = await fetch(path, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Foto gagal diunggah.");
  return json.data as EventMenuEntry;
}

type Group = EntryForm["groups"][number];

/** Editor satu kelompok paket: cari opsi, urut per kategori, opsi terpilih tampil sebagai chip. */
function BundleGroupEditor({ group, index, products, onChange, onRemove }: {
  group: Group;
  index: number;
  products: EventMenuProduct[];
  onChange: (group: Group) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const sorted = [...products].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const visible = sorted.filter((product) => !needle || `${product.name} ${product.category}`.toLowerCase().includes(needle));
  const isChecked = (itemId: string, variantId: string) => group.options.some((option) => option.itemId === itemId && option.variantId === variantId);
  const toggle = (itemId: string, variantId: string, checked: boolean) => onChange({ ...group, options: checked ? [...group.options, { itemId, variantId }] : group.options.filter((option) => !(option.itemId === itemId && option.variantId === variantId)) });
  const labelOf = (itemId: string, variantId: string) => {
    const product = products.find((p) => p.id === itemId);
    return `${product?.name ?? itemId} · ${product?.variants.find((v) => v.id === variantId)?.label ?? variantId}`;
  };
  return <fieldset className="grid gap-3 rounded-md border border-garage-line p-3">
    <legend className="px-1 text-sm font-bold">Kelompok {index + 1}</legend>
    <div className="grid gap-3 sm:grid-cols-[1fr_110px_auto]">
      <Input aria-label={`Nama kelompok ${index + 1}`} required placeholder="Mis. Minuman" value={group.name} onChange={(e) => onChange({ ...group, name: e.target.value })} className="min-h-11" />
      <Input aria-label={`Jumlah komponen ${index + 1}`} type="number" min={1} max={10} value={group.quantity} onChange={(e) => onChange({ ...group, quantity: Math.min(10, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} className="min-h-11" />
      <Button type="button" variant="outline" className="min-h-11" onClick={onRemove}>Hapus kelompok</Button>
    </div>
    {group.options.length ? <div className="flex flex-wrap gap-2" aria-label={`Opsi terpilih kelompok ${index + 1}`}>
      {group.options.map((option) => <span key={`${option.itemId}:${option.variantId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-garage-amber/50 bg-garage-amber/10 pl-2.5 text-sm font-semibold text-garage-fg">
        {labelOf(option.itemId, option.variantId)}
        <button type="button" className="inline-flex size-9 cursor-pointer items-center justify-center text-garage-dim hover:text-white" aria-label={`Hapus ${labelOf(option.itemId, option.variantId)}`} onClick={() => toggle(option.itemId, option.variantId, false)}><X className="size-4" /></button>
      </span>)}
    </div> : <p className="text-sm text-garage-amber">Belum ada opsi. Cari lalu centang produk/varian.</p>}
    <div className="relative"><Search aria-hidden className="absolute left-3 top-3.5 size-4 text-garage-dim" /><Input aria-label={`Cari opsi kelompok ${index + 1}`} placeholder="Cari produk, mis. latte, kentang…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 pl-9" /></div>
    <div className="garage-scroll max-h-64 overflow-y-auto rounded-md border border-garage-line">
      {visible.length ? visible.map((product, productIndex) => <div key={product.id} className="border-b border-garage-line px-3 py-1.5 last:border-b-0">
        {productIndex === 0 || visible[productIndex - 1].category !== product.category ? <p className="pt-1 text-xs font-bold uppercase tracking-wide text-garage-amber">{product.category}</p> : null}
        <div className="flex flex-wrap items-center gap-x-4">
          <span className="min-w-0 flex-1 break-words py-2 text-sm font-semibold text-garage-fg">{product.name}{product.stock === "sold_out" ? " (habis)" : ""}</span>
          {product.variants.map((variant) => <label key={variant.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={isChecked(product.id, variant.id)} onChange={(e) => toggle(product.id, variant.id, e.target.checked)} />{variant.label}
          </label>)}
        </div>
      </div>) : <p className="p-3 text-sm text-garage-dim">Tidak ada produk cocok.</p>}
    </div>
  </fieldset>;
}

async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { method, cache: "no-store", signal, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const json = await res.json();
  if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Permintaan gagal.");
  return json.data;
}

export function EventMenuPanel({ event }: { event: AdminEvent }) {
  const [data, setData] = useState<MenuData | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState("");
  const [productId, setProductId] = useState("");
  const [sort, setSort] = useState("sortOrder");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EntryForm | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventMenuEntry | null>(null);
  const [archive, setArchive] = useState<EventMenuEntry | null>(null);
  const [formError, setFormError] = useState("");
  const [pendingImage, setPendingImageFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const setPendingImage = useCallback((file: File | null) => {
    setPendingImageFile(file);
    setPendingPreview((current) => { if (current) URL.revokeObjectURL(current); return file ? URL.createObjectURL(file) : null; });
  }, []);
  const endpoint = `/api/events/${event.id}/menu`;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ q, sort, page: String(page), pageSize: "12" });
      if (status !== "all") query.set("status", status);
      if (kind !== "all") query.set("kind", kind);
      if (category) query.set("category", category);
      if (productId) query.set("productId", productId);
      const result = await request<MenuData>(`${endpoint}?${query}`, "GET", undefined, signal);
      if (!signal?.aborted) setData(result);
    } catch (err) { if (!signal?.aborted) setError(err instanceof Error ? err.message : "Menu event gagal dimuat."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [endpoint, q, status, kind, category, productId, sort, page]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load]);

  function openNew() {
    setEditId(null); setFormError(""); setPendingImage(null);
    setForm({ kind: "item", name: "", description: "", menuItemId: null, variantId: null, price: 0, status: "active", startsAt: event.startsAt, endsAt: event.endsAt, quota: null, sortOrder: 0, groups: [], imageUrl: null });
  }
  function openEdit(entry: EventMenuEntry) { setEditId(entry.id); setForm(editable(entry)); setFormError(""); setPendingImage(null); setDetail(null); }
  // Duplikat paket: grup & opsi disalin (id grup baru), lalu tinggal ubah nama/harga/opsi.
  function openDuplicate(entry: EventMenuEntry) {
    setEditId(null); setFormError(""); setPendingImage(null); setDetail(null);
    setForm({ ...editable(entry), name: `${entry.name} (salinan)`.slice(0, 120), status: "active", groups: entry.groups.map((group) => ({ ...group, id: newId(), options: [...group.options] })) });
  }
  function patchForm(patch: Partial<EntryForm>) { setForm((current) => current ? { ...current, ...patch } : current); }

  async function save() {
    if (!form) return;
    setBusy(true); setFormError("");
    try {
      const saved = await request<EventMenuEntry>(editId ? `${endpoint}/${editId}` : endpoint, editId ? "PUT" : "POST", form);
      if (pendingImage) await uploadImage(`${endpoint}/${saved.id}/image`, pendingImage);
      setForm(null); setPendingImage(null); toast.success(editId ? "Menu event diperbarui." : "Menu event ditambahkan."); await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : "Menu gagal disimpan."); }
    finally { setBusy(false); }
  }
  async function toggle(entry: EventMenuEntry) {
    setBusy(true); setError("");
    try { await request(`${endpoint}/${entry.id}`, "PUT", { ...editable(entry), status: entry.status === "active" ? "inactive" : "active" }); toast.success("Status menu diperbarui."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Status gagal diubah."); }
    finally { setBusy(false); }
  }
  async function confirmArchive() {
    if (!archive) return;
    setBusy(true); setError("");
    try { await request(`${endpoint}/${archive.id}`, "DELETE"); setArchive(null); toast.success("Menu event diarsipkan."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Menu gagal diarsipkan."); }
    finally { setBusy(false); }
  }

  const products = data?.products ?? [];
  const selectedProduct = products.find((product) => product.id === form?.menuItemId);

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Menu & Paket Event</h2><p className="mt-1 text-sm text-garage-dim">Referensi produk F&B existing. Harga reguler tetap. Stok fisik mengikuti operasional; kuota event kosong berarti tanpa batas.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="min-h-11"><Link href={`/events/${event.slug}/menu?preview=1`} target="_blank">Preview <ArrowUpRight className="size-4" /></Link></Button><Button onClick={openNew} className="min-h-11" disabled={event.status === "archived"}><Plus className="size-4" /> Tambah Menu / Paket</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="relative"><Search aria-hidden className="absolute left-3 top-3.5 size-4 text-garage-dim" /><Input aria-label="Cari menu event" placeholder="Cari menu atau produk…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="min-h-11 pl-9" /></div><select aria-label="Filter status menu event" className={control} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="archived">Arsip</option></select><select aria-label="Filter jenis menu event" className={control} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="all">Semua jenis</option><option value="item">A la carte</option><option value="bundle">Paket bundling</option></select><select aria-label="Urutan menu event" className={control} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="sortOrder">Urutan tampil</option><option value="name">Nama</option><option value="price">Harga</option></select></div>
    <div className="grid gap-3 sm:grid-cols-2"><select aria-label="Filter kategori produk event" className={control} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">Semua kategori produk</option>{[...new Set(products.map(product => product.category))].sort().map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Filter produk event" className={control} value={productId} onChange={(e) => { setProductId(e.target.value); setPage(1); }}><option value="">Semua produk</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>
    {error && <div role="alert" className="rounded-md border border-garage-red/50 p-3 text-sm text-garage-red-bright">{error} <button className="ml-2 cursor-pointer underline" onClick={() => void load()}>Coba lagi</button></div>}
    {loading ? <p role="status" className="p-5 text-garage-dim">Memuat menu event…</p> : data?.entries.length ? <div className="grid gap-3">{data.entries.map((entry) => <article key={entry.id} className="flex flex-col justify-between gap-4 rounded-lg border border-garage-line bg-garage-bg-2 p-4 lg:flex-row"><div className="flex min-w-0 gap-4">{entry.kind === "bundle" ? <EventBundleVisual entry={entry} products={products} className="size-20 shrink-0" /> : null}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold text-garage-fg">{entry.name}</h3><span className="rounded border border-garage-line px-2 py-1 text-sm text-garage-dim">{entry.kind === "bundle" ? "Paket" : "A la carte"} · {entry.status === "active" ? "Aktif" : entry.status === "inactive" ? "Nonaktif" : "Arsip"}</span></div><p className="mt-2 font-mono text-base font-bold tabular-nums">{money.format(entry.price)}</p><p className="mt-1 text-sm text-garage-dim">{entry.quota === null ? "Kuota tanpa batas" : `Kuota ${entry.usedQuantity}/${entry.quota}`} · Urutan {entry.sortOrder}</p></div></div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" className="min-h-11" onClick={() => setDetail(entry)}><Eye className="size-4" /> Detail</Button>{entry.status !== "archived" && <><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => openEdit(entry)}><Pencil className="size-4" /> Edit</Button>{entry.kind === "bundle" && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => openDuplicate(entry)}><Copy className="size-4" /> Duplikat</Button>}<Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void toggle(entry)}>{entry.status === "active" ? "Nonaktifkan" : "Aktifkan"}</Button><Button variant="outline" className="min-h-11 text-garage-red-bright" disabled={busy} onClick={() => setArchive(entry)}><Archive className="size-4" /> Arsip</Button></>}</div></article>)}</div> : <div className="rounded-lg border border-dashed border-garage-line p-8 text-center text-garage-dim">Belum ada menu yang sesuai filter. Tambahkan produk atau paket dari katalog Garage.</div>}
    {data && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-garage-dim"><span>{data.pagination.total} konfigurasi · Halaman {data.pagination.page}/{Math.max(1, data.pagination.totalPages)}</span><div className="flex gap-2"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button><Button variant="outline" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Berikutnya</Button></div></div>}

    <Dialog open={!!form} onOpenChange={(value) => { if (!value && !busy) setForm(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editId ? "Edit menu event" : "Tambah menu / paket"}</DialogTitle><DialogDescription>Harga dan jadwal hanya berlaku untuk kanal event ini. Order terdahulu tetap memakai snapshot.</DialogDescription></DialogHeader>{form && <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-kind">Jenis</label><select id="event-menu-kind" className={control} value={form.kind} onChange={(e) => patchForm({ kind: e.target.value as EntryForm["kind"], menuItemId: null, variantId: null, groups: [] })}><option value="item">A la carte</option><option value="bundle">Paket bundling</option></select></div>
      {form.kind === "item" && <><div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-product">Produk existing</label><select id="event-menu-product" className={control} required value={form.menuItemId ?? ""} onChange={(e) => { const p = products.find((row) => row.id === e.target.value); patchForm({ menuItemId: p?.id ?? null, variantId: p?.variants[0]?.id ?? null, name: p?.name ?? "", price: p?.variants[0]?.price ?? 0 }); }}><option value="">Pilih produk</option>{products.filter((p) => p.showInDigitalMenu !== false && !p.bundleOnly).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.category} · {p.id}</option>)}</select></div><div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-variant">Varian</label><select id="event-menu-variant" required className={control} value={form.variantId ?? ""} onChange={(e) => patchForm({ variantId: e.target.value })}><option value="">Pilih varian</option>{selectedProduct?.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label} · reguler {money.format(variant.price)}</option>)}</select></div></>}
      <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-name">Nama tampil</label><Input id="event-menu-name" required minLength={2} maxLength={120} value={form.name} onChange={(e) => patchForm({ name: e.target.value })} /></div>
      <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-description">Deskripsi</label><Textarea id="event-menu-description" maxLength={600} value={form.description ?? ""} onChange={(e) => patchForm({ description: e.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-price">Harga event (Rp)</label><Input id="event-menu-price" type="number" min={1} max={50000000} required value={form.price || ""} onChange={(e) => patchForm({ price: Number(e.target.value) })} /></div><div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-quota">Kuota (opsional)</label><Input id="event-menu-quota" type="number" min={1} placeholder="Tanpa batas" value={form.quota ?? ""} onChange={(e) => patchForm({ quota: e.target.value ? Number(e.target.value) : null })} /></div><div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-sort">Urutan tampil</label><Input id="event-menu-sort" type="number" min={0} value={form.sortOrder} onChange={(e) => patchForm({ sortOrder: Number(e.target.value) })} /></div></div>
      <div className="grid gap-3 sm:grid-cols-2">{(["startsAt", "endsAt"] as const).map((field) => <div className="grid gap-2" key={field}><label className="text-sm font-semibold" htmlFor={`menu-${field}`}>{field === "startsAt" ? "Mulai" : "Berakhir"} (WIB)</label><Input id={`menu-${field}`} type="datetime-local" required value={toZonedInputValue(form[field], "Asia/Jakarta")} onChange={(e) => { if (e.target.value) patchForm({ [field]: new Date(`${e.target.value}:00+07:00`).toISOString() }); }} /></div>)}</div>
      <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="event-menu-status">Status</label><select id="event-menu-status" className={control} value={form.status} onChange={(e) => patchForm({ status: e.target.value as EntryForm["status"] })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></div>
      {form.kind === "bundle" && <div className="grid gap-3 rounded-lg border border-garage-line p-3 sm:grid-cols-[160px_1fr] sm:items-center">
        {pendingPreview ? <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-garage-line-2 bg-garage-bg-3 sm:w-40">
          {/* Pratinjau file lokal (blob:) — next/image tidak berlaku. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingPreview} alt="Pratinjau foto paket" className="h-full w-full object-cover" />
        </div>
          : <EventBundleVisual entry={{ ...form, id: editId ?? "new", eventId: event.id, usedQuantity: 0 }} products={products} className="aspect-[4/3] w-full sm:w-40" />}
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Foto paket</p>
          <p className="text-sm text-garage-dim">JPG/PNG/WebP maks 8 MB, otomatis dikompres. Tanpa foto, kartu memakai kolase foto isi paket.</p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-garage-line bg-garage-bg-2 px-3 text-sm font-semibold hover:border-garage-amber/60"><ImagePlus className="size-4" aria-hidden />{form.imageUrl || pendingImage ? "Ganti foto" : "Unggah foto paket"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) setPendingImage(file); e.target.value = ""; }} /></label>
            {(form.imageUrl || pendingImage) && <Button type="button" variant="outline" className="min-h-11" onClick={() => { setPendingImage(null); patchForm({ imageUrl: null }); }}><Trash2 className="size-4" /> Hapus foto</Button>}
          </div>
        </div>
      </div>}
      {form.kind === "bundle" && <div className="grid gap-3 rounded-lg border border-garage-line p-3"><h3 className="font-bold">Komponen paket</h3><p className="text-sm text-garage-dim">Setiap kelompok wajib dipilih pelanggan. Pilih satu opsi untuk komponen tetap, atau beberapa opsi sebagai pilihan.</p>{form.groups.map((group, index) => <BundleGroupEditor key={group.id} group={group} index={index} products={products} onChange={(next) => patchForm({ groups: form.groups.map((g) => g.id === group.id ? next : g) })} onRemove={() => patchForm({ groups: form.groups.filter((g) => g.id !== group.id) })} />)}<Button type="button" variant="outline" className="min-h-11" onClick={() => patchForm({ groups: [...form.groups, { id: newId(), name: "", quantity: 1, options: [] }] })}><Plus className="size-4" /> Tambah kelompok komponen</Button></div>}
      {formError && <p role="alert" className="rounded-md border border-garage-red/50 p-3 text-sm text-garage-red-bright">{formError}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Menu Event"}</Button></div>
    </form>}</DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={(value) => { if (!value) setDetail(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>Detail konfigurasi menu event.</DialogDescription></DialogHeader>{detail && <div className="grid gap-3 text-sm"><p>{detail.description || "Tanpa deskripsi."}</p><p className="font-mono text-lg font-bold">{money.format(detail.price)}</p><p>Jenis: {detail.kind === "bundle" ? "Paket bundling" : "A la carte"} · Status: {detail.status}</p><p>Produk: {detail.menuItemId ?? "Komponen paket"} · Varian: {detail.variantId ?? "Sesuai pilihan"}</p><p>Mulai: {toZonedInputValue(detail.startsAt, event.timezone).replace("T", " ")} · Berakhir: {toZonedInputValue(detail.endsAt, event.timezone).replace("T", " ")}</p><p>Kuota: {detail.quota ?? "Tanpa batas"} · Terpakai: {detail.usedQuantity}</p>{detail.groups.map((g) => <div key={g.id}><strong>{g.name} × {g.quantity}</strong><ul className="mt-2 list-inside list-disc">{g.options.map((o) => <li key={`${o.itemId}:${o.variantId}`}>{products.find((p) => p.id === o.itemId)?.name ?? o.itemId} · {products.find((p) => p.id === o.itemId)?.variants.find((v) => v.id === o.variantId)?.label ?? o.variantId}</li>)}</ul></div>)}{detail.status !== "archived" && <Button onClick={() => openEdit(detail)}>Edit konfigurasi</Button>}</div>}</DialogContent></Dialog>
    <Dialog open={!!archive} onOpenChange={(value) => { if (!value && !busy) setArchive(null); }}><DialogContent><DialogHeader><DialogTitle>Arsipkan {archive?.name}?</DialogTitle><DialogDescription>Menu tidak lagi dijual di event ini. Master produk, transaksi, harga historis, dan stok tidak dihapus.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setArchive(null)}>Batal</Button><Button variant="destructive" disabled={busy} onClick={() => void confirmArchive()}>{busy ? "Memproses…" : "Arsipkan Menu"}</Button></div></DialogContent></Dialog>
  </div>;
}
