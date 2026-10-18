"use client";

import { useEffect, useState } from "react";
import { Loader2, PartyPopper } from "lucide-react";

import { EventSettingsPanel } from "@/components/garage/events/event-settings-panel";
import type { AdminEvent } from "@/lib/event-service";

// Modul "Undangan Digital" (PRD GC-PRD-EVENT-001): Owner + Manajer.
export function EventsView() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Event gagal dimuat.");
        const list = json.data.events as AdminEvent[];
        setEvents(list);
        setSelectedId((current) => current ?? list.find((event) => event.status !== "archived")?.id ?? list[0]?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Event gagal dimuat.");
      }
    })();
  }, []);

  const selected = events?.find((event) => event.id === selectedId) ?? null;

  function replaceEvent(next: AdminEvent) {
    setEvents((current) => (current ?? []).map((event) => (event.id === next.id ? next : event)));
  }

  return (
    <section className="grid gap-4" data-testid="events-view">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <PartyPopper className="size-6 text-garage-red-bright" aria-hidden />
          <div>
            <h1 className="text-xl font-black uppercase text-garage-fg">Undangan Digital</h1>
            <p className="text-sm text-garage-dim">Konten event, tamu, undangan pribadi, dan RSVP.</p>
          </div>
        </div>
        {events && events.length > 1 ? (
          <select
            aria-label="Pilih event"
            className="h-10 rounded-md border border-garage-line bg-garage-bg-2 px-3 text-base text-garage-fg"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {error ? <p className="rounded-md border border-garage-red/50 p-4 text-garage-red-bright">{error}</p> : null}
      {!events && !error ? (
        <p className="flex items-center gap-2 text-garage-dim">
          <Loader2 className="size-4 animate-spin" /> Memuat event…
        </p>
      ) : null}
      {events && !selected ? <p className="text-garage-dim">Belum ada event.</p> : null}

      {selected ? (
        <div className="rounded-xl border border-garage-line bg-garage-bg-1 p-4 sm:p-5">
          <EventSettingsPanel key={selected.id} event={selected} onChanged={replaceEvent} />
        </div>
      ) : null}
    </section>
  );
}
