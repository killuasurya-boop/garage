"use client";

import { Calculator, CalendarHeart, Eye, HandCoins, Inbox, Mic2, ScanLine, type LucideIcon } from "lucide-react";

// Satu bar "Kontrol Event" di semua layar event (owner 17 Nov 2026: "1 kontrol 1 komando").
// Menu event tersebar di beberapa layar (Event & Undangan di aplikasi utama, Lineup/Sponsor/Keuangan di Control,
// Hari-H di layar HP). Bar ini menautkan semuanya dan membawa event yang sedang dipilih bila layarnya mendukung.

export type EventControlKey = "event" | "lineup" | "pendaftar" | "sponsor" | "keuangan" | "transparansi" | "harih";

type Item = { key: EventControlKey; label: string; purpose: string; icon: LucideIcon; href: (eventId: string | null) => string };

const ITEMS: Item[] = [
  { key: "event", label: "Event & Undangan", purpose: "Buat event, tamu, undangan, menu event", icon: CalendarHeart, href: () => "/os?module=events" },
  {
    key: "lineup",
    label: "Lineup & Panitia",
    purpose: "Talent, rundown, panitia, tugas",
    icon: Mic2,
    href: (id) => (id ? `/control/lineup?eventId=${id}` : "/control/lineup"),
  },
  {
    key: "pendaftar",
    label: "Pendaftar",
    purpose: "Kreator, sponsor, kru dari website",
    icon: Inbox,
    href: (id) => (id ? `/control/registrations?eventId=${id}` : "/control/registrations"),
  },
  { key: "sponsor", label: "Sponsor", purpose: "Sponsor, uang masuk, logo di website", icon: HandCoins, href: () => "/control/sponsors" },
  {
    key: "keuangan",
    label: "Keuangan Event",
    purpose: "Anggaran, biaya, untung/rugi",
    icon: Calculator,
    href: (id) => (id ? `/control/event-finance?eventId=${id}` : "/control/event-finance"),
  },
  {
    key: "transparansi",
    label: "Transparansi",
    purpose: "Angka dana di halaman event",
    icon: Eye,
    href: (id) => (id ? `/control/event-transparency?eventId=${id}` : "/control/event-transparency"),
  },
  {
    key: "harih",
    label: "Hari-H",
    purpose: "Check-in tamu, panggung, kesiapan",
    icon: ScanLine,
    href: (id) => (id ? `/event-day?event=${id}` : "/event-day"),
  },
];

export function EventControlNav({ current, eventId = null, compact = false }: { current: EventControlKey; eventId?: string | null; compact?: boolean }) {
  return (
    <nav aria-label="Kontrol event" className="print:hidden" data-testid="event-control-nav">
      <ul className={`flex gap-2 overflow-x-auto pb-1 ${compact ? "" : "lg:grid lg:grid-cols-5 lg:overflow-visible"}`}>
        {ITEMS.map((item) => {
          const active = item.key === current;
          const Icon = item.icon;
          return (
            <li key={item.key} className="shrink-0">
              <a
                href={item.href(eventId)}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${
                  active
                    ? "border-[color-mix(in_srgb,var(--garage-red)_70%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_18%,transparent)] text-zinc-50"
                    : "border-white/12 bg-white/[0.03] text-zinc-200 hover:border-white/30 hover:bg-white/[0.06]"
                }`}
              >
                <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${active ? "text-[#ff6b75]" : "text-zinc-400"}`} />
                <span className="grid min-w-0">
                  <span className="text-sm font-bold leading-tight">{item.label}</span>
                  {compact ? null : <span className="text-xs leading-snug text-zinc-400">{item.purpose}</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Petunjuk langkah singkat di atas layar: urutan kerja yang sebenarnya (bukan dekorasi). */
export function StepHint({ steps, label }: { steps: string[]; label: string }) {
  return (
    <ol aria-label={label} className="grid gap-1.5 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200 sm:grid-cols-3 print:hidden">
      {steps.map((step, index) => (
        <li key={step} className="min-w-0">
          <b className="text-amber-300">{index + 1}.</b> {step}
        </li>
      ))}
    </ol>
  );
}
