"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";

import type { ReadinessItem, ReadinessStatus } from "@/lib/garage-payroll-readiness";

// Cek kesiapan operasional payroll: daftar hal yang harus beres sebelum absen
// & gajian dipakai sungguhan, lengkap dengan tautan ke tempat memperbaikinya.

type Data = { ready: boolean; items: ReadinessItem[] };

const STATUS: Record<ReadinessStatus, { label: string; tone: string; border: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "Beres", tone: "text-[var(--garage-fg)]", border: "border-[var(--garage-line)]", Icon: CheckCircle2 },
  warn: { label: "Perhatikan", tone: "text-[var(--garage-amber)]", border: "border-[var(--garage-amber)]", Icon: AlertTriangle },
  todo: { label: "Belum", tone: "text-[var(--garage-red-bright)]", border: "border-[var(--garage-red-bright)]", Icon: CircleDashed },
};

export function PayrollReadinessPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/readiness", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat cek kesiapan.");
      setData(json.data as Data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const todo = data?.items.filter((i) => i.status === "todo").length ?? 0;
  const warn = data?.items.filter((i) => i.status === "warn").length ?? 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Cek Kesiapan</h1>
          <p className="text-base text-[var(--garage-dim)]">
            Semua harus &quot;Beres&quot; sebelum absen & gajian dipakai sungguhan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--garage-line-2)] px-3 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
          Periksa ulang
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white">
          {error}
        </p>
      )}

      {data && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-base font-semibold ${
            data.ready
              ? "border-[var(--garage-line-2)] bg-[var(--garage-bg-2)] text-[var(--garage-fg)]"
              : "border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] text-white"
          }`}
        >
          {data.ready
            ? warn > 0
              ? `Siap dipakai — ada ${warn} hal yang perlu diperhatikan.`
              : "Siap dipakai. Semua pemeriksaan beres."
            : `Belum siap — ${todo} hal harus dibereskan dulu${warn ? `, ${warn} perlu diperhatikan` : ""}.`}
        </div>
      )}

      {!data && loading && <p className="text-base text-[var(--garage-dim)]">Memeriksa…</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {data?.items.map((item) => {
          const s = STATUS[item.status];
          return (
            <li key={item.key} className={`flex flex-col gap-2 rounded-2xl border bg-[var(--garage-bg-2)] p-4 ${s.border}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <s.Icon className={`mt-0.5 size-5 shrink-0 ${s.tone}`} aria-hidden />
                  <h2 className="text-base font-semibold text-[var(--garage-fg)]">{item.label}</h2>
                </div>
                <span className={`shrink-0 text-sm font-bold uppercase tracking-wide ${s.tone}`}>{s.label}</span>
              </div>
              <p className="text-base text-[var(--garage-dim)]">{item.detail}</p>
              {item.action && item.status !== "ok" && (
                <Link
                  href={item.action.href}
                  className="flex min-h-11 w-fit items-center rounded-xl bg-[var(--garage-red)] px-4 text-base font-semibold text-white transition-colors hover:bg-[var(--garage-red-bright)]"
                >
                  {item.action.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
