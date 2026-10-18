"use client";

import { useEffect, useState } from "react";
import { Loader2, PartyPopper } from "lucide-react";

import { EventActivityPanel } from "@/components/garage/events/event-activity-panel";
import { EventGuestsPanel } from "@/components/garage/events/event-guests-panel";
import { EventImportPanel } from "@/components/garage/events/event-import-panel";
import { EventSettingsPanel } from "@/components/garage/events/event-settings-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminEvent } from "@/lib/event-service";

// Modul "Undangan Digital" (PRD GC-PRD-EVENT-001): Owner + Manajer.
export function EventsView({ canExport }: { canExport: boolean }) {
  const [tab, setTab] = useState("guests");
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
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
            <TabsTrigger value="guests" data-testid="tab-guests">Tamu & Undangan</TabsTrigger>
            <TabsTrigger value="import" data-testid="tab-import">Impor</TabsTrigger>
            <TabsTrigger value="event" data-testid="tab-event">Konten Event</TabsTrigger>
            {canExport ? <TabsTrigger value="log" data-testid="tab-log">Log</TabsTrigger> : null}
          </TabsList>
          <div className="rounded-xl border border-garage-line bg-garage-bg-1 p-4 sm:p-5">
            <TabsContent value="guests">
              {selected.status === "draft" ? (
                <p className="mb-4 rounded-md border border-garage-amber/50 bg-garage-amber/10 p-3 text-sm text-garage-fg">
                  Event masih Draft: link undangan baru bisa dibuka tamu setelah event diterbitkan (tab Konten Event).
                </p>
              ) : null}
              <EventGuestsPanel key={selected.id} event={selected} canExport={canExport} />
            </TabsContent>
            <TabsContent value="import">
              <EventImportPanel eventId={selected.id} onImported={() => setTab("guests")} />
            </TabsContent>
            <TabsContent value="event">
              <EventSettingsPanel key={selected.id} event={selected} onChanged={replaceEvent} />
            </TabsContent>
            {canExport ? (
              <TabsContent value="log">
                <EventActivityPanel eventId={selected.id} />
              </TabsContent>
            ) : null}
          </div>
        </Tabs>
      ) : null}
    </section>
  );
}
