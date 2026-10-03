"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Camera,
  ExternalLink,
  Eye,
  EyeOff,
  ImageOff,
  Loader2,
  QrCode,
  Search,
  Star,
} from "lucide-react";

import { MenuOrderEditor } from "@/components/garage/inventory/menu-order-editor";
import { MenuPhoto } from "@/components/garage/order/menu-card";
import { itemHasPromo, itemMinPrice, rupiah } from "@/components/garage/order/order-ui";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import type { MenuItem } from "@/lib/garage-api-types";

type Filter = "all" | "visible" | "hidden" | "featured" | "no-photo";
type Stock = MenuItem["stock"];

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "visible", label: "Tampil" },
  { id: "hidden", label: "Disembunyikan" },
  { id: "featured", label: "Unggulan" },
  { id: "no-photo", label: "Tanpa foto" },
];

const STOCK_OPTIONS: Array<{ id: Stock; label: string }> = [
  { id: "ready", label: "Ready" },
  { id: "limited", label: "Limit" },
  { id: "sold_out", label: "Habis" },
];

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // sama dengan batas /api/menu/[id]/image

// Panel "Menu Digital": kelola tampilan menu QR pelanggan (/order) dari satu layar —
// foto, tampil/sembunyi, unggulan (banner), dan stok. Semua aksi lewat API menu yang
// sama dengan POS, jadi perubahan langsung terlihat di POS, QR, dan website.
export function DigitalMenuManager({
  items,
  onChanged,
}: {
  items: MenuItem[];
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, Partial<MenuItem>>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Mode "Atur urutan" menggantikan grid kartu sementara.
  const [ordering, setOrdering] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const merged = useMemo(
    () => items.map((item) => ({ ...item, ...(overrides[item.id] ?? {}) })),
    [items, overrides],
  );

  const stats = useMemo(
    () => ({
      visible: merged.filter((item) => item.showInDigitalMenu !== false).length,
      hidden: merged.filter((item) => item.showInDigitalMenu === false).length,
      featured: merged.filter((item) => item.featured).length,
      noPhoto: merged.filter((item) => !item.imageUrl).length,
    }),
    [merged],
  );

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter((item) => {
      if (filter === "visible" && item.showInDigitalMenu === false) return false;
      if (filter === "hidden" && item.showInDigitalMenu !== false) return false;
      if (filter === "featured" && !item.featured) return false;
      if (filter === "no-photo" && item.imageUrl) return false;
      if (!q) return true;
      return `${item.name} ${item.sku ?? ""} ${item.category}`.toLowerCase().includes(q);
    });
  }, [merged, filter, query]);

  async function run(itemId: string, label: string, patch: Partial<MenuItem>, action: () => Promise<unknown>) {
    if (busy[itemId]) return;
    setError(null);
    setNotice(null);
    setBusy((current) => ({ ...current, [itemId]: label }));
    const previous = overrides[itemId];
    // Optimistic: UI langsung berubah, dikembalikan bila server menolak.
    setOverrides((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? {}), ...patch } }));
    try {
      await action();
      // Perubahan sudah tersimpan di server; gagal refresh daftar tidak boleh
      // membatalkan tampilan optimistic (override tetap dipakai sampai refresh berikutnya).
      try {
        await onChanged();
        setOverrides((current) => {
          const next = { ...current };
          delete next[itemId];
          return next;
        });
      } catch {
        setNotice("Tersimpan. Daftar belum ter-refresh — tekan Refresh bila perlu.");
      }
    } catch (err) {
      setOverrides((current) => {
        const next = { ...current };
        if (previous) next[itemId] = previous;
        else delete next[itemId];
        return next;
      });
      setError(err instanceof Error ? err.message : "Perubahan gagal disimpan.");
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }
  }

  function toggleVisible(item: MenuItem) {
    const next = item.showInDigitalMenu === false;
    void run(item.id, "visible", { showInDigitalMenu: next }, () =>
      garageApi.patch(`/api/menu/${encodeURIComponent(item.id)}`, { showInDigitalMenu: next }),
    );
  }

  function toggleFeatured(item: MenuItem) {
    const next = !item.featured;
    void run(item.id, "featured", { featured: next }, () =>
      garageApi.patch(`/api/menu/${encodeURIComponent(item.id)}`, { featured: next }),
    );
  }

  function changeStock(item: MenuItem, stock: Stock) {
    if (item.stock === stock) return;
    void run(item.id, "stock", { stock }, () =>
      garageApi.patch(`/api/menu/${encodeURIComponent(item.id)}`, { stock }),
    );
  }

  function pickPhoto(itemId: string) {
    uploadTargetRef.current = itemId;
    fileRef.current?.click();
  }

  function onFileChosen(file: File | undefined) {
    const itemId = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
    if (!file || !itemId) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Format foto harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Ukuran foto maksimal 8 MB.");
      return;
    }
    const name = merged.find((item) => item.id === itemId)?.name ?? "Produk";
    void run(itemId, "photo", {}, async () => {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch(`/api/menu/${encodeURIComponent(itemId)}/image`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Upload foto gagal.");
      setNotice(`Foto ${name} diperbarui.`);
    });
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => onFileChosen(event.target.files?.[0])}
      />

      <div className="flex flex-col gap-3 rounded-md border border-garage-line bg-white/[0.03] p-3 lg:flex-row lg:items-center lg:justify-between">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:gap-5">
          <Stat label="Tampil di QR" value={stats.visible} />
          <Stat label="Disembunyikan" value={stats.hidden} tone={stats.hidden ? "amber" : undefined} />
          <Stat label="Unggulan" value={stats.featured} />
          <Stat label="Tanpa foto" value={stats.noPhoto} tone={stats.noPhoto ? "amber" : undefined} />
        </dl>
        <div className="flex flex-wrap gap-2">
          <a
            href="/order"
            target="_blank"
            rel="noreferrer"
            className="garage-press inline-flex h-9 items-center gap-1.5 rounded-md bg-garage-red px-3 text-xs font-bold text-white hover:bg-garage-red-bright"
          >
            <ExternalLink className="size-3.5" /> Lihat menu digital
          </a>
          <a
            href="/order/qr-print"
            target="_blank"
            rel="noreferrer"
            className="garage-press inline-flex h-9 items-center gap-1.5 rounded-md border border-garage-line bg-white/[0.04] px-3 text-xs font-bold text-white hover:border-white/40"
          >
            <QrCode className="size-3.5" /> Cetak QR meja
          </a>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
              setOrdering((current) => !current);
            }}
            aria-pressed={ordering}
            className={`garage-press inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-bold text-white ${
              ordering ? "border-garage-amber bg-garage-amber/15" : "border-garage-line bg-white/[0.04] hover:border-white/40"
            }`}
          >
            <ArrowUpDown className="size-3.5" /> Atur urutan
          </button>
        </div>
      </div>

      {ordering ? (
        <MenuOrderEditor
          items={merged}
          onCancel={() => setOrdering(false)}
          onSaved={async () => {
            await onChanged();
            setOrdering(false);
            setNotice("Urutan menu tersimpan. Berlaku di menu digital & POS.");
          }}
        />
      ) : (
      <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-garage-dim" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari menu…"
            className="h-9 border-garage-line bg-black/20 pl-8 text-sm"
          />
        </div>
        <div className="garage-scroll-x flex gap-1 rounded-md border border-garage-line bg-white/[0.04] p-1">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              className={`shrink-0 rounded px-3 py-1.5 text-xs font-bold transition ${
                filter === entry.id ? "bg-garage-red text-white" : "text-garage-dim hover:text-white"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-garage-red-bright/50 bg-garage-red-bright/10 px-3 py-2 text-sm text-[#ffb3b3]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-garage-success/40 bg-garage-success/10 px-3 py-2 text-sm text-[#bbf7d0]">
          {notice}
        </p>
      ) : null}

      {visibleItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-garage-line p-6 text-center text-sm text-garage-dim">
          Tidak ada menu yang cocok dengan filter.
        </div>
      ) : (
        <div className="garage-scroll grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1 min-[520px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleItems.map((item) => {
            const hidden = item.showInDigitalMenu === false;
            const working = busy[item.id];
            return (
              <article
                key={item.id}
                className={`flex min-w-0 overflow-hidden rounded-md border bg-garage-bg-2 min-[520px]:flex-col ${
                  hidden ? "border-garage-line opacity-70" : item.featured ? "border-garage-amber/70" : "border-garage-line"
                }`}
              >
                <div className="relative aspect-square w-32 shrink-0 self-start overflow-hidden bg-black/30 min-[520px]:w-full">
                  <MenuPhoto item={item} iconClassName="size-8" />
                  <button
                    type="button"
                    onClick={() => pickPhoto(item.id)}
                    disabled={Boolean(working)}
                    className="garage-press absolute bottom-1.5 right-1.5 inline-flex h-9 items-center gap-1 rounded-md bg-black/75 px-2.5 text-xs font-bold text-white hover:bg-black/90 disabled:opacity-60"
                    aria-label={`${item.imageUrl ? "Ganti" : "Upload"} foto ${item.name}`}
                  >
                    {working === "photo" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Camera className="size-3.5" />
                    )}
                    {item.imageUrl ? "Ganti" : "Foto"}
                  </button>
                  <span className="pointer-events-none absolute left-1.5 right-1.5 top-1.5 flex flex-wrap gap-1">
                    {hidden ? (
                      <span className="rounded-sm bg-black/80 px-1.5 py-0.5 text-[11px] font-bold uppercase text-[#ffd08a]">
                        Disembunyikan
                      </span>
                    ) : null}
                    {!item.imageUrl ? (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-black/80 px-1.5 py-0.5 text-[11px] font-bold uppercase text-garage-dim">
                        <ImageOff className="size-3" /> No foto
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-bold leading-snug text-white">{item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-garage-dim">
                      <span>{item.category}</span>
                      <span className={`font-mono font-bold tabular-nums ${itemHasPromo(item) ? "text-[#ff8a8a]" : "text-white"}`}>
                        {rupiah.format(itemMinPrice(item))}
                      </span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleVisible(item)}
                      disabled={Boolean(working)}
                      aria-pressed={!hidden}
                      className={`garage-press inline-flex h-9 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1 text-[11px] font-bold transition disabled:opacity-60 min-[380px]:text-xs ${
                        hidden
                          ? "border-garage-line bg-white/[0.04] text-garage-dim hover:text-white"
                          : "border-[#d4d4d8]/40 bg-[#d4d4d8]/10 text-white"
                      }`}
                    >
                      {working === "visible" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : hidden ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      {hidden ? "Sembunyi" : "Tampil"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFeatured(item)}
                      disabled={Boolean(working)}
                      aria-pressed={Boolean(item.featured)}
                      className={`garage-press inline-flex h-9 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1 text-[11px] font-bold transition disabled:opacity-60 min-[380px]:text-xs ${
                        item.featured
                          ? "border-garage-amber/70 bg-garage-amber/15 text-[#ffd08a]"
                          : "border-garage-line bg-white/[0.04] text-garage-dim hover:text-white"
                      }`}
                    >
                      {working === "featured" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Star className={`size-3.5 ${item.featured ? "fill-current" : ""}`} />
                      )}
                      Unggulan
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-md border border-garage-line bg-black/20 p-0.5" role="group" aria-label={`Stok ${item.name}`}>
                    {STOCK_OPTIONS.map((option) => {
                      const active = item.stock === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => changeStock(item, option.id)}
                          disabled={Boolean(working)}
                          aria-pressed={active}
                          className={`h-8 min-w-0 truncate rounded px-1 text-[11px] font-bold transition disabled:opacity-60 ${
                            active
                              ? option.id === "sold_out"
                                ? "bg-garage-red-bright text-white"
                                : option.id === "limited"
                                  ? "bg-garage-amber text-black"
                                  : "bg-[#d4d4d8] text-black"
                              : "text-garage-dim hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-garage-dim">{label}</dt>
      <dd className={`font-mono text-lg font-bold tabular-nums ${tone === "amber" ? "text-[#ffd08a]" : "text-white"}`}>
        {value}
      </dd>
    </div>
  );
}
