"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type CategoryTab = { id: string; label: string };

// Jarak dari atas viewport tempat judul seksi dianggap "aktif" (tinggi bar sticky + napas).
const SPY_OFFSET = 132;

function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

// Bar sticky: pencarian + tab kategori. Tab = anchor ke seksi di halaman yang sama;
// tab aktif mengikuti posisi scroll (scroll-spy). Saat mencari, tab disembunyikan.
export function CategoryNav({
  query,
  onQueryChange,
  tabs,
  resultCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  tabs: CategoryTab[];
  resultCount: number;
}) {
  const [activeId, setActiveId] = useState<string | null>(tabs[0]?.id ?? null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const lockRef = useRef(false);
  const unlockTimerRef = useRef<number | null>(null);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (searching || !tabs.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (lockRef.current) return;
      let current = tabs[0].id;
      for (const tab of tabs) {
        const el = document.getElementById(tab.id);
        if (el && el.getBoundingClientRect().top - SPY_OFFSET <= 1) current = tab.id;
      }
      // Sudah mentok bawah halaman → kategori terakhir aktif.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = tabs[tabs.length - 1].id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [searching, tabs]);

  // Tab aktif selalu terlihat di strip horizontal.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activeId) return;
    const button = strip.querySelector<HTMLElement>(`[data-tab="${activeId}"]`);
    if (!button) return;
    strip.scrollTo({ left: Math.max(0, button.offsetLeft - 16), behavior: scrollBehavior() });
  }, [activeId]);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    // Kunci scroll-spy selama smooth scroll agar tab yang diklik tidak "melompat".
    lockRef.current = true;
    if (unlockTimerRef.current) window.clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = window.setTimeout(() => {
      lockRef.current = false;
    }, 800);
    el.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-garage-line bg-garage-bg-0/95 px-4 pb-2 pt-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-b-lg lg:px-0">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-garage-mute"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-11 w-full rounded-md border border-garage-line bg-garage-bg-2 pl-10 pr-11 text-base text-white outline-none transition-colors placeholder:text-garage-mute focus:border-garage-amber [&::-webkit-search-cancel-button]:hidden"
          placeholder="Cari kopi, nasi, cemilan..."
          aria-label="Cari menu"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-garage-dim hover:text-white"
            aria-label="Hapus pencarian"
            onClick={() => onQueryChange("")}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {searching ? (
        <p className="mt-2 flex h-9 items-center text-sm text-garage-dim" aria-live="polite">
          <span className="font-mono font-bold tabular-nums text-white">{resultCount}</span>
          &nbsp;hasil untuk &ldquo;{query.trim()}&rdquo;
        </p>
      ) : (
        <nav
          ref={stripRef}
          aria-label="Kategori menu"
          className="garage-scroll-x -mx-1 mt-2 flex gap-1 px-1"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <button
                key={tab.id}
                type="button"
                data-tab={tab.id}
                aria-current={active ? "true" : undefined}
                onClick={() => jumpTo(tab.id)}
                className={`relative h-11 shrink-0 cursor-pointer px-3 text-sm font-bold transition-colors ${
                  active ? "text-white" : "text-garage-dim hover:text-white"
                }`}
              >
                {tab.label}
                <span
                  className={`absolute inset-x-3 bottom-0 h-[3px] rounded-t-sm transition-colors ${
                    active ? "bg-garage-red" : "bg-transparent"
                  }`}
                  aria-hidden
                />
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
