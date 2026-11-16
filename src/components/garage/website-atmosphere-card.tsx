"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteAsset } from "@/lib/garage-api-types";

// Foto suasana outlet asli untuk section "Suasana" di homepage (owner 16 Nov 2026).
// Pakai endpoint upload hero yang sama dengan field `slot` (suasana_1..4); kosong = section tidak tampil.
const SLOTS = ["suasana_1", "suasana_2", "suasana_3", "suasana_4"] as const;
type Slot = (typeof SLOTS)[number];

type ApiPayload<T> = { data?: T; error?: { message?: string } };

export function WebsiteAtmosphereCard({ canManage }: { canManage: boolean }) {
  const [assets, setAssets] = useState<Partial<Record<Slot, SiteAsset>>>({});
  const [busySlot, setBusySlot] = useState<Slot | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const inputs = useRef<Partial<Record<Slot, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/site/landing-hero?slot=suasana", { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload<SiteAsset[]>;
      const next: Partial<Record<Slot, SiteAsset>> = {};
      for (const asset of payload.data ?? []) {
        if ((SLOTS as readonly string[]).includes(asset.slot)) next[asset.slot as Slot] = asset;
      }
      setAssets(next);
    } catch {
      setMessage({ tone: "error", text: "Foto suasana gagal dimuat." });
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function upload(slot: Slot, file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessage({ tone: "error", text: "Ukuran gambar maksimal 8 MB." });
      return;
    }
    const body = new FormData();
    body.append("image", file);
    body.append("slot", slot);
    body.append("alt", "Suasana Garage Coffee Tebing Tinggi");
    setBusySlot(slot);
    setMessage(null);
    try {
      const response = await fetch("/api/site/landing-hero", { method: "POST", body, credentials: "same-origin" });
      const payload = (await response.json()) as ApiPayload<SiteAsset>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Upload foto gagal.");
      setAssets((prev) => ({ ...prev, [slot]: payload.data }));
      setMessage({ tone: "ok", text: "Foto suasana tersimpan dan tampil di homepage." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Upload foto gagal." });
    } finally {
      setBusySlot(null);
      const input = inputs.current[slot];
      if (input) input.value = "";
    }
  }

  async function remove(slot: Slot) {
    setBusySlot(slot);
    setMessage(null);
    try {
      const response = await fetch(`/api/site/landing-hero?slot=${slot}`, { method: "DELETE", credentials: "same-origin" });
      const payload = (await response.json()) as ApiPayload<unknown>;
      if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "Hapus foto gagal.");
      setAssets((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      setMessage({ tone: "ok", text: "Foto dihapus dari homepage." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Hapus foto gagal." });
    } finally {
      setBusySlot(null);
    }
  }

  const filled = SLOTS.filter((slot) => assets[slot]).length;

  return (
    <Card className="garage-panel garage-animate-in">
      <CardHeader>
        <CardTitle>Foto suasana outlet</CardTitle>
        <CardDescription>
          Maks 4 foto asli: interior, bar, area duduk, malam hari. Tampil di section &quot;Suasana&quot; homepage
          ({filled}/4 terisi). Tanpa foto, section tidak ditampilkan. Jangan pakai foto produk atau gambar dengan teks/harga.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SLOTS.map((slot, idx) => {
            const asset = assets[slot];
            const busy = busySlot === slot;
            return (
              <div key={slot} className="rounded-lg border border-white/12 bg-black/30 p-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-white/5">
                  {asset ? (
                    // eslint-disable-next-line @next/next/no-img-element -- pratinjau upload lokal
                    <img src={asset.publicUrl} alt={`Foto suasana ${idx + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-sm text-zinc-300">Foto {idx + 1} kosong</span>
                  )}
                </div>
                {canManage ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      ref={(el) => {
                        inputs.current[slot] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      id={`atmosphere-${slot}`}
                      onChange={(event) => void upload(slot, event.target.files?.[0])}
                    />
                    <Button asChild size="sm" variant="secondary" className="flex-1" disabled={busy}>
                      <label htmlFor={`atmosphere-${slot}`} className="cursor-pointer">
                        <ImagePlus className="size-4" aria-hidden />
                        {busy ? "Memproses…" : asset ? "Ganti" : "Upload"}
                      </label>
                    </Button>
                    {asset ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void remove(slot)}
                        aria-label={`Hapus foto suasana ${idx + 1}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {message ? (
          <p role="status" className={message.tone === "ok" ? "text-sm text-amber-200" : "text-sm text-red-300"}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
