"use client";

// Portal Mitra — foto produk milik mitra sendiri. Foto tampil di kasir, waiter & menu digital
// (Owner/Manajer juga bisa mengganti dari Garage OS → Kelola Mitra). Dikompres server ke WebP.

import { useState } from "react";
import { Camera, ImageOff, Loader2 } from "lucide-react";

type PhotoProduct = { linkId: string; name: string; category: string; imageUrl: string | null; active: boolean };

export function PartnerProductPhotos({ products, onChanged }: { products: PhotoProduct[]; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function upload(product: PhotoProduct, file: File) {
    setBusy(product.linkId);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch(`/api/partner/products/${encodeURIComponent(product.linkId)}/image`, { method: "POST", body, credentials: "include" });
      const json = (await res.json().catch(() => null)) as { data?: { imageUrl: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Foto gagal diunggah.");
      setMessage({ tone: "ok", text: `Foto ${product.name} diperbarui.` });
      await onChanged();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (products.length === 0) return null;

  return (
    <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4" aria-labelledby="partner-photos-title">
      <h2 id="partner-photos-title" className="text-base font-bold text-white">
        Foto produk
      </h2>
      <p className="text-xs text-[#b8b8bf]">Foto tampil di kasir, waiter & menu digital. JPG/PNG/WebP, maks 8 MB — otomatis dikecilkan.</p>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-[#ff5a66] bg-[#3f1d22] text-[#fecdd3]" : "border-[#22c55e] bg-[#14532d] text-[#bbf7d0]"}`}>
          {message.text}
        </p>
      ) : null}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {products.map((product) => {
          const loading = busy === product.linkId;
          return (
            <li key={product.linkId} className="flex items-center gap-3 rounded-lg border border-[#3a3a42] bg-black/20 p-3">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt={`Foto ${product.name}`} className="size-16 shrink-0 rounded-lg border border-[#3a3a42] object-cover" />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-lg border border-dashed border-[#4a4a52] text-[#b8b8bf]" aria-hidden>
                  <ImageOff className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold text-white">{product.name}</p>
                <p className="text-xs text-[#b8b8bf]">
                  {product.category}
                  {product.active ? "" : " · menunggu persetujuan Garage"}
                </p>
                <label
                  className={`mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10 focus-within:ring-2 focus-within:ring-[#ff5a66] ${busy !== null ? "pointer-events-none opacity-60" : ""}`}
                >
                  {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                  {loading ? "Mengunggah…" : product.imageUrl ? "Ganti foto" : "Unggah foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={busy !== null}
                    aria-label={`Unggah foto ${product.name}`}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(product, file);
                    }}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
