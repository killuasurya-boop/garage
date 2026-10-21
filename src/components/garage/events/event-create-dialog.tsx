"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminEvent } from "@/lib/event-service";

export function EventCreateDialog({ template, onCreated }: { template: AdminEvent | null; onCreated: (event: AdminEvent) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    const data = new FormData(form);
    try {
      const localIso = (name: string) => new Date(`${data.get(name)}:00+07:00`).toISOString();
      const payload = {
        slug: String(data.get("slug")).trim(), title: String(data.get("title")).trim(),
        tagline: String(data.get("tagline") ?? "").trim() || null,
        startsAt: localIso("startsAt"), endsAt: localIso("endsAt"), timezone: "Asia/Jakarta",
        bannerUrl: String(data.get("bannerUrl") ?? "").trim() || null,
        venueName: String(data.get("venueName")).trim(), address: String(data.get("address")).trim(),
        mapsUrl: String(data.get("mapsUrl")).trim(), contactWhatsapp: String(data.get("contactWhatsapp")).trim(),
        highlights: [], about: null, faq: [], gallery: [], agenda: [], featuredOnHome: false, defaultMaxPax: 2,
      };
      const res = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok || !json.data?.event) throw new Error(json.error?.message ?? "Event gagal dibuat.");
      onCreated(json.data.event);
      toast.success("Draft event berhasil dibuat.");
      setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Event gagal dibuat."); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); setError(""); } }}>
    <DialogTrigger asChild><Button className="min-h-11 cursor-pointer"><Plus className="size-4" /> Buat Event</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Buat draft event</DialogTitle><DialogDescription>Jadwal memakai WIB. Menu dan harga reguler tetap mengikuti master produk.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget); }}>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-title">Nama event</label><Input id="create-event-title" name="title" required minLength={3} maxLength={120} /></div>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-slug">Slug URL</label><Input id="create-event-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="kopdar-garage" /><p className="text-sm text-garage-dim">Huruf kecil, angka, dan tanda hubung.</p></div>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-tagline">Deskripsi singkat</label><Input id="create-event-tagline" name="tagline" maxLength={160} /></div>
        <div className="grid gap-3 sm:grid-cols-2">{["startsAt", "endsAt"].map((field) => <div key={field} className="grid gap-2"><label className="text-sm font-semibold" htmlFor={`create-${field}`}>{field === "startsAt" ? "Mulai (WIB)" : "Berakhir (WIB)"}</label><Input id={`create-${field}`} name={field} type="datetime-local" required /></div>)}</div>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-banner">URL banner (opsional)</label><Input id="create-event-banner" name="bannerUrl" placeholder="/garage-uploads/banner.webp atau https://…" /></div>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-venue">Tempat</label><Input id="create-event-venue" name="venueName" required minLength={2} defaultValue={template?.venueName ?? "Garage Coffee"} /></div>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-address">Alamat</label><Input id="create-event-address" name="address" required minLength={10} defaultValue={template?.address ?? ""} /></div>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-maps">Google Maps</label><Input id="create-event-maps" name="mapsUrl" type="url" required defaultValue={template?.mapsUrl ?? ""} /></div>
        <div className="grid gap-2"><label className="text-sm font-semibold" htmlFor="create-event-wa">WhatsApp</label><Input id="create-event-wa" name="contactWhatsapp" required defaultValue={template?.contactWhatsapp ?? ""} /></div>
        {error && <p role="alert" className="rounded-md border border-garage-red/50 p-3 text-sm text-garage-red-bright">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Draft"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
