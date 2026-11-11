"use client";

import { Loader2 } from "lucide-react";

export const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;
export const timeWib = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const dateWib = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
export const todayKey = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? "Permintaan gagal.");
  return json?.data as T;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#34343c] bg-[#17171c] p-4 ${className}`}>{children}</section>;
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "red" | "amber" | "green" }) {
  const color = tone === "red" ? "text-[#ff8a94]" : tone === "amber" ? "text-[#ffd08a]" : tone === "green" ? "text-[#86efac]" : "text-white";
  return (
    <div className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
      <p className="text-xs font-semibold text-[#b8b8bf]">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[#b8b8bf]">{hint}</p> : null}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  busy,
  tone = "ghost",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  tone?: "primary" | "ghost" | "danger" | "success";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls =
    tone === "primary"
      ? "bg-[#d11a2a] text-white hover:bg-[#e3263a]"
      : tone === "success"
        ? "border border-[#22c55e]/60 bg-[#14532d] text-[#bbf7d0] hover:bg-[#166534]"
        : tone === "danger"
          ? "border border-[#ff5a66]/50 text-[#ffd0d4] hover:bg-[#3a1015]"
          : "border border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10";
  return (
    <button type={type} onClick={onClick} disabled={busy || disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${cls}`}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "green" | "red" | "amber" | "blue" }) {
  const cls =
    tone === "green"
      ? "border-[#22c55e]/50 bg-[#14532d]/60 text-[#bbf7d0]"
      : tone === "red"
        ? "border-[#ff5a66]/50 bg-[#3f1d22] text-[#fecdd3]"
        : tone === "amber"
          ? "border-[#f5a742]/50 bg-[#78350f]/50 text-[#fde68a]"
          : tone === "blue"
            ? "border-[#60a5fa]/50 bg-[#1e3a5f] text-[#bfdbfe]"
            : "border-[#4a4a54] bg-white/[0.06] text-[#e4e4e8]";
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-[#e4e4e8]">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "h-11 w-full rounded-lg border border-[#3a3a42] bg-black/30 px-3 text-sm text-white outline-none focus-visible:border-[#ff5a66] focus-visible:ring-2 focus-visible:ring-[#ff5a66]/40";

export function Notice({ message }: { message: { tone: "error" | "ok"; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-[#ff5a66]/50 bg-[#3a1015] text-[#ffd0d4]" : "border-[#22c55e]/40 bg-[#0f2a1a] text-[#bbf7d0]"}`}>
      {message.text}
    </p>
  );
}

export const TICKET_LABEL: Record<string, string> = { queue: "Menunggu Mitra", accepted: "Diterima", cooking: "Diproses", ready: "Siap Diambil", delivered: "Diantar", rejected: "Ditolak", cancelled: "Dibatalkan" };
export const TICKET_TONE: Record<string, "default" | "green" | "red" | "amber" | "blue"> = { queue: "amber", accepted: "blue", cooking: "blue", ready: "green", delivered: "default", rejected: "red", cancelled: "red" };
export const SETTLEMENT_LABEL: Record<string, string> = { draft: "Draft", submitted: "Diajukan", approved: "Disetujui", partially_paid: "Dibayar sebagian", paid: "Lunas", disputed: "Sengketa", cancelled: "Dibatalkan" };
