/* eslint-disable @next/next/no-img-element -- logo unggahan di /garage-uploads (webp kecil), bukan aset Next. */
"use client";

import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";

// Unggah/hapus logo (penampil lineup, sponsor event). Server mengompres ke webp ≤200 KB.
// Logo tampil dengan object-contain di plat gelap, sama seperti kartu website.

async function send(path: string, method: "POST" | "DELETE", file?: File) {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (file) {
    const body = new FormData();
    body.set("image", file);
    init.body = body;
  }
  const res = await fetch(path, init);
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok || json?.error) throw new Error(json?.error?.message ?? "Logo gagal disimpan.");
}

export function LogoUpload({
  endpoint,
  logoUrl,
  label,
  onChanged,
}: {
  endpoint: string;
  logoUrl: string | null;
  label: string;
  onChanged: () => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (method: "POST" | "DELETE", file?: File) => {
    setBusy(true);
    setError(null);
    try {
      await send(endpoint, method, file);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Logo gagal disimpan.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-black">
        {logoUrl ? <img src={logoUrl} alt={`Logo ${label}`} className="size-full object-contain p-1" /> : <span className="px-1 text-center text-xs text-zinc-400">Belum ada logo</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-sm font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-60"
          >
            <ImageUp size={15} /> {busy ? "Menyimpan…" : logoUrl ? "Ganti logo" : "Unggah logo"}
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act("DELETE")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-60"
            >
              <Trash2 size={15} /> Hapus
            </button>
          ) : null}
        </div>
        <p className="text-xs text-zinc-400">JPG/PNG/WebP, maks 8 MB. PNG transparan paling rapi.</p>
        {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={`Pilih logo ${label}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void act("POST", file);
        }}
      />
    </div>
  );
}
