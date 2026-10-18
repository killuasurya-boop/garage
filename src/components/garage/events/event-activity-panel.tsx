"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Activity = { id: string; label: string; actor: string; guestName: string | null; occurredAt: string; action: string };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

// Log aktivitas undangan & RSVP (Owner). Token tidak pernah dicatat.
export function EventActivityPanel({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/activity`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Log gagal dimuat.");
        setItems(json.data.activity);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Log gagal dimuat.");
      }
    })();
  }, [eventId]);

  if (error) return <p className="text-garage-red-bright">{error}</p>;
  if (!items) return <Loader2 className="size-5 animate-spin text-garage-dim" />;
  if (!items.length) return <p className="text-garage-dim">Belum ada aktivitas.</p>;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border border-garage-line" data-testid="event-activity">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="sticky top-0 bg-garage-bg-3 text-xs uppercase text-garage-dim">
          <tr>
            <th className="px-3 py-2">Waktu (WIB)</th>
            <th className="px-3 py-2">Aktivitas</th>
            <th className="px-3 py-2">Tamu</th>
            <th className="px-3 py-2">Oleh</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-garage-line">
              <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-garage-dim">{fmt(item.occurredAt)}</td>
              <td className="px-3 py-1.5 font-semibold text-garage-fg">{item.label}</td>
              <td className="px-3 py-1.5 text-garage-fg">{item.guestName ?? "—"}</td>
              <td className="px-3 py-1.5 text-garage-dim">{item.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
