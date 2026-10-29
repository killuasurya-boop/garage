"use client";

// Chip navbar Owner AI Connect (blueprint V3 §3.2): ringkasan jujur, klik → /control/ai-connect.
// Ringan: muat tiap 60 dtk saat tab terlihat; disembunyikan bila bukan Owner / gagal dimuat.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

import type { AiStatus } from "@/lib/owner-ai-status";

const CHIP_CLASS: Record<AiStatus["chip"]["state"], string> = {
  AI_VERIFIED: "border-[color-mix(in_srgb,var(--gos-status-success)_45%,transparent)] text-[var(--gos-status-success)]",
  AI_STANDBY: "border-[color-mix(in_srgb,var(--gos-status-warning)_45%,transparent)] text-[var(--gos-status-warning)]",
  AI_RUNNING: "border-[color-mix(in_srgb,var(--gos-status-info)_45%,transparent)] text-[var(--gos-status-info)]",
  AI_ERROR: "border-[color-mix(in_srgb,var(--gos-status-danger)_50%,transparent)] text-[var(--gos-status-danger)]",
  AI_NOT_SETUP: "border-white/15 text-[var(--gos-status-neutral)]",
};

export function AiStatusChip() {
  const [chip, setChip] = useState<AiStatus["chip"] | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/owner-ai/status", { cache: "no-store", signal: controller.signal });
        if (!res.ok) return setChip(null);
        const json = (await res.json()) as { data?: { status?: AiStatus } };
        setChip(json.data?.status?.chip ?? null);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setChip(null);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", load);
      controller?.abort();
    };
  }, []);

  if (!chip) return null;
  return (
    <Link
      href="/control/ai-connect"
      title="AI Connect — status koneksi ChatGPT"
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-[var(--garage-bg-2)] px-2.5 py-1.5 text-[11px] font-semibold uppercase hover:bg-[var(--garage-bg-3)] ${CHIP_CLASS[chip.state]}`}
    >
      <Bot className={`h-3.5 w-3.5 ${chip.state === "AI_RUNNING" ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" />
      <span className="whitespace-nowrap">{chip.label}</span>
    </Link>
  );
}
