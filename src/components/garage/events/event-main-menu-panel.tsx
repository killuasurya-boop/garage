"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Loader2, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AdminEvent } from "@/lib/event-service";

export function EventMainMenuPanel({ event }: { event: AdminEvent }) {
  const [selection, setSelection] = useState<{ eventId: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/events/main-menu", { cache: "no-store", signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json.data) throw new Error(json.error?.message ?? "Pengaturan gagal dimuat.");
        if (!controller.signal.aborted) { setSelection(json.data); setError(""); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Pengaturan gagal dimuat."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [event.id, revision]);
  const selected = selection?.eventId === event.id;
  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/events/main-menu", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: selected ? null : event.id }) });
      const json = await response.json();
      if (!response.ok || !json.data) throw new Error(json.error?.message ?? "Pengaturan gagal disimpan.");
      setSelection(json.data);
      toast.success(selected ? "Event dilepas dari menu utama." : "Event dipilih untuk menu utama.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Pengaturan gagal disimpan."); }
    finally { setSaving(false); }
  }
  return <section className="rounded-lg border border-garage-line bg-garage-bg-2 p-4 sm:p-5" aria-label="Penempatan event di menu digital utama">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3"><MonitorSmartphone className="mt-1 size-5 shrink-0 text-garage-amber" aria-hidden /><div><h2 className="text-base font-bold text-garage-fg">Tampilkan di menu digital utama</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-garage-dim">Paket muncul paling atas di /order saat jadwal event aktif. Menu satuan tetap mengikuti tombol tampil/sembunyi di Produk.</p><p className="mt-2 text-sm font-semibold text-garage-fg">{loading ? "Memuat pengaturan…" : selected ? "Event ini dipilih untuk /order" : selection?.eventId ? "Event lain sedang dipilih untuk /order" : "Menu utama belum memakai event"}</p></div></div>
      <div className="flex shrink-0 flex-wrap gap-2"><Button variant={selected ? "outline" : "default"} className="min-h-11" disabled={loading || saving || !selection || (!selected && event.status !== "published")} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : selected ? <Check className="size-4" aria-hidden /> : null}{selected ? "Lepas dari menu utama" : selection?.eventId ? "Ganti dengan event ini" : "Gunakan event ini"}</Button><Button asChild variant="outline" className="min-h-11"><a href="/order" target="_blank" rel="noreferrer">Buka menu utama <ArrowUpRight className="size-4" aria-hidden /></a></Button></div>
    </div>
    {event.status !== "published" && <p className="mt-3 text-sm text-garage-amber">Terbitkan event melalui tab Konten Event sebelum memilihnya untuk menu utama.</p>}
    {selected && <p className="mt-3 text-sm leading-relaxed text-garage-dim">Hanya satu event per outlet yang dipilih. Sebelum mulai atau setelah berakhir, /order kembali menampilkan menu reguler.</p>}
    {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-garage-red-bright"><p>{error}</p><Button variant="outline" className="min-h-11" disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Muat ulang pengaturan</Button></div>}
  </section>;
}
