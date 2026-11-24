"use client";

// Portal Mitra — "Produk saya": satu tempat untuk semua produk milik mitra.
// - Produk yang dijual: atur Tersedia/Habis + foto.
// - Produk mandiri (Owner Nov 2026): mitra mengajukan produk baru lewat formulir 3 langkah
//   (Info → Harga → Foto & kirim). Produk NONAKTIF sampai Owner menyetujui; bila dikembalikan,
//   catatan Garage tampil dan mitra bisa memperbaiki lalu mengajukan ulang, atau menarik pengajuan.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  ImageOff,
  Info,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { PhotoGuide, PhotoQualityNotice } from "./partner-photo-guide";
import {
  garageShare,
  MAX_SUBMISSION_VARIANTS,
  PARTNER_CATEGORY_SUGGESTIONS,
  partnerProductView,
  type PartnerProductView,
} from "@/lib/partner-product-submission";

export type PortalProduct = {
  linkId: string;
  code?: string;
  name: string;
  category: string;
  imageUrl: string | null;
  description?: string | null;
  active: boolean;
  available: boolean;
  submissionStatus?: string | null;
  submissionNote?: string | null;
  reviewNote?: string | null;
  variants: Array<{ variantId?: string; label: string; sellPrice: number; unitCost?: number }>;
};

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;
const digits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 8);
const money = (value: string) => (value ? new Intl.NumberFormat("id-ID").format(Number(value)) : "");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? "Permintaan gagal. Coba lagi.");
  return json?.data as T;
}

async function uploadPhoto(linkId: string, file: File) {
  const body = new FormData();
  body.append("image", file);
  const res = await fetch(`/api/partner/products/${encodeURIComponent(linkId)}/image`, { method: "POST", body, credentials: "include" });
  const json = (await res.json().catch(() => null)) as { data?: { imageUrl: string }; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Foto gagal diunggah.");
  return json.data.imageUrl;
}

const VIEW_STYLE: Record<PartnerProductView, { label: string; className: string }> = {
  selling: { label: "Dijual", className: "border-[#22c55e]/60 bg-[#0f2a1a] text-[#bbf7d0]" },
  pending: { label: "Menunggu persetujuan", className: "border-[#f59e0b]/60 bg-[#2a1d0a] text-[#fde68a]" },
  revision: { label: "Perlu perbaikan", className: "border-[#ff5a66]/70 bg-[#3a1015] text-[#ffd0d4]" },
  inactive: { label: "Dinonaktifkan", className: "border-[#4a4a54] bg-white/[0.06] text-[#d4d4d8]" },
  approved: { label: "Disetujui", className: "border-[#22c55e]/60 bg-[#0f2a1a] text-[#bbf7d0]" },
  withdrawn: { label: "Ditarik", className: "border-[#4a4a54] bg-white/[0.06] text-[#d4d4d8]" },
};

type Filter = "all" | "selling" | "review";

export function PartnerProductsPanel({ products, onChanged }: { products: PortalProduct[]; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; product: PortalProduct } | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const withView = useMemo(() => products.map((product) => ({ product, view: partnerProductView({ active: product.active, submissionStatus: product.submissionStatus ?? null }) })), [products]);
  const counts = useMemo(
    () => ({
      selling: withView.filter((p) => p.view === "selling").length,
      pending: withView.filter((p) => p.view === "pending").length,
      revision: withView.filter((p) => p.view === "revision").length,
    }),
    [withView],
  );
  // Perlu perbaikan paling atas (butuh tindakan mitra), lalu menunggu, lalu yang dijual.
  const order: Record<PartnerProductView, number> = { revision: 0, pending: 1, selling: 2, inactive: 3, approved: 2, withdrawn: 4 };
  const shown = withView
    .filter(({ view }) => (filter === "all" ? true : filter === "selling" ? view === "selling" : view === "pending" || view === "revision"))
    .sort((a, b) => order[a.view] - order[b.view]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage({ tone: "ok", text: ok });
      await onChanged();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4" aria-labelledby="partner-products-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="partner-products-title" className="text-base font-bold text-white">
            Produk saya
          </h2>
          <p className="text-sm text-[#c8c8cf]">Atur ketersediaan, foto, dan ajukan produk baru.</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ mode: "create" })}
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg bg-[#d11a2a] px-4 text-sm font-bold text-white shadow-[0_6px_18px_-8px_rgba(209,26,42,0.9)] transition-colors hover:bg-[#e02434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8a94] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17171c] active:translate-y-px motion-reduce:transition-none"
        >
          <PackagePlus className="size-5" aria-hidden /> Tambah produk
        </button>
      </div>

      <HowItWorks collapsed={products.length > 0} />

      {products.length ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Saring produk">
          {(
            [
              ["all", `Semua (${products.length})`],
              ["selling", `Dijual (${counts.selling})`],
              ["review", `Pengajuan (${counts.pending + counts.revision})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`min-h-10 cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-colors motion-reduce:transition-none ${filter === key ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] bg-white/[0.04] text-[#d4d4d8] hover:bg-white/10"}`}
            >
              {label}
            </button>
          ))}
          {counts.revision ? (
            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#ff5a66]/60 bg-[#3a1015] px-3 text-sm font-semibold text-[#ffd0d4]">
              <AlertTriangle className="size-4" aria-hidden /> {counts.revision} perlu diperbaiki
            </span>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-[#ff5a66] bg-[#3f1d22] text-[#fecdd3]" : "border-[#22c55e] bg-[#14532d] text-[#bbf7d0]"}`}>
          {message.text}
        </p>
      ) : null}

      {products.length === 0 ? (
        <div className="mt-4 grid place-items-center gap-2 rounded-xl border border-dashed border-[#4a4a54] bg-black/20 px-4 py-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-[#3a1015] text-[#ff8a94]">
            <PackagePlus className="size-6" aria-hidden />
          </span>
          <p className="font-bold text-white">Belum ada produk</p>
          <p className="max-w-sm text-sm text-[#c8c8cf]">Ajukan produk pertama Anda. Setelah disetujui Garage, produk langsung tampil di kasir, waiter, dan menu digital.</p>
          <button type="button" onClick={() => setForm({ mode: "create" })} className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#ff5a66] px-4 text-sm font-bold text-white hover:bg-[#3a1015]">
            <Plus className="size-4" aria-hidden /> Ajukan produk pertama
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[#3a3a42] p-4 text-center text-sm text-[#c8c8cf]">Tidak ada produk di filter ini.</p>
      ) : (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {shown.map(({ product, view }) => {
            const style = VIEW_STYLE[view];
            const photoBusy = busy === `photo-${product.linkId}`;
            return (
              <li key={product.linkId} className={`flex flex-col gap-3 rounded-xl border bg-[#1d1d23] p-3 ${view === "revision" ? "border-[#ff5a66]/60" : "border-[#3a3a42]"}`}>
                <div className="flex gap-3">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={`Foto ${product.name}`} className="size-[72px] shrink-0 rounded-lg border border-[#3a3a42] object-cover" />
                  ) : (
                    <span className="grid size-[72px] shrink-0 place-items-center rounded-lg border border-dashed border-[#4a4a52] bg-black/20 text-[#b8b8bf]" aria-hidden>
                      <ImageOff className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <p className="min-w-0 break-words font-bold leading-snug text-white">{product.name}</p>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${style.className}`}>{style.label}</span>
                    </div>
                    <p className="text-xs text-[#b8b8bf]">
                      {product.category}
                      {product.code ? ` · ${product.code}` : ""}
                    </p>
                    <ul className="mt-1.5 grid gap-0.5 text-sm">
                      {product.variants.map((variant) => (
                        <li key={variant.variantId ?? variant.label} className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <span className="text-[#d4d4d8]">{variant.label}</span>
                          <span className="tabular-nums">
                            <b className="whitespace-nowrap text-white">{rp(variant.sellPrice)}</b>
                            {variant.unitCost !== undefined ? <span className="whitespace-nowrap text-xs text-[#b8b8bf]"> · setor {rp(variant.unitCost)}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {view === "revision" && product.reviewNote ? (
                  <p className="rounded-lg border border-[#ff5a66]/50 bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
                    <b className="text-white">Catatan Garage:</b> {product.reviewNote}
                  </p>
                ) : null}
                {view === "pending" ? (
                  <p className="flex items-start gap-2 rounded-lg bg-[#2a1d0a]/70 px-3 py-2 text-sm text-[#fde68a]">
                    <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden /> Garage sedang memeriksa. Anda dapat notifikasi saat disetujui. Selama menunggu, data masih bisa diubah.
                  </p>
                ) : null}
                {view === "inactive" ? <p className="text-sm text-[#c8c8cf]">Produk dinonaktifkan Garage. Hubungi Garage bila ingin dijual lagi.</p> : null}

                <div className="mt-auto flex flex-wrap gap-2">
                  {view === "selling" ? (
                    <div className="grid flex-1 grid-cols-2 gap-2" role="group" aria-label={`Ketersediaan ${product.name}`}>
                      {([true, false] as const).map((available) => {
                        const selected = product.available === available;
                        return (
                          <button
                            key={String(available)}
                            type="button"
                            aria-pressed={selected}
                            disabled={busy !== null || selected}
                            onClick={() => void run(`av-${product.linkId}`, () => api(`/api/partner/products/${product.linkId}/availability`, { method: "PATCH", body: JSON.stringify({ available }) }))}
                            className={`min-h-11 cursor-pointer rounded-lg border px-3 text-sm font-bold transition-colors disabled:cursor-default motion-reduce:transition-none ${
                              selected
                                ? available
                                  ? "border-[#22c55e] bg-[#14532d] text-[#bbf7d0]"
                                  : "border-[#ff5a66] bg-[#3f1d22] text-[#fecdd3]"
                                : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10 disabled:opacity-60"
                            }`}
                          >
                            {available ? "Tersedia" : "Habis"}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {view === "pending" || view === "revision" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setForm({ mode: "edit", product })}
                        disabled={busy !== null}
                        className={`inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-60 ${view === "revision" ? "bg-[#d11a2a] text-white hover:bg-[#e02434]" : "border border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
                      >
                        <Pencil className="size-4" aria-hidden /> {view === "revision" ? "Perbaiki & ajukan ulang" : "Ubah pengajuan"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setWithdrawing(withdrawing === product.linkId ? null : product.linkId)}
                        disabled={busy !== null}
                        aria-expanded={withdrawing === product.linkId}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10 disabled:opacity-60"
                      >
                        <Undo2 className="size-4" aria-hidden /> Tarik
                      </button>
                    </>
                  ) : null}
                  <label
                    className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10 focus-within:ring-2 focus-within:ring-[#ff5a66] ${busy !== null ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {photoBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                    {photoBusy ? "Mengunggah…" : product.imageUrl ? "Ganti foto" : "Unggah foto"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={busy !== null}
                      aria-label={`Unggah foto ${product.name}`}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void run(`photo-${product.linkId}`, () => uploadPhoto(product.linkId, file), `Foto ${product.name} diperbarui.`);
                      }}
                    />
                  </label>
                </div>

                {withdrawing === product.linkId ? (
                  <div role="alertdialog" aria-label={`Tarik pengajuan ${product.name}`} className="rounded-lg border border-[#ff5a66]/50 bg-black/30 p-3">
                    <p className="text-sm text-[#f4f4f5]">Tarik pengajuan <b>{product.name}</b>? Produk tidak akan diperiksa Garage dan hilang dari daftar Anda.</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setWithdrawing(null)} className="min-h-11 flex-1 cursor-pointer rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void run(`wd-${product.linkId}`, () => api(`/api/partner/products/${product.linkId}`, { method: "DELETE" }), `Pengajuan ${product.name} ditarik.`).then(() => setWithdrawing(null))
                        }
                        className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#b91c1c] px-3 text-sm font-bold text-white hover:bg-[#d11a2a] disabled:opacity-60"
                      >
                        {busy === `wd-${product.linkId}` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />} Ya, tarik
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-[#b8b8bf]">Tanpa hitung stok — tandai Habis bila tidak bisa dibuat. Berlaku di kasir, waiter & menu digital. Foto JPG/PNG/WebP maks 8 MB.</p>

      {form ? (
        <ProductFormDialog
          key={form.mode === "edit" ? form.product.linkId : "create"}
          product={form.mode === "edit" ? form.product : null}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={async (text) => {
            setMessage({ tone: "ok", text });
            await onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

function HowItWorks({ collapsed }: { collapsed: boolean }) {
  const steps = [
    { title: "Isi data & harga", body: "Nama, harga setor, foto." },
    { title: "Garage memeriksa", body: "Owner menyetujui / minta perbaikan." },
    { title: "Mulai dijual", body: "Tampil di kasir & menu digital." },
  ];
  const list = (
    <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Cara menambah produk">
      {steps.map((step, index) => (
        <li key={step.title} className="rounded-lg border border-[#2e2e35] bg-black/20 p-2.5">
          <span className="grid size-6 place-items-center rounded-full bg-[#3a1015] text-xs font-black text-[#ff8a94]">{index + 1}</span>
          <p className="mt-1.5 text-[13px] font-bold leading-tight text-white">{step.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-[#b8b8bf]">{step.body}</p>
        </li>
      ))}
    </ol>
  );
  if (!collapsed) return list;
  // Sudah punya produk: panduan dilipat agar daftar produk langsung terlihat.
  return (
    <details className="group mt-3 rounded-lg border border-[#2e2e35] bg-black/20 px-3 py-2">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#e4e4e8] [&::-webkit-details-marker]:hidden">
        <Info className="size-4 text-[#ffd08a]" aria-hidden /> Cara menambah produk
        <span className="ml-auto text-xs text-[#b8b8bf] group-open:hidden">Lihat</span>
        <span className="ml-auto hidden text-xs text-[#b8b8bf] group-open:inline">Tutup</span>
      </summary>
      <div className="pb-1">{list}</div>
    </details>
  );
}

// ─── Formulir tambah / perbaiki produk (3 langkah) ───────────────────────────

type VariantDraft = { key: string; label: string; cost: string; sell: string };
type Draft = { name: string; category: string; description: string; note: string; multi: boolean; variants: VariantDraft[] };
type Errors = Partial<Record<string, string>>;

const STEPS = ["Info produk", "Harga", "Foto & kirim"] as const;
let variantSeq = 0;
const newVariant = (label = "", cost = "", sell = ""): VariantDraft => ({ key: `v${++variantSeq}`, label, cost, sell });

function draftFrom(product: PortalProduct | null): Draft {
  if (!product) return { name: "", category: "", description: "", note: "", multi: false, variants: [newVariant()] };
  const variants = product.variants.map((v) => newVariant(v.label, v.unitCost ? String(v.unitCost) : "", String(v.sellPrice)));
  return {
    name: product.name,
    category: product.category,
    description: product.description ?? "",
    note: product.submissionNote ?? "",
    multi: variants.length > 1 || (variants[0]?.label ?? "Regular") !== "Regular",
    variants: variants.length ? variants : [newVariant()],
  };
}

function stepErrors(step: number, draft: Draft): Errors {
  const errors: Errors = {};
  if (step === 0) {
    if (draft.name.trim().length < 2) errors.name = "Isi nama produk (minimal 2 huruf).";
    if (draft.category.trim().length < 2) errors.category = "Pilih salah satu kategori atau ketik sendiri.";
  }
  if (step === 1) {
    const seen = new Set<string>();
    // Validasi hanya varian yang tampil & dikirim (mode "Satu harga saja" = varian pertama saja).
    (draft.multi ? draft.variants : draft.variants.slice(0, 1)).forEach((v) => {
      const label = v.label.trim();
      if (draft.multi && !label) errors[`${v.key}.label`] = "Isi nama varian, mis. Kecil / Isi 4.";
      if (draft.multi && label && seen.has(label.toLowerCase())) errors[`${v.key}.label`] = "Nama varian dobel.";
      seen.add(label.toLowerCase());
      if (!Number(v.cost)) errors[`${v.key}.cost`] = "Isi harga setor.";
      if (!Number(v.sell)) errors[`${v.key}.sell`] = "Isi harga jual.";
      else if (Number(v.cost) && Number(v.sell) < Number(v.cost)) errors[`${v.key}.sell`] = "Harga jual tidak boleh di bawah harga setor.";
    });
  }
  return errors;
}

function ProductFormDialog({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: PortalProduct | null;
  categories: string[];
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(product));
  const [errors, setErrors] = useState<Errors>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ photoError: string | null } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const editing = Boolean(product);
  const categoryChoices = useMemo(() => [...new Set([...categories, ...PARTNER_CATEGORY_SUGGESTIONS])].slice(0, 10), [categories]);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    // Pratinjau lokal foto terpilih (dibersihkan saat diganti/ditutup).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    // Langkah berganti → kembali ke atas & fokus ke isian pertama (keyboard / pembaca layar).
    bodyRef.current?.scrollTo({ top: 0 });
    bodyRef.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  }, [step]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setVariant = (key: string, patch: Partial<VariantDraft>) => setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));

  function next() {
    const found = stepErrors(step, draft);
    setErrors(found);
    if (Object.keys(found).length) {
      bodyRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    for (const s of [0, 1]) {
      const found = stepErrors(s, draft);
      if (Object.keys(found).length) {
        setErrors(found);
        setStep(s);
        return;
      }
    }
    setSaving(true);
    setServerError(null);
    const payload = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      description: draft.description.trim() || null,
      note: draft.note.trim() || null,
      variants: (draft.multi ? draft.variants : draft.variants.slice(0, 1)).map((v) => ({ label: draft.multi ? v.label.trim() : "Regular", unitCost: Number(v.cost), sellPrice: Number(v.sell) })),
    };
    try {
      const saved = product
        ? await api<{ linkId: string }>(`/api/partner/products/${product.linkId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<{ linkId: string }>("/api/partner/products", { method: "POST", body: JSON.stringify(payload) });
      let photoError: string | null = null;
      if (photo) {
        try {
          await uploadPhoto(saved.linkId, photo);
        } catch (error) {
          photoError = (error as Error).message;
        }
      }
      setDone({ photoError });
      await onSaved(product ? `Pengajuan ${payload.name} dikirim ulang ke Garage.` : `${payload.name} dikirim ke Garage untuk diperiksa.`);
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const variants = draft.multi ? draft.variants : draft.variants.slice(0, 1);
  const inputClass = (invalid?: boolean) =>
    `mt-1.5 min-h-12 w-full rounded-lg border bg-[#0f0f12] px-3 text-base text-white placeholder:text-[#8a8a94] focus:outline-none focus:ring-2 focus:ring-[#ff5a66] ${invalid ? "border-[#ff5a66]" : "border-[#3a3a42]"}`;

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogPortal>
        <DialogOverlay className="bg-black/75 supports-backdrop-filter:backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-labelledby={titleId}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col bg-[#141418] text-[#f4f4f5] outline-none duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 motion-reduce:animate-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[90dvh] sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-[#34343c] sm:shadow-2xl"
        >
          <header className="border-b border-[#2a2a30] px-4 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff5a66]">{editing ? "Perbaiki pengajuan" : "Produk baru"}</p>
                <DialogPrimitive.Title id={titleId} className="mt-0.5 text-lg font-black text-white">
                  {done ? "Pengajuan terkirim" : editing ? `Ubah ${product?.name}` : "Tambah produk"}
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close
                disabled={saving}
                aria-label="Tutup formulir"
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10 disabled:opacity-50"
              >
                <X className="size-5" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            {!done ? (
              <div className="mt-3">
                <p className="text-sm text-[#d4d4d8]" aria-live="polite">
                  Langkah {step + 1} dari {STEPS.length} · <b className="text-white">{STEPS[step]}</b>
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden>
                  {STEPS.map((label, index) => (
                    <span key={label} className={`h-1.5 rounded-full transition-colors motion-reduce:transition-none ${index <= step ? "bg-[#ff5a66]" : "bg-[#2e2e35]"}`} />
                  ))}
                </div>
              </div>
            ) : null}
          </header>

          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {done ? (
              <div className="grid place-items-center gap-3 py-6 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-[#0f2a1a] text-[#86efac]">
                  <CheckCircle2 className="size-8" aria-hidden />
                </span>
                <p className="text-lg font-black text-white">{draft.name.trim()}</p>
                <p className="max-w-sm text-sm text-[#d4d4d8]">Garage akan memeriksa produk ini. Anda mendapat notifikasi saat disetujui atau bila ada yang perlu diperbaiki.</p>
                {done.photoError ? (
                  <p role="alert" className="max-w-sm rounded-lg border border-[#f59e0b]/60 bg-[#2a1d0a] px-3 py-2 text-sm text-[#fde68a]">
                    Produk terkirim, tetapi foto gagal diunggah ({done.photoError}). Unggah lagi dari daftar produk.
                  </p>
                ) : null}
              </div>
            ) : step === 0 ? (
              <div className="grid gap-4">
                <label className="block">
                  <span className="text-sm font-bold text-white">Nama produk</span>
                  <input
                    value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    maxLength={120}
                    autoComplete="off"
                    placeholder="Contoh: Dimsum Ayam Udang"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "pf-name-err" : undefined}
                    className={inputClass(Boolean(errors.name))}
                  />
                  {errors.name ? <FieldError id="pf-name-err">{errors.name}</FieldError> : null}
                </label>

                <fieldset>
                  <legend className="text-sm font-bold text-white">Kategori</legend>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {categoryChoices.map((category) => {
                      const selected = draft.category.trim().toLowerCase() === category.toLowerCase();
                      return (
                        <button
                          key={category}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => set({ category })}
                          className={`min-h-10 cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-colors motion-reduce:transition-none ${selected ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] bg-white/[0.04] text-[#d4d4d8] hover:bg-white/10"}`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                  <label className="mt-2 block">
                    <span className="text-xs text-[#c8c8cf]">atau ketik kategori sendiri</span>
                    <input
                      value={draft.category}
                      onChange={(e) => set({ category: e.target.value })}
                      maxLength={60}
                      placeholder="Contoh: Dimsum"
                      aria-invalid={Boolean(errors.category)}
                      aria-describedby={errors.category ? "pf-cat-err" : undefined}
                      className={inputClass(Boolean(errors.category))}
                    />
                  </label>
                  {errors.category ? <FieldError id="pf-cat-err">{errors.category}</FieldError> : null}
                </fieldset>

                <label className="block">
                  <span className="flex items-baseline justify-between gap-2 text-sm font-bold text-white">
                    Deskripsi <span className="text-xs font-normal text-[#b8b8bf]">opsional · {draft.description.length}/500</span>
                  </span>
                  <textarea
                    value={draft.description}
                    onChange={(e) => set({ description: e.target.value.slice(0, 500) })}
                    rows={3}
                    placeholder="Rasa, isi, ukuran porsi. Contoh: 4 pcs dimsum ayam udang kukus, saus sambal terpisah."
                    className={`${inputClass()} min-h-24 py-2.5 leading-relaxed`}
                  />
                  <span className="mt-1 block text-xs text-[#b8b8bf]">Deskripsi yang jelas (min. 15 huruf) + foto membuat produk bisa dipromosikan di website Garage.</span>
                </label>
              </div>
            ) : step === 1 ? (
              <div className="grid gap-4">
                <div className="flex gap-2.5 rounded-lg border border-[#3a3a42] bg-white/[0.04] p-3 text-sm text-[#e4e4e8]">
                  <Info className="mt-0.5 size-4 shrink-0 text-[#ffd08a]" aria-hidden />
                  <p>
                    <b className="text-white">Harga setor</b> = uang yang Anda terima per porsi. <b className="text-white">Harga jual</b> = harga di menu Garage. Harga jual adalah usulan; Owner yang menetapkan saat menyetujui.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jumlah ukuran/varian">
                  {([false, true] as const).map((multi) => (
                    <button
                      key={String(multi)}
                      type="button"
                      role="radio"
                      aria-checked={draft.multi === multi}
                      onClick={() => set({ multi, variants: multi && draft.variants.length === 1 && !draft.variants[0].label.trim() ? [{ ...draft.variants[0], label: "" }, newVariant()] : draft.variants })}
                      className={`min-h-12 cursor-pointer rounded-lg border px-3 text-sm font-bold transition-colors motion-reduce:transition-none ${draft.multi === multi ? "border-[#ff5a66] bg-[#3a1015] text-white" : "border-[#3a3a42] text-[#d4d4d8] hover:bg-white/10"}`}
                    >
                      {multi ? "Ada beberapa ukuran/isi" : "Satu harga saja"}
                    </button>
                  ))}
                </div>

                <ul className="grid gap-3">
                  {variants.map((variant, index) => {
                    const cost = Number(variant.cost) || 0;
                    const sell = Number(variant.sell) || 0;
                    const share = garageShare({ unitCost: cost, sellPrice: sell });
                    return (
                      <li key={variant.key} className="rounded-xl border border-[#3a3a42] bg-[#1d1d23] p-3">
                        {draft.multi ? (
                          <div className="flex items-end gap-2">
                            <label className="block min-w-0 flex-1">
                              <span className="text-sm font-bold text-white">Varian {index + 1}</span>
                              <input
                                value={variant.label}
                                onChange={(e) => setVariant(variant.key, { label: e.target.value })}
                                maxLength={60}
                                placeholder={index === 0 ? "Contoh: Isi 4" : "Contoh: Isi 8"}
                                aria-invalid={Boolean(errors[`${variant.key}.label`])}
                                className={inputClass(Boolean(errors[`${variant.key}.label`]))}
                              />
                            </label>
                            {variants.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => set({ variants: draft.variants.filter((v) => v.key !== variant.key) })}
                                aria-label={`Hapus varian ${index + 1}`}
                                className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#3a3a42] text-[#fecdd3] hover:bg-[#3a1015]"
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {errors[`${variant.key}.label`] ? <FieldError>{errors[`${variant.key}.label`]}</FieldError> : null}
                        <div className={`grid grid-cols-2 gap-2 ${draft.multi ? "mt-3" : ""}`}>
                          <MoneyField label="Harga setor" hint="Anda terima" value={variant.cost} error={errors[`${variant.key}.cost`]} onChange={(cost) => setVariant(variant.key, { cost })} />
                          <MoneyField label="Harga jual" hint="Usulan di menu" value={variant.sell} error={errors[`${variant.key}.sell`]} onChange={(sell) => setVariant(variant.key, { sell })} />
                        </div>
                        {cost > 0 && sell >= cost ? (
                          <p className="mt-2 text-xs text-[#c8c8cf]">
                            Bagian Garage <b className="whitespace-nowrap tabular-nums text-[#ffd08a]">{rp(share)}</b> per porsi · Anda terima <b className="whitespace-nowrap tabular-nums text-white">{rp(cost)}</b>
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {draft.multi && draft.variants.length < MAX_SUBMISSION_VARIANTS ? (
                  <button
                    type="button"
                    onClick={() => set({ variants: [...draft.variants, newVariant()] })}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#4a4a54] text-sm font-semibold text-[#e4e4e8] hover:bg-white/5"
                  >
                    <Plus className="size-4" aria-hidden /> Tambah varian ({draft.variants.length}/{MAX_SUBMISSION_VARIANTS})
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4">
                <div>
                  <p className="text-sm font-bold text-white">
                    Foto produk <span className="text-xs font-normal text-[#b8b8bf]">opsional · bisa menyusul</span>
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    {preview || product?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview ?? product?.imageUrl ?? ""} alt="Pratinjau foto produk" className="size-24 shrink-0 rounded-xl border border-[#3a3a42] object-cover" />
                    ) : (
                      <span className="grid size-24 shrink-0 place-items-center rounded-xl border border-dashed border-[#4a4a52] bg-black/20 text-[#b8b8bf]" aria-hidden>
                        <Camera className="size-6" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10 focus-within:ring-2 focus-within:ring-[#ff5a66]">
                        <Camera className="size-4" aria-hidden /> {preview || product?.imageUrl ? "Ganti foto" : "Pilih foto"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          aria-label="Pilih foto produk"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) setPhoto(file);
                          }}
                        />
                      </label>
                      <p className="mt-1 text-xs text-[#b8b8bf]">Foto kotak, terang, produk di tengah. JPG/PNG/WebP maks 8 MB.</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <PhotoQualityNotice previewUrl={preview} />
                    <PhotoGuide compact={Boolean(preview || product?.imageUrl)} />
                  </div>
                </div>

                <label className="block">
                  <span className="flex items-baseline justify-between gap-2 text-sm font-bold text-white">
                    Catatan untuk Garage <span className="text-xs font-normal text-[#b8b8bf]">opsional</span>
                  </span>
                  <textarea
                    value={draft.note}
                    onChange={(e) => set({ note: e.target.value.slice(0, 300) })}
                    rows={2}
                    placeholder="Contoh: bisa disiapkan 10 menit, maksimal 30 porsi per malam."
                    className={`${inputClass()} min-h-20 py-2.5 leading-relaxed`}
                  />
                </label>

                <section aria-label="Ringkasan pengajuan" className="rounded-xl border border-[#3a3a42] bg-[#1d1d23] p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b8b8bf]">Periksa sebelum kirim</p>
                  <dl className="mt-2 grid gap-1.5 text-sm">
                    <SummaryRow label="Nama" value={draft.name.trim()} onEdit={() => setStep(0)} />
                    <SummaryRow label="Kategori" value={draft.category.trim()} onEdit={() => setStep(0)} />
                    {variants.map((v) => (
                      <SummaryRow
                        key={v.key}
                        label={draft.multi ? v.label.trim() || "Varian" : "Harga"}
                        value={`Jual ${rp(Number(v.sell) || 0)} · setor ${rp(Number(v.cost) || 0)}`}
                        onEdit={() => setStep(1)}
                      />
                    ))}
                  </dl>
                </section>
                {serverError ? <FieldError role="alert">{serverError}</FieldError> : null}
              </div>
            )}
          </div>

          <footer className="flex gap-2 border-t border-[#2a2a30] bg-[#111114] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl">
            {done ? (
              <button type="button" onClick={onClose} className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-lg bg-[#d11a2a] px-4 text-sm font-bold text-white hover:bg-[#e02434]">
                Selesai
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
                  disabled={saving}
                  className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#3a3a42] px-4 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10 disabled:opacity-50"
                >
                  {step === 0 ? "Batal" : (
                    <>
                      <ArrowLeft className="size-4" aria-hidden /> Kembali
                    </>
                  )}
                </button>
                {step < STEPS.length - 1 ? (
                  <button type="button" onClick={next} className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#d11a2a] px-4 text-sm font-bold text-white hover:bg-[#e02434]">
                    Lanjut <ArrowRight className="size-4" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={saving}
                    className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#d11a2a] px-4 text-sm font-bold text-white hover:bg-[#e02434] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                    {saving ? "Mengirim…" : editing ? "Kirim ulang ke Garage" : "Kirim ke Garage"}
                  </button>
                )}
              </>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function MoneyField({ label, hint, value, error, onChange }: { label: string; hint: string; value: string; error?: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-bold text-white">
        {label}
      </label>
      <span className="block text-xs text-[#b8b8bf]">{hint}</span>
      <div className={`mt-1.5 flex min-h-12 items-center rounded-lg border bg-[#0f0f12] focus-within:ring-2 focus-within:ring-[#ff5a66] ${error ? "border-[#ff5a66]" : "border-[#3a3a42]"}`}>
        <span className="pl-3 text-sm font-semibold text-[#b8b8bf]" aria-hidden>
          Rp
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={money(value)}
          onChange={(e) => onChange(digits(e.target.value))}
          placeholder="0"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          className="w-full min-w-0 bg-transparent px-2 text-base font-bold tabular-nums text-white placeholder:text-[#6b6b74] focus:outline-none"
        />
      </div>
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
    </div>
  );
}

function FieldError({ children, id, role }: { children: React.ReactNode; id?: string; role?: "alert" }) {
  return (
    <p id={id} role={role} className="mt-1.5 flex items-start gap-1.5 text-sm text-[#ffb4bb]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {children}
    </p>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="shrink-0 text-[#b8b8bf]">{label}</dt>
      <dd className="flex min-w-0 items-start gap-2 text-right">
        <span className="min-w-0 break-words font-semibold text-white">{value || "—"}</span>
        <button type="button" onClick={onEdit} className="shrink-0 cursor-pointer text-xs font-semibold text-[#ff8a94] underline-offset-2 hover:underline" aria-label={`Ubah ${label}`}>
          Ubah
        </button>
      </dd>
    </div>
  );
}
